import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { Chip } from "../ui/Chip.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";

/** Échanges entre marques du jour avec l'écart de valeur d'emballage (gain ou perte). */
export function Echanges() {
  const { t, lang } = useI18n();
  const { data } = useCached("gaz-echanges", api.echanges, []);
  const heure = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="carte">
      <h1>{t("gaz.echanges.titre")}</h1>
      {data.length === 0 ? (
        <p>{t("gaz.echanges.vide")}</p>
      ) : (
        <Table
          caption={t("gaz.echanges.titre")}
          colonnes={[t("gaz.heure"), t("gaz.client"), t("gaz.remise"), t("gaz.rapportee"), t("gaz.ecart")]}
        >
          {data.map((e) => (
            <tr key={e.id}>
              <td>{heure.format(new Date(e.date))}</td>
              <td>{e.client}</td>
              <td>{e.remise}</td>
              <td>{e.rapportee}</td>
              <td>
                {e.ecart === null ? (
                  "—"
                ) : (
                  <Chip tone={e.ecart >= 0 ? "ok" : "danger"}>
                    {`${e.ecart >= 0 ? t("gaz.gain") : t("gaz.perte")} ${formatFcfa(Math.abs(e.ecart))}`}
                  </Chip>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
