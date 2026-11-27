import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Articles, StockArticles } from "./Articles.js";
import { lirePrix, nomDejaPris } from "./regles.js";

const ARTICLES = [
  {
    id: "00000000-0000-4000-8000-000000000901",
    name: "Détendeur",
    price: 3500,
    purchaseCost: 2000,
    trackStock: true,
    stockQty: 4,
    active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000902",
    name: "Tuyau gaz",
    price: 1500,
    purchaseCost: 900,
    trackStock: true,
    stockQty: 0,
    active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000903",
    name: "Recharge téléphone",
    price: 500,
    purchaseCost: 480,
    trackStock: false,
    stockQty: 0,
    active: true,
  },
];

const ui = (node: React.ReactNode, profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const bouton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("CoCoMarket", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") throw new TypeError("réseau");
      const route = url.replace("/api/v1", "");
      return route === "/catalogue/articles" ? new Response(JSON.stringify(ARTICLES)) : fakeApi(route, init);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("contrôle les prix et les noms", () => {
    expect(lirePrix("0")).toBe(0);
    expect(lirePrix("999999999")).toBe(999_999_999);
    for (const faux of ["1000000000", "1,5", "-3", ""]) expect(lirePrix(faux)).toBeNull();
    expect(nomDejaPris(" detendeur ", ARTICLES)).toBe(true);
    expect(nomDejaPris("Détendeur", ARTICLES, ARTICLES[0]?.id)).toBe(false);
  });

  it("ajoute un article une seule fois, avec avertissement de vente à perte", async () => {
    ui(<Articles />);
    expect(await screen.findByRole("rowheader", { name: "Détendeur" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Article"), "tuyau GAZ");
    expect(screen.getByText("Un article porte déjà ce nom.")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Article"));
    await userEvent.type(screen.getByLabelText("Article"), "Brûleur");
    await userEvent.type(screen.getByLabelText("Prix (FCFA)"), "1000");
    await userEvent.type(screen.getByLabelText("Coût d'achat (FCFA)"), "1200");
    expect(screen.getByText(/inférieur au coût d'achat/u)).toBeTruthy();
    await userEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(bouton("Ajouter l'article"));
    fireEvent.click(bouton("Ajouter l'article"));
    expect(await screen.findByText("Article enregistré.")).toBeTruthy();
    expect(await operations()).toHaveLength(1);
    expect((await operations())[0]?.body).toEqual({
      name: "Brûleur",
      price: 1000,
      purchaseCost: 1200,
      trackStock: true,
    });
    expect(screen.getByRole("rowheader", { name: "Brûleur" })).toBeTruthy();
  });

  it("modifie un prix, désactive, cherche et refuse un montant invalide", async () => {
    ui(<Articles />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifier Détendeur" }));
    const prix = screen.getByLabelText("Prix (FCFA)");
    await userEvent.clear(prix);
    await userEvent.type(prix, "12,5");
    expect(screen.getByText(/Montant invalide/u)).toBeTruthy();
    expect(bouton("Enregistrer l'article").disabled).toBe(true);
    await userEvent.clear(prix);
    await userEvent.type(prix, "4000");
    await userEvent.click(bouton("Enregistrer l'article"));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    await userEvent.click(bouton("Désactiver Tuyau gaz"));
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    expect((await operations())[1]?.body).toEqual({ active: false });
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("Aucun article trouvé.")).toBeTruthy();
  });

  it("le caissier consulte sans modifier ; le stock met les ruptures en tête", async () => {
    const { unmount } = ui(<Articles />, "caissier");
    expect(await screen.findByText("Non suivi")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Modifier/u })).toBeNull();
    unmount();
    ui(<StockArticles />);
    const lignes = await screen.findAllByRole("rowheader");
    expect(lignes.map((l) => l.textContent)).toEqual(["Tuyau gaz", "Détendeur"]);
    expect(screen.getByText("Rupture")).toBeTruthy();
  });

  it("crée un article suivi avec catégorie, seuil et stock de départ", async () => {
    ui(<Articles />);
    await screen.findByRole("rowheader", { name: "Détendeur" });
    await userEvent.type(screen.getByLabelText("Article"), "Brûleur");
    await userEvent.type(screen.getByLabelText("Prix (FCFA)"), "2500");
    await userEvent.type(screen.getByLabelText("Catégorie (facultatif)"), "Accessoires");
    expect(screen.queryByLabelText("Stock de départ")).toBeNull();
    await userEvent.click(screen.getByLabelText("Suivre le stock de cet article"));
    await userEvent.type(screen.getByLabelText("Stock de départ"), "1,5");
    expect(screen.getByRole("alert").textContent).toMatch(/Quantité invalide/u);
    expect(bouton("Ajouter l'article").disabled).toBe(true);
    await userEvent.clear(screen.getByLabelText("Stock de départ"));
    await userEvent.type(screen.getByLabelText("Stock de départ"), "8");
    await userEvent.type(screen.getByLabelText(/Seuil de stock bas/u), "3");
    await userEvent.click(bouton("Ajouter l'article"));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toMatchObject({
      category: "Accessoires",
      lowThreshold: 3,
      initialQty: 8,
      trackStock: true,
    });
    await userEvent.type(screen.getByRole("searchbox"), "accessoires");
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
  });

  it("modifie le seuil d'un article suivi, sans stock de départ", async () => {
    ui(<Articles />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifier Détendeur" }));
    expect(screen.queryByLabelText("Stock de départ")).toBeNull();
    await userEvent.type(screen.getByLabelText(/Seuil de stock bas/u), "5");
    await userEvent.click(bouton("Enregistrer l'article"));
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toMatchObject({ lowThreshold: 5, category: "" });
    expect((await operations())[0]?.body).not.toHaveProperty("initialQty");
  });
});
