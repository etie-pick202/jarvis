import type { CanalSubscriber } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { Chip, type Tone } from "../ui/Chip.js";
import { dateCourte, type EtatEcheance, etatEcheance } from "./regles.js";

const TONS: Record<EtatEcheance, Tone> = {
  aucune: "neutre",
  depassee: "danger",
  proche: "alerte",
  "a-jour": "ok",
};

/** Échéance et état en toutes lettres : la couleur ne porte jamais seule le sens. */
export function EtatChip({ abonne }: { abonne: CanalSubscriber }) {
  const { t, lang } = useI18n();
  const etat = etatEcheance(abonne);
  const date = abonne.expiresOn ? ` · ${dateCourte(abonne.expiresOn, lang)}` : "";
  return <Chip tone={TONS[etat]}>{`${t(`canal.etat.${etat}`)}${date}`}</Chip>;
}
