import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { Cloture } from "./caisse/Cloture.js";
import { Soldes } from "./caisse/Soldes.js";
import { Echanges } from "./gaz/Echanges.js";
import { I18nProvider } from "./i18n/index.js";
import { db } from "./offline/db.js";
import { Audit, TableauDeBord, Validations } from "./pilot/Pilot.js";
import { NouvelleVente } from "./vente/NouvelleVente.js";

const ui = (node: React.ReactNode, profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

describe("lectures du backend", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("le tableau de bord montre la marge, les alertes de stock et les notifications", async () => {
    ui(<TableauDeBord />);
    expect(await screen.findByText(/-610 FCFA \(-2,99 %\)/u)).toBeTruthy();
    expect(screen.getByText("Marques en alerte de stock")).toBeTruthy();
    expect(screen.getByText("Notifications non lues")).toBeTruthy();
    expect(screen.queryByText("Livraisons en cours")).toBeNull();
  });

  it("les soldes montrent le fond de caisse du matin", async () => {
    ui(<Soldes />);
    expect(await screen.findByText("Fond du matin : 180 000 FCFA")).toBeTruthy();
  });

  it("la clôture suit le seuil réglé : un petit écart passe sans justification, un grand non", async () => {
    ui(<Cloture />);
    expect(await screen.findByText(/au-delà d'un écart de 500 FCFA/u)).toBeTruthy();
    await screen.findByText("Ventes en espèces");
    const champ = screen.getByLabelText("Ventes en espèces : Comptage");
    await userEvent.type(champ, "215000"); // -300 : sous le seuil
    expect(screen.queryByLabelText("Ventes en espèces : Justification de l'écart")).toBeNull();
    await userEvent.clear(champ);
    await userEvent.type(champ, "214000"); // -1 300 : au-delà
    expect(screen.getByLabelText("Ventes en espèces : Justification de l'écart")).toBeTruthy();
  });

  it("le PDG refuse un comptage avec un motif d'au moins cinq caractères", async () => {
    ui(<Validations />);
    expect(await screen.findByText(/^Gérant · /u)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Refuser" }));
    const confirmer = screen.getByRole("button", { name: "Confirmer le refus" }) as HTMLButtonElement;
    await userEvent.type(screen.getByLabelText("Motif du refus"), "Non");
    expect(confirmer.disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText("Motif du refus"));
    await userEvent.type(screen.getByLabelText("Motif du refus"), "Recompter les BOCOM");
    await userEvent.click(confirmer);
    await vi.waitFor(async () => {
      const [op] = await db.outbox.toArray();
      expect(op?.path).toBe("/inventory/00000000-0000-4000-8000-000000000501/reject");
      expect(op?.body).toEqual({ reason: "Recompter les BOCOM" });
    });
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
  });

  it("le refus peut être abandonné", async () => {
    ui(<Validations />);
    await userEvent.click(await screen.findByRole("button", { name: "Refuser" }));
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(screen.getByRole("button", { name: "Valider" })).toBeTruthy();
    expect(await db.outbox.count()).toBe(0);
  });

  it("l'audit nomme l'auteur, « Système » pour une action automatique", async () => {
    ui(<Audit />);
    expect(await screen.findByText("Gérant")).toBeTruthy();
    expect(screen.getByText("Système")).toBeTruthy();
  });

  it("un échange à valeur inconnue est marqué à régulariser", async () => {
    ui(<Echanges />);
    expect(await screen.findByText("À régulariser")).toBeTruthy();
  });

  it("la vente prévient quand l'écart d'un échange ne peut pas être calculé", async () => {
    ui(<NouvelleVente />, "gerant");
    await userEvent.click(await screen.findByRole("radio", { name: /OLA/u }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Échange de bouteille vide" }));
    await userEvent.selectOptions(screen.getByLabelText("Marque de la bouteille rapportée"), "BOCOM");
    expect(screen.getByRole("status").textContent).toContain("sera régularisé par le PDG");
    await userEvent.selectOptions(screen.getByLabelText("Marque de la bouteille rapportée"), "OLA");
    expect(screen.queryByText(/sera régularisé/u)).toBeNull();
  });
});
