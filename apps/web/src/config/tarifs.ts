/** Montant ou poids entier positif ou nul, 999 999 999 au plus. */
export function lireFcfa(saisie: string): number | null {
  const t = saisie.trim();
  return /^\d{1,9}$/u.test(t) ? Number(t) : null;
}

const normaliser = (t: string) =>
  t
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Deux marques ou formats de même nom se confondraient à la vente. */
export const nomPris = (nom: string, existants: readonly string[]): boolean =>
  normaliser(nom) !== "" && existants.some((e) => normaliser(e) === normaliser(nom));
