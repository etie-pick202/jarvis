import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Marques } from "./Marques.js";
import { Prix } from "./Prix.js";
import { lireFcfa, nomPris } from "./tarifs.js";

const ui = (node: React.ReactNode, profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const zone = (nom: string) => within(screen.getByRole("form", { name: nom }));
const bouton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("tarifs du gaz", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("contrôle montants et doublons", () => {
    expect(lireFcfa("0")).toBe(0);
    expect(lireFcfa("1000000000")).toBeNull();
    expect(nomPris(" ola ", ["OLA"])).toBe(true);
    expect(nomPris("", [""])).toBe(false);
  });

  it("ajoute une marque sans valeur relevée, modifie et désactive", async () => {
    ui(<Marques />);
    await screen.findByRole("button", { name: "Modifier OLA" });
    const fiche = zone("Nouvelle marque");
    await userEvent.type(fiche.getByLabelText("Nom de la marque"), "ola");
    expect(fiche.getByText("Ce nom existe déjà.")).toBeTruthy();
    await userEvent.clear(fiche.getByLabelText("Nom de la marque"));
    await userEvent.type(fiche.getByLabelText("Nom de la marque"), "ESSAIGAZ");
    fireEvent.click(bouton("Enregistrer la marque"));
    fireEvent.click(bouton("Enregistrer la marque"));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toEqual({ name: "ESSAIGAZ", packagingValueKnown: false });
    await userEvent.click(bouton("Modifier OLA"));
    const valeur = zone("Modifier OLA").getByLabelText("Valeur d'emballage (FCFA)");
    await userEvent.clear(valeur);
    await userEvent.type(valeur, "1,5");
    expect(zone("Modifier OLA").getByRole("alert").textContent).toContain("Montant invalide");
    await userEvent.clear(valeur);
    await userEvent.type(valeur, "16000");
    await userEvent.click(bouton("Enregistrer la marque"));
    await userEvent.click(bouton("Désactiver TRADEX"));
    await waitFor(async () => expect(await operations()).toHaveLength(3));
    expect((await operations())[1]).toMatchObject({ method: "PATCH", body: { packagingValue: 16000 } });
    expect((await operations())[2]?.body).toEqual({ active: false });
    expect(bouton("Réactiver TRADEX")).toBeTruthy();
  });

  it("ajoute un format et le désactive", async () => {
    ui(<Marques />);
    await screen.findByRole("button", { name: "Désactiver 12,5 kg" });
    const fiche = zone("Nouveau format");
    await userEvent.type(fiche.getByLabelText("Format"), "6 kg");
    await userEvent.type(fiche.getByLabelText("Poids du gaz (grammes)"), "6000");
    await userEvent.type(fiche.getByLabelText("Plafond de prix (facultatif)"), "4000");
    await userEvent.click(bouton("Ajouter le format"));
    await userEvent.click(bouton("Désactiver 12,5 kg"));
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    expect((await operations())[0]?.body).toEqual({ label: "6 kg", weightGrams: 6000, priceCeiling: 4000 });
  });

  it("change un prix : plafond respecté et vente à perte signalée", async () => {
    ui(<Prix />);
    expect((await screen.findAllByRole("row")).length).toBeGreaterThan(5);
    const fiche = zone("Changer un prix");
    await screen.findByRole("option", { name: "12,5 kg" });
    await userEvent.selectOptions(fiche.getByLabelText("Format"), "12,5 kg");
    await userEvent.selectOptions(fiche.getByLabelText("Marque"), "OLA");
    await userEvent.type(fiche.getByLabelText("Prix de la recharge"), "6500");
    await userEvent.type(fiche.getByLabelText("Coût d'achat"), "7000");
    expect(fiche.getByText(/dépasse le prix payé/u)).toBeTruthy();
    await userEvent.type(fiche.getByLabelText("Contribution transport"), "300");
    await userEvent.click(bouton("Enregistrer le prix"));
    expect(await fiche.findByText("Prix enregistré.")).toBeTruthy();
    expect((await operations())[0]?.body).toMatchObject({
      amount: 6500,
      transportContribution: 300,
      purchaseCost: 7000,
      brandId: expect.any(String),
    });
  });

  it("le gérant consulte sans modifier", async () => {
    const { unmount } = ui(<Marques />, "gerant");
    expect(await screen.findByText(/Seul le PDG/u)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    unmount();
    ui(<Prix />, "gerant");
    expect(screen.queryByRole("form")).toBeNull();
  });
});
