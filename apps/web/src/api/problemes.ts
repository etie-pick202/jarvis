import { ApiError } from "./client.js";

/** Pourquoi une lecture a échoué : chaque cas a son message et sa conduite à tenir à l'écran. */
export type Genre = "hors-ligne" | "serveur" | "interdit" | "indisponible" | "contrat";

export interface Probleme {
  genre: Genre;
  /** Code d'erreur typé renvoyé par l'API, à communiquer au support. */
  code?: string;
}

export function classerProbleme(erreur: unknown): Probleme {
  if (erreur instanceof ApiError) {
    const code = erreur.code === "unknown" ? String(erreur.status) : erreur.code;
    if (erreur.status === 401 || erreur.status === 403) return { genre: "interdit", code };
    if (erreur.status === 404) return { genre: "indisponible", code };
    return { genre: "serveur", code };
  }
  // Réponse reçue mais non conforme au contrat partagé, ou illisible.
  if (erreur instanceof Error && (erreur.name === "ZodError" || erreur.name === "SyntaxError")) {
    return { genre: "contrat" };
  }
  return { genre: "hors-ligne" };
}
