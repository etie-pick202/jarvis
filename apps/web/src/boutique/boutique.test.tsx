import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { Boutique } from "./Boutique.js";
import { calculer, changer, lirePanier, type Produit, produits } from "./panier.js";

const ui = () =>
  render(
    <I18nProvider initial="fr">
      <MemoryRouter>
        <Boutique />
      </MemoryRouter>
    </I18nProvider>,
  );

const texte = () => document.body.textContent?.replace(/\s/gu, " ") ?? "";
const plus = (nom: string) => userEvent.click(screen.getByRole("button", { name: `Une de plus : ${nom}` }));

describe("panier", () => {
  beforeEach(() => localStorage.clear());
  const gaz: Produit = { cle: "gaz:a", genre: "gaz", nom: "Gaz", prix: 1000, disponible: true };
  const article: Produit = { cle: "article:b", genre: "article", nom: "Tuyau", prix: 500, disponible: true };

  it("compte la livraison par bouteille de gaz seulement et écarte l'indisponible", () => {
    const t = calculer({ "gaz:a": 2, "article:b": 1, "gaz:parti": 1 }, [gaz, article], 400);
    expect(t).toMatchObject({
      produits: 2500,
      bouteilles: 2,
      livraison: 800,
      total: 3300,
      perdus: ["gaz:parti"],
    });
  });

  it("borne les quantités et le nombre de lignes", () => {
    expect(changer({}, "x", 500)).toEqual({ x: 99 });
    expect(changer({ x: 1 }, "x", 0)).toEqual({});
    const plein = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, 1]));
    expect(changer(plein, "de-trop", 1)).toBe(plein);
    expect(changer(plein, "p0", 3).p0).toBe(3);
  });

  it("ignore un panier abîmé", () => {
    for (const [brut, attendu] of [
      ["pas du json", {}],
      ["null", {}],
      ['{"a":2,"b":-1,"c":"x"}', { a: 2 }],
    ] as const) {
      localStorage.setItem("jarvis.boutique.panier", brut);
      expect(lirePanier()).toEqual(attendu);
    }
    expect(produits({ gas: [], articles: [], neighbourhoods: [], shop: {} as never })).toEqual([]);
  });
});

describe("vitrine publique", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("remplit le panier et calcule le total avec la livraison du quartier", async () => {
    ui();
    expect(await screen.findByText("Votre panier est vide.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+237690000000" }).getAttribute("href")).toBe(
      "tel:+237690000000",
    );
    await plus("Gaz OLA 12,5 kg");
    await plus("Gaz OLA 12,5 kg");
    expect(texte()).toContain("14 400 FCFA");
    // La barre du bas rappelle le total et conduit au panier.
    await userEvent.click(screen.getByRole("button", { name: /^Voir le panier · /u }));
    await userEvent.selectOptions(screen.getByLabelText("Quartier"), "Quartier Essai Sud");
    expect(texte()).toContain("14 800 FCFA");
    await userEvent.click(screen.getByRole("radio", { name: "Retrait en boutique" }));
    expect(texte()).toContain("13 600 FCFA");
    expect(screen.queryByLabelText("Quartier")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Une de moins : Gaz OLA 12,5 kg" }));
    expect(lirePanier()).toMatchObject({
      [`gaz:${"00000000-0000-4000-8000-000000000101"}:00000000-0000-4000-8000-000000000201`]: 1,
    });
  });

  it("une marque en rupture n'est pas commandable et un panier périmé est signalé", async () => {
    localStorage.setItem("jarvis.boutique.panier", '{"gaz:disparu":1}');
    ui();
    expect((await screen.findByRole("alert")).textContent).toContain("n'est plus disponible");
    expect(screen.queryByRole("button", { name: "Une de plus : Gaz TRADEX 12,5 kg" })).toBeNull();
    expect(screen.getByText("Indisponible")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Le retirer" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
