import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { ConfigCaisses, ConfigLangue } from "./Caisses.js";
import { Utilisateurs } from "./Utilisateurs.js";

const MOI = "00000000-0000-4000-8000-000000000001";
const ui = (node: React.ReactNode, profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: MOI, nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const envois: { route: string; methode: string; corps: Record<string, unknown> }[] = [];
function serveur(refuser?: () => Response) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const route = url.replace("/api/v1", "");
    if (init?.method && init.method !== "GET") {
      envois.push({ route, methode: init.method, corps: JSON.parse(String(init.body)) });
      if (refuser) return refuser();
      if (!route.startsWith("/auth/")) throw new TypeError("réseau");
    }
    return fakeApi(route, init);
  });
}

const operations = () => db.outbox.orderBy("createdAt").toArray();

describe("CoCoConfig", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    envois.length = 0;
    await db.outbox.clear();
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("crée un compte une seule fois, sans garder le mot de passe sur l'appareil", async () => {
    ui(<Utilisateurs />);
    const fiche = within(screen.getByRole("form", { name: "Nouveau compte" }));
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(1));
    await userEvent.type(fiche.getByLabelText("Identifiant"), "GERANT");
    expect(fiche.getByText("Cet identifiant existe déjà.")).toBeTruthy();
    await userEvent.clear(fiche.getByLabelText("Identifiant"));
    await userEvent.type(fiche.getByLabelText("Identifiant"), "essai");
    await userEvent.type(fiche.getByLabelText("Nom affiché"), "Compte Essai");
    await userEvent.type(fiche.getByLabelText("Mot de passe provisoire"), "essai-1234");
    const creer = fiche.getByRole("button", { name: "Créer le compte" }) as HTMLButtonElement;
    expect(creer.disabled).toBe(true);
    await userEvent.click(fiche.getByRole("checkbox", { name: "Caissier" }));
    fireEvent.click(creer);
    fireEvent.click(creer);
    expect(await fiche.findByText("Compte créé.")).toBeTruthy();
    expect(envois).toHaveLength(1);
    expect(envois[0]?.corps).toMatchObject({ username: "essai", roles: ["caissier"] });
    expect(await operations()).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain("essai-1234");
  });

  it("désactive un compte, change ses profils et montre un refus du serveur", async () => {
    ui(<Utilisateurs />);
    const autre = within(await screen.findByRole("article", { name: /Caiss/u }));
    await userEvent.click(autre.getByRole("button", { name: "Désactiver" }));
    expect(await autre.findByText("Compte mis à jour.")).toBeTruthy();
    expect(autre.getByText("Inactif")).toBeTruthy();
    await userEvent.click(autre.getByRole("button", { name: "Modifier" }));
    await userEvent.type(autre.getByLabelText("Nouveau mot de passe (facultatif)"), "court");
    expect((autre.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(autre.getByLabelText("Nouveau mot de passe (facultatif)"), "-assez-long");
    serveur(
      () =>
        new Response(JSON.stringify({ error: { code: "forbidden", message: "Refus essai" } }), {
          status: 403,
        }),
    );
    await userEvent.click(autre.getByRole("button", { name: "Enregistrer" }));
    expect((await autre.findByRole("alert")).textContent).toBe("Refus essai");
    serveur(() => new Response("{}", { status: 500 }));
    await userEvent.click(autre.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(autre.getByRole("alert").textContent).toContain("réessayez"));
  });

  it("le PDG ne peut ni se désactiver ni retirer son profil ; le gérant n'a pas accès", async () => {
    const { unmount } = ui(<Utilisateurs />);
    const moi = within((await screen.findAllByRole("article"))[0] as HTMLElement);
    expect(moi.queryByRole("button", { name: "Désactiver" })).toBeNull();
    await userEvent.click(moi.getByRole("button", { name: "Modifier" }));
    expect((moi.getByRole("checkbox", { name: "PDG" }) as HTMLInputElement).disabled).toBe(true);
    unmount();
    ui(<Utilisateurs />, "gerant");
    expect(screen.getByText("Seul le PDG peut modifier ces réglages.")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Nouveau compte" })).toBeNull();
  });

  it("met une caisse en veille et règle les seuils par la file d'envoi", async () => {
    ui(<ConfigCaisses />);
    await userEvent.click(await screen.findByRole("button", { name: "Désactiver Ventes en espèces" }));
    expect(await screen.findByRole("button", { name: "Activer Ventes en espèces" })).toBeTruthy();
    const champ = await screen.findByRole("textbox", { name: "Écart toléré à la clôture (FCFA)" });
    await userEvent.clear(champ);
    await userEvent.type(champ, "abc");
    expect(screen.getByRole("alert").textContent).toContain("Montant invalide");
    await userEvent.clear(champ);
    await userEvent.type(champ, "750");
    await userEvent.click(
      within(screen.getByRole("form", { name: "Écart toléré à la clôture (FCFA)" })).getByRole("button"),
    );
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    expect(await screen.findByText("Réglage enregistré.")).toBeTruthy();
    const stock = within(screen.getByRole("form", { name: "Seuil de stock bas (bouteilles pleines)" }));
    await userEvent.click(stock.getByRole("button", { name: "Enregistrer" }));
    await waitFor(async () => expect(await operations()).toHaveLength(3));
    expect((await operations()).map((o) => o.path)).toEqual([
      "/cash/registers/sales_cash",
      "/cash/closure-threshold",
      "/stock/thresholds",
    ]);
  });

  it("le gérant consulte les caisses sans modifier ; la langue se choisit ici aussi", async () => {
    const { unmount } = ui(<ConfigCaisses />, "gerant");
    expect(await screen.findByText("Ventes en espèces")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Désactiver/u })).toBeNull();
    unmount();
    ui(<ConfigLangue />);
    await userEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 1, name: "Language" })).toBeTruthy();
  });
});
