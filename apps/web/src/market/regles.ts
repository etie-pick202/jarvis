import type { Article } from "@jarvis/shared";

const normaliser = (t: string) =>
  t
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filtrerArticles(articles: readonly Article[], saisie: string): Article[] {
  const q = normaliser(saisie);
  return articles.filter((a) => normaliser(`${a.name} ${a.category ?? ""}`).includes(q));
}

/** Deux articles de même nom se confondraient à la vente. */
export function nomDejaPris(nom: string, articles: readonly Article[], sauf?: string): boolean {
  const n = normaliser(nom);
  return n !== "" && articles.some((a) => a.id !== sauf && normaliser(a.name) === n);
}

/** Prix en FCFA : entier positif ou nul, 999 999 999 au plus. */
export function lirePrix(saisie: string): number | null {
  const t = saisie.trim();
  return /^\d{1,9}$/u.test(t) ? Number(t) : null;
}

/** Seuil ou stock de départ : facultatif (0 s'il est vide), sinon un entier d'au plus 6 chiffres. */
export function lireQuantite(saisie: string): number | null {
  const t = saisie.trim();
  if (t === "") return 0;
  return /^\d{1,6}$/u.test(t) ? Number(t) : null;
}

/** Catégories déjà employées, proposées à la saisie pour éviter les variantes. */
export function categories(articles: readonly Article[]): string[] {
  return [...new Set(articles.flatMap((a) => (a.category ? [a.category] : [])))].sort((a, b) =>
    a.localeCompare(b),
  );
}
