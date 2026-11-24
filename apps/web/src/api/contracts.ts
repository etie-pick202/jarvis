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

export interface ReceptionResume {
  id: string;
  date: string;
  fournisseur: string;
  pleines: number;
  vides: number;
}

export interface Caisse {
  id: string;
  nom: string;
  /** Solde théorique : calculé après chaque mouvement, jamais saisi à la main. */
  solde: number;
  /** Fond de caisse du matin = comptage de clôture de la veille. */
  fond: number;
  /** Les caisses en veille (transactions OM et MoMo) s'activent par un réglage. */
  actif: boolean;
  /** Part comptée en espèces (mention « dont … en espèces »). */
  especes: boolean;
}

export interface Caisses {
  caisses: Caisse[];
  /** Écart de clôture au-delà duquel une justification est demandée. */
  seuilJustification: number;
}

export interface Tableau {
  caJour: number;
  nbVentes: number;
  livraisonsEnCours: number;
  echeances: number;
}

export interface Alerte {
  id: string;
  texte: string;
  niveau: "alerte" | "danger";
}

export interface Validation {
  id: string;
  genre: "inventaire" | "ecart" | "annulation";
  resume: string;
  auteur: string;
  date: string;
}

export interface LigneAudit {
  id: string;
  date: string;
  auteur: string;
  action: string;
  detail: string;
}

/** Rapport tabulaire (statistiques clients, journal de caisse, X de caisse). */
export interface Rapport {
  colonnes: string[];
  lignes: (string | number)[][];
  pied?: (string | number)[];
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

export const parseReceptions = (data: unknown): ReceptionResume[] =>
  liste(data, "Réceptions", (d) =>
    typeof d.id === "string" &&
    typeof d.date === "string" &&
    typeof d.fournisseur === "string" &&
    typeof d.pleines === "number" &&
    typeof d.vides === "number"
      ? { id: d.id, date: d.date, fournisseur: d.fournisseur, pleines: d.pleines, vides: d.vides }
      : null,
  );

export function parseCaisses(data: unknown): Caisses {
  if (isRecord(data) && typeof data.seuilJustification === "number") {
    return {
      seuilJustification: data.seuilJustification,
      caisses: liste(data.caisses, "Caisses", (d) =>
        typeof d.id === "string" &&
        typeof d.nom === "string" &&
        Number.isInteger(d.solde) &&
        Number.isInteger(d.fond) &&
        typeof d.actif === "boolean" &&
        typeof d.especes === "boolean"
          ? {
              id: d.id,
              nom: d.nom,
              solde: d.solde as number,
              fond: d.fond as number,
              actif: d.actif,
              especes: d.especes,
            }
          : null,
      ),
    };
  }
  throw new TypeError("Caisses invalides");
}

export function parseTableau(data: unknown): Tableau {
  if (
    isRecord(data) &&
    typeof data.caJour === "number" &&
    typeof data.nbVentes === "number" &&
    typeof data.livraisonsEnCours === "number" &&
    typeof data.echeances === "number"
  ) {
    return {
      caJour: data.caJour,
      nbVentes: data.nbVentes,
      livraisonsEnCours: data.livraisonsEnCours,
      echeances: data.echeances,
    };
  }
  throw new TypeError("Tableau de bord invalide");
}

export const parseAlertes = (data: unknown): Alerte[] =>
  liste(data, "Alertes", (d) =>
    typeof d.id === "string" &&
    typeof d.texte === "string" &&
    (d.niveau === "alerte" || d.niveau === "danger")
      ? { id: d.id, texte: d.texte, niveau: d.niveau }
      : null,
  );

export const parseValidations = (data: unknown): Validation[] =>
  liste(data, "Validations", (d) =>
    typeof d.id === "string" &&
    (d.genre === "inventaire" || d.genre === "ecart" || d.genre === "annulation") &&
    typeof d.resume === "string" &&
    typeof d.auteur === "string" &&
    typeof d.date === "string"
      ? { id: d.id, genre: d.genre, resume: d.resume, auteur: d.auteur, date: d.date }
      : null,
  );

export const parseAudit = (data: unknown): LigneAudit[] =>
  liste(data, "Journal d'audit", (d) =>
    typeof d.id === "string" &&
    typeof d.date === "string" &&
    typeof d.auteur === "string" &&
    typeof d.action === "string" &&
    typeof d.detail === "string"
      ? { id: d.id, date: d.date, auteur: d.auteur, action: d.action, detail: d.detail }
      : null,
  );

export function parseRapport(data: unknown): Rapport {
  const cellule = (x: unknown): x is string | number => typeof x === "string" || typeof x === "number";
  if (
    isRecord(data) &&
    Array.isArray(data.colonnes) &&
    data.colonnes.every((x) => typeof x === "string") &&
    Array.isArray(data.lignes) &&
    data.lignes.every((l) => Array.isArray(l) && l.every(cellule)) &&
    (data.pied === undefined || (Array.isArray(data.pied) && data.pied.every(cellule)))
  ) {
    return {
      colonnes: data.colonnes as string[],
      lignes: data.lignes as (string | number)[][],
      pied: data.pied as (string | number)[] | undefined,
    };
  }
  throw new TypeError("Rapport invalide");
}
