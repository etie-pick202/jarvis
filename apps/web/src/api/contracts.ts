/**
 * Contrat d'API côté front. Provisoire : à remplacer par les schémas Zod et types publiés
 * dans `@jarvis/shared` dès qu'ils sont fusionnés. Les écrans ne dépendent que de ce fichier.
 */
import type { Profil } from "../nav/volets.js";

export interface Health {
  status: "ok";
}

export interface Session {
  userId: string;
  nom: string;
  /** Un utilisateur peut cumuler plusieurs profils (le gérant est aussi livreur). */
  profils: Profil[];
}

/** Pastilles d'action : ce qui demande une action de l'utilisateur. */
export interface Badges {
  commandes: number;
  stockBas: number;
  echeances: number;
  validations: number;
}

export interface Livraison {
  id: string;
  client: string;
  quartier: string;
  article: string;
  montant: number;
  etat: "a_livrer" | "parti" | "livre" | "probleme";
}

export interface Article {
  id: string;
  nom: string;
  genre: "gaz" | "autre";
  /** Marque, pour le gaz. */
  marque?: string;
  /** Prix de retrait au comptoir, en FCFA entiers. */
  prix: number;
  /** Bouteilles pleines (gaz) ou unités en stock. */
  stock: number;
  /** Valeur d'emballage de la bouteille, si connue (échanges entre marques). */
  valeurEmballage?: number;
}

export interface Client {
  id: string;
  nom: string;
  telephone?: string;
}

export interface GazStock {
  marque: string;
  pleines: number;
  vides: number;
  /** Seuil d'alerte de stock bas, paramétrable. */
  seuil: number;
}

export interface Echange {
  id: string;
  date: string;
  client: string;
  remise: string;
  rapportee: string;
  /** Écart de valeur d'emballage : positif = gain, négatif = perte. */
  ecart: number | null;
}

export interface Fournisseur {
  id: string;
  nom: string;
  telephone: string;
  marques: string[];
}

export interface LoginInput {
  identifiant: string;
  motDePasse: string;
}

const PROFILS: readonly string[] = ["pdg", "gerant", "caissier", "livreur"];

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

export function parseHealth(data: unknown): Health {
  if (isRecord(data) && data.status === "ok") return { status: "ok" };
  throw new TypeError("Réponse /health invalide");
}

export function parseSession(data: unknown): Session {
  if (
    isRecord(data) &&
    typeof data.userId === "string" &&
    typeof data.nom === "string" &&
    Array.isArray(data.profils) &&
    data.profils.every((p) => typeof p === "string" && PROFILS.includes(p))
  ) {
    return { userId: data.userId, nom: data.nom, profils: data.profils as Profil[] };
  }
  throw new TypeError("Session invalide");
}

export function parseBadges(data: unknown): Badges {
  if (
    isRecord(data) &&
    typeof data.commandes === "number" &&
    typeof data.stockBas === "number" &&
    typeof data.echeances === "number" &&
    typeof data.validations === "number"
  ) {
    return {
      commandes: data.commandes,
      stockBas: data.stockBas,
      echeances: data.echeances,
      validations: data.validations,
    };
  }
  throw new TypeError("Pastilles invalides");
}

export function parseLivraisons(data: unknown): Livraison[] {
  if (!Array.isArray(data)) throw new TypeError("Livraisons invalides");
  return data.map((d): Livraison => {
    if (
      isRecord(d) &&
      typeof d.id === "string" &&
      typeof d.client === "string" &&
      typeof d.quartier === "string" &&
      typeof d.article === "string" &&
      typeof d.montant === "number" &&
      (d.etat === "a_livrer" || d.etat === "parti" || d.etat === "livre" || d.etat === "probleme")
    ) {
      return {
        id: d.id,
        client: d.client,
        quartier: d.quartier,
        article: d.article,
        montant: d.montant,
        etat: d.etat,
      };
    }
    throw new TypeError("Livraison invalide");
  });
}

export function parseCatalogue(data: unknown): Article[] {
  if (!Array.isArray(data)) throw new TypeError("Catalogue invalide");
  return data.map((d): Article => {
    if (
      isRecord(d) &&
      typeof d.id === "string" &&
      typeof d.nom === "string" &&
      (d.genre === "gaz" || d.genre === "autre") &&
      Number.isInteger(d.prix) &&
      typeof d.stock === "number"
    ) {
      return {
        id: d.id,
        nom: d.nom,
        genre: d.genre,
        marque: typeof d.marque === "string" ? d.marque : undefined,
        prix: d.prix as number,
        stock: d.stock,
        valeurEmballage: typeof d.valeurEmballage === "number" ? d.valeurEmballage : undefined,
      };
    }
    throw new TypeError("Article invalide");
  });
}

export function parseClients(data: unknown): Client[] {
  if (!Array.isArray(data)) throw new TypeError("Clients invalides");
  return data.map((d): Client => {
    if (isRecord(d) && typeof d.id === "string" && typeof d.nom === "string") {
      return { id: d.id, nom: d.nom, telephone: typeof d.telephone === "string" ? d.telephone : undefined };
    }
    throw new TypeError("Client invalide");
  });
}

function liste<T>(data: unknown, nom: string, lire: (d: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(data)) throw new TypeError(`${nom} invalides`);
  return data.map((d) => {
    const v = isRecord(d) ? lire(d) : null;
    if (v === null) throw new TypeError(`${nom} : élément invalide`);
    return v;
  });
}

export const parseGazStock = (data: unknown): GazStock[] =>
  liste(data, "Stock gaz", (d) =>
    typeof d.marque === "string" &&
    typeof d.pleines === "number" &&
    typeof d.vides === "number" &&
    typeof d.seuil === "number"
      ? { marque: d.marque, pleines: d.pleines, vides: d.vides, seuil: d.seuil }
      : null,
  );

export const parseEchanges = (data: unknown): Echange[] =>
  liste(data, "Échanges", (d) =>
    typeof d.id === "string" &&
    typeof d.date === "string" &&
    typeof d.client === "string" &&
    typeof d.remise === "string" &&
    typeof d.rapportee === "string"
      ? {
          id: d.id,
          date: d.date,
          client: d.client,
          remise: d.remise,
          rapportee: d.rapportee,
          ecart: typeof d.ecart === "number" ? d.ecart : null,
        }
      : null,
  );

export const parseFournisseurs = (data: unknown): Fournisseur[] =>
  liste(data, "Fournisseurs", (d) =>
    typeof d.id === "string" &&
    typeof d.nom === "string" &&
    typeof d.telephone === "string" &&
    Array.isArray(d.marques) &&
    d.marques.every((m) => typeof m === "string")
      ? { id: d.id, nom: d.nom, telephone: d.telephone, marques: d.marques as string[] }
      : null,
  );
