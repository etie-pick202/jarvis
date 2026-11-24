import { describe, expect, it } from "vitest";
import type { Article } from "../api/index.js";
import { recuPdf } from "./pdf.js";
import {
  chercherClients,
  detailGaz,
  ecartEmballage,
  formatFcfa,
  fraisLivraison,
  total,
  venteAutorisee,
} from "./regles.js";

const gaz = (marque: string, stock: number, valeurEmballage?: number): Article => ({
  id: marque.toLowerCase(),
  nom: `Gaz 12,5 kg ${marque}`,
  genre: "gaz",
  marque,
  prix: 6800,
  stock,
  valeurEmballage,
});

describe("règles de la vente", () => {
  it("refuse la vente à stock nul ou au-delà du stock", () => {
    expect(venteAutorisee(gaz("OLA", 0), 1)).toBe(false);
    expect(venteAutorisee(gaz("OLA", 2), 3)).toBe(false);
    expect(venteAutorisee(gaz("OLA", 2), 0)).toBe(false);
    expect(venteAutorisee(gaz("OLA", 2), 2)).toBe(true);
  });

  it("calcule 6 800 FCFA au comptoir et 7 200 FCFA livré pour une recharge", () => {
    const ola = gaz("OLA", 5);
    expect(total({ article: ola, quantite: 1, reception: "comptoir", echange: null })).toBe(6800);
    expect(total({ article: ola, quantite: 1, reception: "livraison", echange: null })).toBe(7200);
    expect(total({ article: ola, quantite: 2, reception: "livraison", echange: null })).toBe(14400);
    expect(detailGaz(ola)).toEqual({ gaz: 6500, transport: 300 });
  });

  it("n'ajoute pas de frais de livraison aux autres articles", () => {
    const tuyau: Article = { id: "t", nom: "Tuyau", genre: "autre", prix: 2500, stock: 3 };
    expect(fraisLivraison({ article: tuyau, quantite: 1, reception: "livraison" })).toBe(0);
    expect(detailGaz(tuyau)).toBeNull();
  });

  it("calcule l'écart d'emballage d'un échange : TOTAL rapportée, STARGAS remise = perte de 2 500", () => {
    expect(ecartEmballage(gaz("STARGAS", 1, 20000), gaz("TOTAL", 1, 17500))).toBe(-2500);
    expect(ecartEmballage(gaz("OLA", 1, 15900), gaz("TOTAL", 1, 17500))).toBe(1600);
    expect(ecartEmballage(gaz("BOCOM", 1), gaz("TOTAL", 1, 17500))).toBeNull();
  });

  it("retrouve un client dès les premières lettres, sans accent ni casse", () => {
    const clients = [
      { id: "1", nom: "Ndongo Berthe" },
      { id: "2", nom: "Éloïse Mbarga" },
    ];
    expect(chercherClients(clients, "nd").map((c) => c.id)).toEqual(["1"]);
    expect(chercherClients(clients, "ber").map((c) => c.id)).toEqual(["1"]);
    expect(chercherClients(clients, "elo").map((c) => c.id)).toEqual(["2"]);
    expect(chercherClients(clients, "  ")).toEqual([]);
  });

  it("formate les montants avec des espaces ordinaires", () => {
    expect(formatFcfa(108800)).toBe("108 800 FCFA");
  });

  it("produit un PDF valide avec le texte du reçu", () => {
    const octets = recuPdf(["COCOSAB (reçu)", "Total : 6 800 FCFA"]);
    const texte = new TextDecoder("latin1").decode(octets);
    expect(texte.startsWith("%PDF-1.4")).toBe(true);
    expect(texte).toContain("(COCOSAB \\(reçu\\)) Tj");
    expect(texte.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
