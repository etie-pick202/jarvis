import type { CanalSubscriber } from "../api/index.js";

const normaliser = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Même recherche que le serveur, sur la liste gardée sur l'appareil : nom (début de mot), décodeur ou téléphone. */
export function filtrerAbonnes(abonnes: readonly CanalSubscriber[], saisie: string): CanalSubscriber[] {
  const q = normaliser(saisie.trim());
  if (q === "") return [...abonnes];
  return abonnes.filter((a) => {
    const nom = normaliser(a.name);
    return (
      nom.startsWith(q) ||
      nom.split(" ").some((mot) => mot.startsWith(q)) ||
      normaliser(a.decoderNumber).startsWith(q) ||
      a.phone.includes(saisie.trim())
    );
  });
}

export type EtatEcheance = "aucune" | "depassee" | "proche" | "a-jour";

export function etatEcheance(a: Pick<CanalSubscriber, "daysLeft">): EtatEcheance {
  if (a.daysLeft === null) return "aucune";
  if (a.daysLeft < 0) return "depassee";
  return a.daysLeft <= 7 ? "proche" : "a-jour";
}

/** Date AAAA-MM-JJ affichée sans décalage de fuseau. */
export function dateCourte(jour: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${jour}T00:00:00Z`));
}

/** Lien WhatsApp prérempli (aucune API payante) : le gérant relit et envoie lui-même. */
export function lienRappel(a: Pick<CanalSubscriber, "phone">, message: string): string {
  return `https://wa.me/${a.phone.replace(/\D/gu, "")}?text=${encodeURIComponent(message)}`;
}
