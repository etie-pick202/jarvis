import { useI18n } from "../i18n/index.js";

/** Silhouette du contenu pendant le chargement ; le texte reste lu par les lecteurs d'écran. */
export function Squelette() {
  const { t } = useI18n();
  return (
    <output className="squelette">
      <span className="sr-only">{t("page.chargement")}</span>
      <span className="squelette__bloc squelette__bloc--titre" aria-hidden="true" />
      <span className="squelette__bloc" aria-hidden="true" />
      <span className="squelette__bloc" aria-hidden="true" />
      <span className="squelette__bloc" aria-hidden="true" />
    </output>
  );
}
