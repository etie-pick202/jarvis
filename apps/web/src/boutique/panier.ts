import type { PublicCatalogue } from "@jarvis/shared";

/** Limites reprises du contrat de commande : 20 lignes au plus. */
export const LIGNES_MAX = 20;
export const QUANTITE_MAX = 99;
const CLE = "jarvis.boutique.panier";

export interface Produit {
  cle: string;
  genre: "gaz" | "article";
  nom: string;
  marque?: string;
  format?: string;
  prix: number;
  disponible: boolean;
}

/** Quantités par produit ; le prix vient toujours du catalogue du moment. */
export type Panier = Record<string, number>;

export function produits(c: PublicCatalogue): Produit[] {
  return [
    ...c.gas.map((g) => ({
      cle: `gaz:${g.brandId}:${g.formatId}`,
      genre: "gaz" as const,
      nom: `Gaz ${g.brandName} ${g.formatLabel}`,
      marque: g.brandName,
      format: g.formatLabel,
      prix: g.price,
      disponible: g.available,
    })),
    ...c.articles.map((a) => ({
      cle: `article:${a.id}`,
      genre: "article" as const,
      nom: a.name,
      prix: a.price,
      disponible: a.available,
    })),
  ];
}

export function changer(panier: Panier, cle: string, quantite: number): Panier {
  const q = Math.min(QUANTITE_MAX, Math.max(0, quantite));
  const { [cle]: _ancien, ...reste } = panier;
  if (q === 0) return reste;
  if (!(cle in panier) && Object.keys(panier).length >= LIGNES_MAX) return panier;
  return { ...panier, [cle]: q };
}

export interface Total {
  lignes: { produit: Produit; quantite: number; montant: number }[];
  /** Produits du panier devenus indisponibles ou retirés du catalogue. */
  perdus: string[];
  produits: number;
  bouteilles: number;
  livraison: number;
  total: number;
}

/** Les frais de livraison se comptent par bouteille de gaz ; les articles n'en portent pas. */
export function calculer(panier: Panier, liste: readonly Produit[], fraisParBouteille: number): Total {
  const lignes: Total["lignes"] = [];
  const perdus: string[] = [];
  for (const [cle, quantite] of Object.entries(panier)) {
    const produit = liste.find((p) => p.cle === cle);
    if (!produit?.disponible) perdus.push(cle);
    else lignes.push({ produit, quantite, montant: produit.prix * quantite });
  }
  const sousTotal = lignes.reduce((n, l) => n + l.montant, 0);
  const bouteilles = lignes.reduce((n, l) => n + (l.produit.genre === "gaz" ? l.quantite : 0), 0);
  const livraison = bouteilles * fraisParBouteille;
  return { lignes, perdus, produits: sousTotal, bouteilles, livraison, total: sousTotal + livraison };
}

export function lirePanier(): Panier {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE) ?? "{}");
    if (typeof brut !== "object" || brut === null) return {};
    return Object.fromEntries(
      Object.entries(brut).filter((e): e is [string, number] => Number.isInteger(e[1]) && Number(e[1]) > 0),
    );
  } catch {
    return {};
  }
}

export const garderPanier = (p: Panier): void => localStorage.setItem(CLE, JSON.stringify(p));
