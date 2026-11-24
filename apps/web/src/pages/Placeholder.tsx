import { Link, useParams } from "react-router";
import { useI18n } from "../i18n/index.js";
import { VOLETS } from "../nav/volets.js";

/** Écran provisoire d'une rubrique, remplacé volet par volet dans les étapes suivantes. */
export function Placeholder() {
  const { volet: voletId, rubrique: rubriqueId } = useParams();
  const { t } = useI18n();
  const volet = VOLETS.find((v) => v.id === voletId);
  const rubrique = volet?.rubriques.find((r) => r.id === rubriqueId);
  if (!volet || !rubrique) return <NotFound />;
  return (
    <section className="carte">
      <h1>{volet.nom}</h1>
      <h2>{t(rubrique.label)}</h2>
      <p>{t("page.bientot")}</p>
    </section>
  );
}

export function NotFound() {
  const { t } = useI18n();
  return (
    <section className="carte">
      <h1>{t("page.introuvable")}</h1>
      <Link to="/">{t("page.retour")}</Link>
    </section>
  );
}
