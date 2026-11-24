import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";

function renderAt(path: string, user?: "pdg" | "gerant" | "caissier" | "livreur") {
  if (user) {
    localStorage.setItem("jarvis.session", JSON.stringify(SESSIONS[user]));
    setFakeUser(user);
  }
  return render(
    <I18nProvider initial="fr">
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );
}

const SESSIONS = {
  pdg: { userId: "u1", nom: "Direction", profils: ["pdg"] },
  gerant: { userId: "u2", nom: "Gérant", profils: ["gerant", "livreur"] },
  caissier: { userId: "u3", nom: "Caissier", profils: ["caissier"] },
  livreur: { userId: "u4", nom: "Livreur", profils: ["livreur"] },
};

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envoie vers la connexion sans session, puis ouvre le premier volet", async () => {
    renderAt("/");
    await userEvent.type(await screen.findByLabelText("Identifiant"), "pdg");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "demo");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(await screen.findByRole("heading", { level: 1, name: "CoCoPilot" })).toBeTruthy();
  });

  it("refuse un mauvais mot de passe", async () => {
    renderAt("/connexion");
    await userEvent.type(await screen.findByLabelText("Identifiant"), "pdg");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "faux");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    expect((await screen.findByRole("alert")).textContent).toContain("incorrect");
  });

  it("ne montre à chaque profil que ses volets", async () => {
    renderAt("/vente/nouvelle", "caissier");
    const barres = await screen.findAllByRole("navigation", { name: "Volets" });
    const texte = barres.map((b) => b.textContent).join(" ");
    expect(texte).toContain("CoCoVente");
    expect(texte).not.toContain("CoCoRapport");
    expect(texte).not.toContain("CoCoPilot");
  });

  it("interdit un volet hors profil", async () => {
    renderAt("/rapport/journal", "caissier");
    expect((await screen.findByRole("alert")).textContent).toContain("Accès non autorisé");
  });

  it("le gérant bascule en mode livreur d'un geste, sans se reconnecter", async () => {
    renderAt("/vente/nouvelle", "gerant");
    await userEvent.click(await screen.findByRole("button", { name: "Mode livreur" }));
    expect((await screen.findAllByRole("button", { name: "Parti" })).length).toBe(2);
    expect(screen.queryByRole("navigation", { name: "Volets" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Mode gestion" }));
    expect((await screen.findAllByRole("navigation", { name: "Volets" })).length).toBeGreaterThan(0);
  });

  it("un livreur seul n'a que la liste du jour, sans bascule", async () => {
    renderAt("/", "livreur");
    expect(await screen.findByRole("heading", { name: "Livraisons du jour" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mode gestion" })).toBeNull();
  });

  it("affiche les pastilles d'action", async () => {
    renderAt("/vente/nouvelle", "gerant");
    expect((await screen.findAllByText("3")).length).toBeGreaterThan(0);
  });

  it("change de langue depuis l'écran et garde le choix", async () => {
    renderAt("/vente/nouvelle", "gerant");
    await userEvent.click(await screen.findByRole("radio", { name: "EN" }));
    expect(await screen.findByRole("heading", { level: 2, name: "New sale" })).toBeTruthy();
    expect(localStorage.getItem("jarvis.lang")).toBe("en");
  });

  it("affiche une page introuvable pour une route inconnue", async () => {
    renderAt("/inconnu/rien", "pdg");
    expect((await screen.findByRole("alert")).textContent).toContain("Page introuvable");
  });

  it("se déconnecte", async () => {
    renderAt("/vente/nouvelle", "gerant");
    await userEvent.click(await screen.findByRole("button", { name: "Déconnexion" }));
    expect(await screen.findByLabelText("Identifiant")).toBeTruthy();
    expect(localStorage.getItem("jarvis.session")).toBeNull();
  });

  it("liste les volets sous « Plus » avec leurs pastilles", async () => {
    renderAt("/plus", "gerant");
    expect(await screen.findByRole("heading", { level: 1, name: "Plus" })).toBeTruthy();
    expect((await screen.findAllByText("CoCoConfig")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("4")).length).toBeGreaterThan(0);
  });

  it("le livreur marque une livraison comme livrée, partie ou en problème", async () => {
    renderAt("/", "livreur");
    const boutons = await screen.findAllByRole("button", { name: "Livré" });
    await userEvent.click(boutons[0] as HTMLElement);
    await userEvent.click((await screen.findAllByRole("button", { name: "Parti" }))[1] as HTMLElement);
    await userEvent.click((await screen.findAllByRole("button", { name: "Problème" }))[0] as HTMLElement);
    expect(screen.getByText("En route")).toBeTruthy();
    expect(screen.getByText("Problème signalé")).toBeTruthy();
  });
});
