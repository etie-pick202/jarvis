import { useEffect, useId, useRef } from "react";
import { useI18n } from "../i18n/index.js";

/**
 * Choix d'un fichier avec un bouton dans la langue de l'interface. Le champ natif, transparent, recouvre le bouton :
 * le toucher, le clavier et les lecteurs d'écran s'adressent toujours à lui.
 */
export function ChampFichier({
  label,
  accept,
  fichier,
  onChoisir,
}: Readonly<{
  label: string;
  accept: string;
  /** Fichier retenu ; le remettre à null vide le champ. */
  fichier: File | null;
  onChoisir: (fichier: File | null) => void;
}>) {
  const { t } = useI18n();
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!fichier && champ.current) champ.current.value = "";
  }, [fichier]);
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={id}>
        {label}
      </label>
      <div className="fichier">
        <span className="fichier__zone">
          <input
            ref={champ}
            id={id}
            className="fichier__saisie"
            type="file"
            accept={accept}
            onChange={(e) => onChoisir(e.target.files?.[0] ?? null)}
          />
          <span className="btn btn--contour" aria-hidden="true">
            {t("fichier.choisir")}
          </span>
        </span>
        <span className="champ__aide">{fichier?.name ?? t("fichier.aucun")}</span>
      </div>
    </div>
  );
}
