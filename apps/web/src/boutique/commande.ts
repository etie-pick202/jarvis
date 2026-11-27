import type { CreateOrderInput, PaymentMethod } from "@jarvis/shared";
import { ApiError } from "../api/client.js";
import type { Total } from "./panier.js";

export interface Coordonnees {
  nom: string;
  telephone: string;
  mode: "delivery" | "pickup";
  /** Identifiant d'un quartier connu, ou vide. */
  quartierId: string;
  autreQuartier: string;
  repere: string;
  position: { latitude: number; longitude: number } | null;
  paiement: PaymentMethod;
  reference: string;
}

/** Ce qui manque encore pour commander (clé de traduction), ou null. */
export function manque(c: Coordonnees) {
  if (c.nom.trim() === "") return "commande.manque.nom" as const;
  if (c.telephone.replace(/\D/gu, "").length < 6) return "commande.manque.telephone" as const;
  if (c.mode === "delivery" && !c.quartierId && c.autreQuartier.trim() === "") {
    return "commande.manque.quartier" as const;
  }
  const reference = c.reference.trim();
  if (c.paiement !== "cash" && reference !== "" && reference.length < 3) {
    return "commande.manque.reference" as const;
  }
  return null;
}

export function corps(c: Coordonnees, total: Total, clientRef: string): CreateOrderInput {
  const lines = total.lignes.map(({ produit, quantite }): CreateOrderInput["lines"][number] => {
    const [, premier = "", second = ""] = produit.cle.split(":");
    return produit.genre === "gaz"
      ? { kind: "gas", brandId: premier, formatId: second, quantity: quantite }
      : { kind: "article", articleId: premier, quantity: quantite };
  });
  const livraison = c.mode === "delivery";
  const reference = c.reference.trim();
  return {
    clientRef,
    customerName: c.nom.trim(),
    phone: c.telephone.trim(),
    mode: c.mode,
    ...(livraison && c.quartierId ? { neighbourhoodId: c.quartierId } : {}),
    ...(livraison && !c.quartierId ? { neighbourhoodName: c.autreQuartier.trim() } : {}),
    ...(livraison && c.repere.trim() ? { landmark: c.repere.trim() } : {}),
    ...(livraison && c.position ? c.position : {}),
    paymentMethod: c.paiement,
    ...(c.paiement !== "cash" && reference ? { paymentReference: reference } : {}),
    lines,
  };
}

export type Echec =
  | { genre: "rupture" | "refus"; message: string }
  | { genre: "reseau" | "serveur"; message: "" };

/** Un refus du serveur s'explique avec ses mots ; une panne invite à réessayer (la commande ne sera pas doublée). */
export function expliquer(erreur: unknown): Echec {
  if (!(erreur instanceof ApiError)) return { genre: "reseau", message: "" };
  if (erreur.code === "out_of_stock") return { genre: "rupture", message: erreur.message };
  if (erreur.status >= 500) return { genre: "serveur", message: "" };
  return { genre: "refus", message: erreur.message };
}

const CLE_REF = "jarvis.boutique.ref";
const CLE_SUIVI = "jarvis.boutique.suivi";

/** Gardé jusqu'à l'accusé de réception : renvoyer la même commande ne la duplique pas. */
export function referenceClient(): string {
  const gardee = localStorage.getItem(CLE_REF);
  if (gardee) return gardee;
  const neuve = crypto.randomUUID();
  localStorage.setItem(CLE_REF, neuve);
  return neuve;
}

export function commandeRecue(jeton: string): void {
  localStorage.removeItem(CLE_REF);
  localStorage.setItem(CLE_SUIVI, jeton);
}

export const dernierSuivi = (): string | null => localStorage.getItem(CLE_SUIVI);
