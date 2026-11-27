import type { Sale } from "@jarvis/shared";
import { ApiError } from "../api/client.js";
import { api } from "../api/index.js";
import { recuPdf } from "./pdf.js";

export interface RecuObtenu {
  contenu: BlobPart;
  /** Reçu composé sur l'appareil faute de réponse du serveur. */
  local: boolean;
}

/**
 * Reçu PDF du serveur ; hors ligne ou serveur en panne, un reçu est composé avec les données déjà sur l'appareil.
 * Un refus (droit, vente introuvable) est remonté : le repli ne doit pas le contourner.
 */
export async function recuDeVente(vente: Sale, lang: string, lignes: () => string[]): Promise<RecuObtenu> {
  try {
    const contenu = await api.fichier(`/documents/sales/${vente.id}/receipt.pdf?lang=${lang}`);
    return { contenu, local: false };
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) throw e;
    return { contenu: recuPdf(lignes()) as BlobPart, local: true };
  }
}
