import {
  type CreateSaleInput,
  DEFAULT_DELIVERY_FEE_PER_BOTTLE,
  DEFAULT_GAS_PRICE,
  TRANSPORT_CONTRIBUTION,
} from "@jarvis/shared";
import { type Article, type Client, MODES_PAIEMENT } from "../api/index.js";

export type Paiement = "especes" | "om" | "momo";
export type Reception = "comptoir" | "livraison";

export interface Panier {
  article: Article;
  quantite: number;
  reception: Reception;
  /** Marque de la bouteille vide rapportée, si échange. */
  echange: string | null;
}

/** Une vente est refusée à stock nul, ou si la quantité dépasse le stock. */
export function venteAutorisee(article: Article, quantite: number): boolean {
  return article.stock > 0 && quantite >= 1 && quantite <= article.stock;
}

export function fraisLivraison(panier: Pick<Panier, "article" | "quantite" | "reception">): number {
  return panier.reception === "livraison" && panier.article.genre === "gaz"
    ? DEFAULT_DELIVERY_FEE_PER_BOTTLE * panier.quantite
    : 0;
}

export function total(panier: Panier): number {
  return panier.article.prix * panier.quantite + fraisLivraison(panier);
}

/** Détail « gaz + contribution transport » quand le prix est celui par défaut (maquette). */
export function detailGaz(article: Article): { gaz: number; transport: number } | null {
  return article.genre === "gaz" && article.prix === DEFAULT_GAS_PRICE + TRANSPORT_CONTRIBUTION
    ? { gaz: DEFAULT_GAS_PRICE, transport: TRANSPORT_CONTRIBUTION }
    : null;
}

/**
 * Écart de valeur d'emballage d'un échange entre marques : positif = gain, négatif = perte.
 * Le client paie le même prix ; l'écart passe dans la marge. `null` si une valeur est inconnue.
 */
export function ecartEmballage(remise: Article, rapportee: Article): number | null {
  if (remise.valeurEmballage === undefined || rapportee.valeurEmballage === undefined) return null;
  return rapportee.valeurEmballage - remise.valeurEmballage;
}

/** Retrouve un client dès les premières lettres, sans tenir compte des accents ni de la casse. */
export function chercherClients(clients: readonly Client[], saisie: string, max = 5): Client[] {
  const q = normaliser(saisie.trim());
  if (q.length === 0) return [];
  return clients
    .filter(
      (c) =>
        normaliser(c.nom)
          .split(" ")
          .some((mot) => mot.startsWith(q)) || normaliser(c.nom).startsWith(q),
    )
    .slice(0, max);
}

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// toLocaleString utilise des espaces insécables (U+202F, U+00A0) que le PDF et WhatsApp rendent mal.
const ESPACES = new RegExp(`[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`, "gu");

export function formatFcfa(montant: number): string {
  return `${montant.toLocaleString("fr-FR").replace(ESPACES, " ")} FCFA`;
}

/**
 * Corps de la vente au format du contrat (`createSaleInput` de @jarvis/shared). Le serveur recalcule
 * prix, contribution transport, écart d'emballage et marge : le client n'envoie que ce qui a été choisi.
 */
export function corpsVente(
  panier: Panier,
  client: string,
  paiement: Paiement,
  marques: readonly Article[],
): CreateSaleInput {
  const { article, quantite } = panier;
  const retour = marques.find((m) => m.marque === panier.echange)?.brandId;
  const ligne: CreateSaleInput["lines"][number] =
    article.genre === "gaz" && article.brandId && article.formatId
      ? {
          kind: "gas",
          brandId: article.brandId,
          formatId: article.formatId,
          quantity: quantite,
          ...(retour ? { returnedBrandId: retour } : {}),
        }
      : { kind: "article", articleId: article.articleId ?? article.id, quantity: quantite };
  return {
    customerName: client,
    paymentMethod: MODES_PAIEMENT[paiement],
    ...(panier.reception === "livraison" && article.genre === "gaz"
      ? { deliveryFeePerBottle: DEFAULT_DELIVERY_FEE_PER_BOTTLE }
      : {}),
    lines: [ligne],
  };
}
