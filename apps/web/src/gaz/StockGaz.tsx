import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { Chip } from "../ui/Chip.js";
import { Table } from "../ui/Table.js";
import { Comptage } from "./Inventaire.js";

/** Stock plein et vide par marque, alerte de seuil bas, confirmation du soir. */
export function StockGaz() {
  const { t } = useI18n();
  const { data, pret } = useCached("gaz-stock", api.gazStock, []);
  const pleines = data.reduce((n, s) => n + s.pleines, 0);
  const vides = data.reduce((n, s) => n + s.vides, 0);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.stock.titre")}</h1>
        {!pret && data.length === 0 ? (
          <p role="status">{t("page.chargement")}</p>
        ) : (
          <Table
            caption={t("gaz.stock.titre")}
            colonnes={[t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.total"), ""]}
          >
            {data.map((s) => (
              <tr key={`${s.brandId}:${s.formatId}`}>
                <th scope="row">{s.marque}</th>
                <td>{s.pleines}</td>
                <td>{s.vides}</td>
                <td>{s.pleines + s.vides}</td>
                <td>
                  {s.pleines === 0 ? (
                    <Chip tone="danger">{t("gaz.rupture")}</Chip>
                  ) : s.pleines <= s.seuil ? (
                    <Chip tone="alerte">{t("gaz.bas")}</Chip>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="tableau__total">
              <th scope="row">{t("gaz.total.general")}</th>
              <td>{pleines}</td>
              <td>{vides}</td>
              <td>{pleines + vides}</td>
              <td />
            </tr>
          </Table>
        )}
      </section>
      <Comptage kind="evening" />
    </div>
  );
}
