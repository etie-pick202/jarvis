import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";

/** Écrans des services (lots 2 et 3) : chacun doit s'ouvrir depuis son adresse, avec son titre. */
const ROUTES: [string, string][] = [
  ["/vente/nouvelle", "Nouvelle vente"],
  ["/vente/commandes", "Commandes en ligne"],
  ["/vente/historique", "Historique"],
  ["/vente/clients", "Clients"],
  ["/canal/encaissements", "Encaissements"],
  ["/money/operations", "Dépôts et retraits"],
  ["/money/float", "Float"],
  ["/money/commissions", "Commissions"],
  ["/market/articles", "Articles"],
  ["/market/stock", "Stock"],
  ["/livre/file", "Commandes en ligne"],
  ["/livre/historique", "Historique"],
  ["/config/utilisateurs", "Utilisateurs et droits"],
  ["/config/caisses", "Caisses"],
  ["/config/langue", "Langue"],
];

describe("écrans des services chargés à la demande", () => {
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
