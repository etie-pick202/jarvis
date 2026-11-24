import { Link } from "react-router";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { cheminVolet, voletsPour } from "../nav/volets.js";
import { Icone } from "./icones.js";
import { badgeDuVolet, useBadges } from "./useBadges.js";

/** Les volets qui ne tiennent pas dans la barre du bas du téléphone. */
export function Plus() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const badges = useBadges();
  const volets = voletsPour(profilsActifs);
  return (
    <section className="carte">
      <h1>{t("nav.plus")}</h1>
      <ul className="plus__liste">
        {volets.map((v) => (
          <li key={v.id}>
            <Link to={cheminVolet(v)} className="plus__lien">
              <Icone id={v.id} />
              <span>
                <strong>{v.nom}</strong> · {t(v.label)}
              </span>
              {badgeDuVolet(v.id, badges) > 0 && (
                <span className="pastille pastille--alerte">{badgeDuVolet(v.id, badges)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
