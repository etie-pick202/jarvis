import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";

/** Chaque écran chargé à la demande doit s'ouvrir depuis son adresse, avec son titre. */
const ROUTES: [string, string][] = [
  ["/caisse/soldes", "Soldes des caisses"],
  ["/caisse/depenses", "Nouvelle dépense"],
  ["/caisse/transferts", "Transfert entre caisses"],
  ["/caisse/cloture", "Clôture du jour"],
  ["/canal/abonnes", "Abonnés Canal+"],
  ["/canal/echeances", "Échéances"],
  ["/canal/rappels", "Rappels"],
  ["/gaz/stock", "Stock de gaz par marque"],
  ["/gaz/echanges", "Échanges entre marques"],
  ["/gaz/fournisseurs", "Fournisseurs"],
  ["/gaz/receptions", "Réception fournisseur"],
  ["/gaz/inventaire", "Inventaire hebdomadaire"],
  ["/pilot/tableau", "Tableau de bord"],
  ["/pilot/alertes", "Alertes"],
  ["/pilot/validations", "Validations"],
  ["/pilot/audit", "Journal d'audit"],
  ["/rapport/clients", "Statistiques clients"],
  ["/rapport/journal", "Journal de caisse"],
  ["/rapport/x", "X de caisse"],
  ["/rapport/gaz", "Situation gaz"],
  ["/rapport/exports", "Exports"],
];

describe("écrans chargés à la demande", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "jarvis.session",
      JSON.stringify({ userId: "u1", nom: "Direction", profils: ["pdg"], profilActif: "pdg" }),
    );
    setFakeUser("pdg");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(ROUTES)("%s s'ouvre avec son titre", async (chemin, titre) => {
    render(
      <I18nProvider initial="fr">
        <SessionProvider>
          <MemoryRouter initialEntries={[chemin]}>
            <App />
          </MemoryRouter>
        </SessionProvider>
      </I18nProvider>,
    );
    // Le premier écran paie le chargement à la demande de son module : délai large pour une machine lente.
    expect(await screen.findByRole("heading", { level: 1, name: titre }, { timeout: 8000 })).toBeTruthy();
  });
});
