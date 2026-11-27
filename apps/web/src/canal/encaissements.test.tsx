import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Encaissements } from "./Encaissements.js";
import { annulables, jourActivite, nouvelleEcheance, totalEncaisse } from "./regles.js";

const ui = (profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <Encaissements />
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();

/** Lecture possible, envoi impossible ; `retouche` permet de modifier une réponse. */
function serveur(retouche: (route: string, corps: unknown) => unknown = (_r, c) => c) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") throw new TypeError("réseau");
    const route = url.replace("/api/v1", "");
    const reponse = await fakeApi(route, init);
    return new Response(JSON.stringify(retouche(route, await reponse.json())), { status: reponse.status });
  });
}

async function choisir(nom: RegExp) {
  const liste = await screen.findByLabelText("Abonné");
  const option = await screen.findByRole("option", { name: nom });
  await userEvent.selectOptions(liste, option);
}

describe("règles des encaissements Canal+", () => {
  it("prolonge depuis l'échéance en cours, sinon depuis le jour du paiement", () => {
    expect(nouvelleEcheance("2026-12-10", "2026-11-27", 1)).toBe("2027-01-10");
    expect(nouvelleEcheance("2026-11-01", "2026-11-27", 1)).toBe("2026-12-27");
    expect(nouvelleEcheance(null, "2027-01-31", 1)).toBe("2027-02-28");
    expect(jourActivite(new Date("2026-11-27T23:30:00.000Z"))).toBe("2026-11-28");
  });

  it("n'autorise que le dernier encaissement de chaque abonné et neutralise les annulations", () => {
    const l = (
      id: string,
      subscriberId: string,
      plus: Partial<{ cancelled: boolean; reversalOf: string }> = {},
    ) => ({
      id,
      subscriberId,
      amount: 100,
      cancelled: false,
      reversalOf: null,
      ...plus,
    });
    const lignes = [
      l("3", "a", { reversalOf: "2" }),
      l("2", "a", { cancelled: true }),
      l("1", "a"),
      l("0", "b"),
      l("x", "b"),
    ];
    expect([...annulables(lignes)]).toEqual(["1", "0"]);
    expect(totalEncaisse(lignes)).toBe(300);
  });
});

describe("écran des encaissements", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("range un encaissement dans la file, même hors ligne, et propose le reçu WhatsApp", async () => {
    ui();
    await choisir(/Atangana Rose/u);
    expect(screen.getByText(/Nouvelle échéance/u)).toBeTruthy();
    const bouton = screen.getByRole("button", { name: /^Encaisser 10/u });
    // Double clic : une seule opération.
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    expect(await screen.findByText(/Encaissement enregistré/u)).toBeTruthy();
    const ops = await operations();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.syncType).toBe("canal_payment");
    expect(ops[0]?.body).toMatchObject({ paymentMethod: "cash" });
    expect(screen.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href")).toContain(
      "wa.me/237690000001",
    );
    // Tant que l'envoi attend, pas de second encaissement pour la même personne.
    await choisir(/Atangana Rose/u);
    expect(await screen.findByText(/attend déjà l'envoi/u)).toBeTruthy();
  });

  it("demande confirmation si l'abonné a déjà payé aujourd'hui, et envoie la formule changée", async () => {
    ui();
    await choisir(/Essomba Jean/u);
    const bouton = () => screen.getByRole("button", { name: /^Encaisser \d/u }) as HTMLButtonElement;
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeTruthy());
    expect(bouton().disabled).toBe(true);
    await userEvent.selectOptions(
      screen.getByLabelText("Formule"),
      screen.getByRole("option", { name: /Évasion/u }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Orange Money" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(bouton());
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toMatchObject({
      paymentMethod: "orange_money",
      formulaId: expect.any(String),
    });
  });

  it("bloque l'encaissement quand la caisse du mode choisi est en stand-by", async () => {
    serveur((route, corps) =>
      route === "/cash/registers"
        ? (corps as { id: string }[]).map((c) => (c.id === "canal_om" ? { ...c, active: false } : c))
        : corps,
    );
    ui();
    await choisir(/Atangana Rose/u);
    await userEvent.click(screen.getByRole("radio", { name: "Orange Money" }));
    expect(await screen.findByText(/en stand-by/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Encaisser \d/u }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("annule avec un motif obligatoire ; le total baisse aussitôt", async () => {
    ui();
    await userEvent.click(await screen.findByRole("button", { name: "Annuler Essomba Jean" }));
    const confirmer = screen.getByRole("button", { name: "Confirmer l'annulation" }) as HTMLButtonElement;
    await userEvent.type(screen.getByLabelText(/Motif de l'annulation/u), "abc");
    expect(confirmer.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Motif de l'annulation/u), " erreur de saisie");
    await userEvent.click(confirmer);
    expect(await screen.findByText("Annulé")).toBeTruthy();
    expect((await operations())[0]?.path).toMatch(/\/canal\/payments\/.+\/cancel$/u);
    expect(screen.queryByRole("button", { name: "Annuler Essomba Jean" })).toBeNull();
  });

  it("le caissier encaisse mais n'annule pas ; une autre date recharge le journal", async () => {
    ui("caissier");
    expect(await screen.findByRole("rowheader", { name: "Essomba Jean" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Annuler/u })).toBeNull();
    serveur((route, corps) => (route.startsWith("/canal/payments") ? [] : corps));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-01" } });
    expect(await screen.findByText("Aucun encaissement à cette date.")).toBeTruthy();
  });
});
