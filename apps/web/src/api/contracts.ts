/**
 * Modèles de vue des écrans. Les réponses du backend (voir `dto.ts` et `@jarvis/shared`) sont converties
 * en ces formes dans `api/index.ts` : les écrans ne connaissent ni les routes ni le détail du contrat.
 */
import type { Profil } from "../nav/volets.js";

export interface Session {
  userId: string;
  nom: string;
  /** Un utilisateur peut cumuler plusieurs profils (le gérant est aussi livreur). */
  profils: Profil[];
  /** Profil actif côté serveur (bascule sans reconnexion). */
  profilActif: Profil;
}

/** Pastilles d'action : ce qui demande une action de l'utilisateur. */
export interface Badges {
  commandes: number;
  stockBas: number;
  echeances: number;
  validations: number;
}

export type { CanalFormula, CanalSubscriber } from "@jarvis/shared";

/** Un article vendable : une bouteille de gaz (marque × format) ou un article libre. */
export interface Article {
  id: string;
  nom: string;
  genre: "gaz" | "autre";
  marque?: string;
  /** Libellé du format de bouteille (gaz), ex. « 12,5 kg ». */
  formatLibelle?: string;
  /** Prix au comptoir en FCFA entiers (gaz : recharge + contribution transport). */
  prix: number;
  /** Bouteilles pleines, ou unités en stock (9999 si l'article n'est pas suivi en stock). */
  stock: number;
  valeurEmballage?: number;
  brandId?: string;
  formatId?: string;
  articleId?: string;
}

export interface Client {
  id: string;
  nom: string;
  telephone?: string;
}

export interface GazStock {
  marque: string;
  brandId: string;
  formatId: string;
  formatLabel: string;
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
  brandIds: string[];
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
  /** Solde théorique : calculé par le serveur après chaque mouvement, jamais saisi à la main. */
  solde: number;
  /** Fond de caisse du matin : solde à l'ouverture du jour d'activité. */
  fond: number;
  /** Les caisses en veille (transactions OM et MoMo) s'activent par un réglage. */
  actif: boolean;
  /** Part comptée en espèces (mention « dont … en espèces »). */
  especes: boolean;
}

export interface Tableau {
  caJour: number;
  nbVentes: number;
  marge: number;
  margePct: number | null;
  totalCaisses: number;
  especes: number;
  pleines: number;
  vides: number;
  alertesStock: number;
  notifications: number;
  /** Abonnements Canal+ dépassés ou à moins de 7 jours ; absent sur un serveur ancien. */
  echeancesCanal?: number;
}

export interface Alerte {
  id: string;
  texte: string;
  niveau: "alerte" | "danger";
}

export interface Validation {
  id: string;
  genre: "inventaire";
  resume: string;
  auteur: string;
  date: string;
}

export interface LigneAudit {
  id: string;
  date: string;
  /** Vide pour une action du système. */
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
