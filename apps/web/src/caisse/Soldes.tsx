import { useI18n } from "../i18n/index.js";
import { Chip } from "../ui/Chip.js";
import { formatFcfa } from "../vente/regles.js";
import { totalEspeces, totalSoldes, useCaisses } from "./donnees.js";

/** Solde théorique de chaque caisse, mis à jour après chaque mouvement. */
export function Soldes() {
  const { t } = useI18n();
  const { caisses, pret } = useCaisses();
  if (!pret && caisses.length === 0) return <p role="status">{t("page.chargement")}</p>;
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("caisse.soldes.titre")}</h1>
        <ul className="caisses">
          {caisses.map((c) => (
            <li key={c.id} className={`caisses__carte${c.actif ? "" : " caisses__carte--veille"}`}>
              <h2>{c.nom}</h2>
              {c.actif ? (
                <p className="caisses__solde">{formatFcfa(c.solde)}</p>
              ) : (
                <Chip>{t("caisse.veille")}</Chip>
              )}
            </li>
          ))}
        </ul>
        <p className="caisses__total">
          <strong>{`${t("caisse.total")} : ${formatFcfa(totalSoldes(caisses))}`}</strong>
          <span>{` · ${t("caisse.dont")} ${formatFcfa(totalEspeces(caisses))} ${t("caisse.enespeces")}`}</span>
        </p>
      </section>
    </div>
  );
}
