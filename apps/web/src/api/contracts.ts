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

export function parseHealth(data: unknown): Health {
  if (typeof data === "object" && data !== null && (data as { status?: unknown }).status === "ok") {
    return { status: "ok" };
  }
  throw new TypeError("Réponse /health invalide");
}
