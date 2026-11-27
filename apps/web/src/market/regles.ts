import type { Article } from "@jarvis/shared";

const normaliser = (t: string) =>
  t
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filtrerArticles(articles: readonly Article[], saisie: string): Article[] {
  const q = normaliser(saisie);
  return articles.filter((a) => normaliser(a.name).includes(q));
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
