import { useState } from "react";
import { useI18n } from "../i18n/index.js";
import { Button } from "./Button.js";

export const PAGE = 50;

/** Très longues listes : on n'affiche que les premières lignes, le reste à la demande (téléphone d'entrée de gamme). */
export function usePagination<T>(elements: readonly T[], taille: number = PAGE) {
  const [limite, setLimite] = useState(taille);
  return {
    visibles: elements.slice(0, limite),
    restants: Math.max(0, elements.length - limite),
    plus: () => setLimite((n) => n + taille),
  };
}

export function VoirPlus({ restants, plus }: Readonly<{ restants: number; plus: () => void }>) {
  const { t } = useI18n();
  if (restants === 0) return null;
  return (
    <Button variant="contour" onClick={plus}>
      {`${t("liste.plus")} (${restants} ${t("liste.restants")})`}
    </Button>
  );
}
