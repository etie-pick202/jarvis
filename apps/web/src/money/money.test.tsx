import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Operations } from "./Operations.js";
import { Commissions, Float } from "./Reglages.js";
import { lireTaux, referenceDejaVue, soldeInsuffisant } from "./regles.js";

const ui = (node: React.ReactNode, profil: "pdg" | "gerant" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <MemoryRouter>{node}</MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const bouton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

async function saisir(montant: string, reference: string) {
  await userEvent.type(screen.getByLabelText(/^Montant/u), montant);
  await userEvent.type(screen.getByLabelText("Téléphone du client"), "690000022");
  await userEvent.type(screen.getByLabelText("Référence de la transaction"), reference);
}

describe("règles Orange Money et MoMo", () => {
  it("lit un taux en pourcentage vers des points de base", () => {
    expect(lireTaux("1,5")).toBe(150);
    expect(lireTaux("0.25")).toBe(25);
    expect(lireTaux("100")).toBe(10_000);
    for (const faux of ["101", "1,234", "-1", "", "abc"]) expect(lireTaux(faux)).toBeNull();
  });

  it("refuse un solde négatif et une référence déjà vue chez le même opérateur", () => {
    expect(soldeInsuffisant("deposit", 100, { float: 50, especes: 1000 })).toBe(true);
    expect(soldeInsuffisant("withdrawal", 100, { float: 50, especes: 1000 })).toBe(false);
    expect(soldeInsuffisant("withdrawal", 100, {})).toBe(false);
    const vues = [{ operator: "momo", reference: "AB-1" }];
    expect(referenceDejaVue(" ab-1 ", "momo", vues)).toBe(true);
    expect(referenceDejaVue("AB-1", "orange_money", vues)).toBe(false);
  });
});

describe("écrans CoCoMoney", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("range un dépôt hors ligne une seule fois, puis refuse la même référence", async () => {
    ui(<Operations />);
    expect(await screen.findByRole("rowheader", { name: /OM-0001/u })).toBeTruthy();
    await saisir("5000", "OM-0002");
    const valider = bouton("Enregistrer");
    fireEvent.click(valider);
    fireEvent.click(valider);
    expect(await screen.findByText("Opération enregistrée.")).toBeTruthy();
    expect(await operations()).toHaveLength(1);
    expect((await operations())[0]?.body).toMatchObject({
      operator: "orange_money",
      kind: "deposit",
      amount: 5000,
    });
    await saisir("5000", "om-0002");
    expect(await screen.findByText(/déjà enregistrée pour cet opérateur/u)).toBeTruthy();
    expect(bouton("Enregistrer").disabled).toBe(true);
  });

  it("bloque float insuffisant, montant extrême et opérateur en stand-by", async () => {
    ui(<Operations />);
    await screen.findByRole("rowheader", { name: /OM-0001/u });
    await saisir("300000", "OM-0009");
    expect(await screen.findByText(/Float insuffisant/u)).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Retrait" }));
    expect(await screen.findByText(/Pas assez d'espèces/u)).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/^Montant/u), "00000");
    expect(screen.getByText(/Montant trop grand/u)).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "MoMo" }));
    expect(screen.getByText(/en stand-by/u)).toBeTruthy();
    expect(bouton("Enregistrer").disabled).toBe(true);
  });

  it("annule une opération avec un motif", async () => {
    ui(<Operations />);
    await userEvent.click(await screen.findByRole("button", { name: "Annuler OM-0001" }));
    await userEvent.click(bouton("Retour"));
    await userEvent.click(bouton("Annuler OM-0001"));
    await userEvent.type(screen.getByLabelText(/Motif de l'annulation/u), "mauvais numéro");
    await userEvent.click(bouton("Confirmer l'annulation"));
    expect(await screen.findByText("Annulé")).toBeTruthy();
    expect((await operations())[0]?.path).toMatch(/cancel$/u);
  });

  it("seul le PDG active une caisse de transaction", async () => {
    const { unmount } = ui(<Float />);
    expect(await screen.findByText(/Seul le PDG active/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Activer MoMo" })).toBeNull();
    unmount();
    ui(<Float />, "pdg");
    await userEvent.click(await screen.findByRole("button", { name: "Activer MoMo" }));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]).toMatchObject({
      method: "PATCH",
      path: "/cash/registers/transaction_momo",
      body: { active: true },
    });
    expect(await screen.findByRole("button", { name: "Désactiver MoMo" })).toBeTruthy();
  });

  it("le PDG règle les commissions ; un taux invalide bloque ; le gérant consulte", async () => {
    const { unmount } = ui(<Commissions />);
    expect(await screen.findByText("Seul le PDG modifie les taux.")).toBeTruthy();
    unmount();
    ui(<Commissions />, "pdg");
    const champ = (await screen.findByLabelText("MoMo : Dépôt (%)")) as HTMLInputElement;
    await userEvent.clear(champ);
    await userEvent.type(champ, "200");
    expect(screen.getByText(/Taux invalide/u)).toBeTruthy();
    await userEvent.clear(champ);
    await userEvent.type(champ, "1,5");
    await userEvent.click(bouton("Enregistrer les taux"));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toMatchObject({ momo: { deposit: 150, withdrawal: 0 } });
    expect(await screen.findByText("Taux enregistrés.")).toBeTruthy();
  });
});
