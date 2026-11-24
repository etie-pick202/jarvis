import { useParams } from "react-router";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { VOLETS, voletsPour } from "../nav/volets.js";
import { Forbidden, NotFound } from "./Errors.js";

/** Écran provisoire d'une rubrique, remplacé volet par volet dans les étapes suivantes. */
export function Placeholder() {
  const { volet: voletId, rubrique: rubriqueId } = useParams();
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const volet = VOLETS.find((v) => v.id === voletId);
  const rubrique = volet?.rubriques.find((r) => r.id === rubriqueId);
  if (!volet || !rubrique) return <NotFound />;
  if (!voletsPour(profilsActifs).includes(volet)) return <Forbidden />;
  return (
    <section className="carte">
      <h1>{volet.nom}</h1>
      <h2>{t(rubrique.label)}</h2>
      <p>{t("page.bientot")}</p>
    </section>
  );
}
