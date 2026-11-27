import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";

const SESSIONS = {
  pdg: { userId: "u1", nom: "Direction", profils: ["pdg"], profilActif: "pdg" },
  gerant: { userId: "u2", nom: "Gérant", profils: ["gerant"], profilActif: "gerant" },
};

function ouvrir(chemin: string, qui: keyof typeof SESSIONS) {
  localStorage.setItem("jarvis.session", JSON.stringify(SESSIONS[qui]));
  setFakeUser(qui);
  return render(
    <I18nProvider initial="fr">
      <SessionProvider>
        <MemoryRouter initialEntries={[chemin]}>
          <App />
        </MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );
}

const attendre = { timeout: 8000 };

describe("base neuve", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("jarvis.fake-vide", "1");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("le tableau de bord du PDG liste ce qu'il reste à saisir", async () => {
    ouvrir("/pilot/tableau", "pdg");
    expect(await screen.findByRole("heading", { name: "Mise en route" }, attendre)).toBeTruthy();
    expect(screen.getByText(/0 \/ 4/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Compléter : Marques et formats" }).getAttribute("href")).toBe(
      "/config/marques",
    );
    expect(screen.getByRole("link", { name: "Compléter : Comptes de l'équipe" })).toBeTruthy();
  });

  it("la liste n'apparaît ni au gérant ni sur une base remplie", async () => {
    const { unmount } = ouvrir("/pilot/tableau", "gerant");
    expect(await screen.findByText("Ventes du jour", {}, attendre).catch(() => null)).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Mise en route" })).toBeNull();
    unmount();

    localStorage.clear();
    ouvrir("/pilot/tableau", "pdg");
    await waitFor(
      () => expect(localStorage.getItem("jarvis.cache.v2.route-comptes")).not.toBeNull(),
      attendre,
    );
    expect(screen.queryByRole("heading", { name: "Mise en route" })).toBeNull();
  });

  it("la vente explique pourquoi il n'y a rien à vendre et mène aux prix", async () => {
    ouvrir("/vente/nouvelle", "pdg");
    expect(
      await screen.findByRole("heading", { name: "Rien à vendre pour le moment" }, attendre),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saisir les prix" }).getAttribute("href")).toBe("/config/prix");
  });

  it("qui ne peut pas saisir les prix lit qui doit le faire", async () => {
    ouvrir("/vente/nouvelle", "gerant");
    expect(await screen.findByText("Le PDG doit s'en charger.", {}, attendre)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Saisir les prix" })).toBeNull();
  });

  it("sans réseau ni catalogue sur l'appareil, la vente dit de se connecter", async () => {
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.includes("/catalogue/")
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
    ouvrir("/vente/nouvelle", "pdg");
    expect(
      await screen.findByRole("heading", { name: "Catalogue pas encore sur cet appareil" }, attendre),
    ).toBeTruthy();
  });

  it("la réception renvoie vers les fournisseurs", async () => {
    ouvrir("/gaz/receptions", "gerant");
    const lien = await screen.findByRole("link", { name: "Ajouter un fournisseur" }, attendre);
    expect(lien.getAttribute("href")).toBe("/gaz/fournisseurs");
  });

  it("le stock vide propose de créer les marques", async () => {
    ouvrir("/gaz/stock", "pdg");
    expect(await screen.findByRole("link", { name: "Créer les marques et formats" }, attendre)).toBeTruthy();
  });

  it("le menu se ferme avec Échap ou un clic ailleurs", async () => {
    ouvrir("/gaz/stock", "pdg");
    const bouton = await screen.findByRole("button", { name: "Menu" });
    await userEvent.click(bouton);
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("a");
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(bouton);
    await userEvent.click(screen.getByRole("radio", { name: "FR" }));
    expect(bouton.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(document.body);
    expect(bouton.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(bouton);
    await userEvent.click(bouton);
    expect(screen.queryByRole("button", { name: "Déconnexion" })).toBeNull();
  });
});
