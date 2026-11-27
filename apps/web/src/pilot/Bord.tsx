import { Link } from "react-router";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useCaisses } from "../caisse/donnees.js";
import { useI18n } from "../i18n/index.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";

/** Le détail des caisses, sous les chiffres clés. */
export function BordCaisses() {
  const { t } = useI18n();
  const { caisses, lecture } = useCaisses();
  return (
    <section className="carte">
      <h2>{t("bord.caisses")}</h2>
      <Etat {...lecture} vide={caisses.length === 0} messageVide={t("caisse.vide")}>
        <Table caption={t("bord.caisses")} colonnes={[t("caisse.caisse"), t("bord.solde"), t("caisse.fond")]}>
          {caisses.map((c) => (
            <tr key={c.id}>
              <th scope="row">
                {c.nom} {!c.actif && <Chip>{t("caisse.veille")}</Chip>}
              </th>
              <td className="num">{formatFcfa(c.solde)}</td>
              <td className="num">{formatFcfa(c.fond)}</td>
            </tr>
          ))}
        </Table>
      </Etat>
      <Link className="lien-suite" to="/caisse/soldes">
        {t("bord.voir.caisses")}
      </Link>
    </section>
  );
}

/** Ce qui attend une décision : les trois premières lignes et le chemin vers la liste. */
export function BordValidations() {
  const { t } = useI18n();
  const lecture = useCached("pilot-validations", api.validations, []);
  const { data } = lecture;
  return (
    <section className="carte">
      <h2>{t("bord.a.valider")}</h2>
      <Etat {...lecture} vide={data.length === 0} messageVide={t("pilot.aucune.validation")}>
        <ul className="liste">
          {data.slice(0, 3).map((v) => (
            <li key={v.id}>{v.resume}</li>
          ))}
        </ul>
        <Link className="lien-suite" to="/pilot/validations">
          {`${t("bord.voir.validations")} (${data.length})`}
        </Link>
      </Etat>
    </section>
  );
}
