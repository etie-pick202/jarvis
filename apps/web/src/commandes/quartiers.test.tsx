import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Quartiers } from "./Quartiers.js";

const ui = (profil: "pdg" | "gerant" | "caissier" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <Quartiers />
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const zone = (nom: string) => within(screen.getByRole("form", { name: nom }));

describe("quartiers et réglages de la boutique", () => {
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

  it("ajoute un quartier sous le plafond et le désactive", async () => {
    ui();
    await screen.findByRole("button", { name: "Désactiver Quartier Essai Nord" });
    await screen.findByRole("form", { name: "Nouveau quartier" });
    const fiche = zone("Nouveau quartier");
    const ajouter = fiche.getByRole("button", { name: "Ajouter le quartier" }) as HTMLButtonElement;
    await userEvent.type(fiche.getByLabelText("Quartier"), "quartier essai nord");
    expect(fiche.getByText("Ce quartier existe déjà.")).toBeTruthy();
    await userEvent.clear(fiche.getByLabelText("Quartier"));
    await userEvent.type(fiche.getByLabelText("Quartier"), "Quartier Essai Est");
    await userEvent.type(fiche.getByLabelText("Frais par bouteille"), "900");
    await waitFor(() => expect(fiche.getByRole("alert").textContent).toContain("plafond"));
    await userEvent.clear(fiche.getByLabelText("Frais par bouteille"));
    await userEvent.type(fiche.getByLabelText("Frais par bouteille"), "500");
    fireEvent.click(ajouter);
    fireEvent.click(ajouter);
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Désactiver Quartier Essai Nord" }));
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    expect((await operations())[0]?.body).toEqual({ name: "Quartier Essai Est", feePerBottle: 500 });
  });

  it("enregistre les réglages et le plafond, avec contrôle de l'heure", async () => {
    ui();
    await screen.findByRole("form", { name: "Réglages de la boutique" });
    const r = zone("Réglages de la boutique");
    const heure = r.getByLabelText(/^Heure de la confirmation/u);
    await userEvent.clear(heure);
    await userEvent.type(heure, "25:00");
    expect(r.getByRole("alert").textContent).toContain("HH:MM");
    await userEvent.clear(heure);
    await userEvent.type(heure, "19:00");
    await userEvent.click(r.getByRole("button", { name: "Enregistrer les réglages" }));
    expect(await r.findByText("Réglages enregistrés.")).toBeTruthy();
    const p = zone("Plafond des frais de livraison (FCFA)");
    await userEvent.clear(p.getByRole("textbox"));
    await userEvent.click(p.getByRole("button", { name: "Enregistrer le plafond" }));
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    expect((await operations())[0]?.body).toMatchObject({ eveningCountTime: "19:00", minimumOrder: 2000 });
    expect((await operations())[1]?.body).toEqual({ ceiling: null });
  });

  it("le gérant ne règle pas le plafond ; le caissier consulte", async () => {
    const { unmount } = ui("gerant");
    expect(await screen.findByRole("form", { name: "Réglages de la boutique" })).toBeTruthy();
    expect(screen.queryByRole("form", { name: /^Plafond/u })).toBeNull();
    unmount();
    ui("caissier");
    expect(await screen.findByRole("rowheader", { name: "Quartier Essai Nord" })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
