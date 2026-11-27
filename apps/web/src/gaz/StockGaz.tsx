import { useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Table } from "../ui/Table.js";
import { FormatBouteille } from "../visuels/FormatBouteille.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";
import { CorrectionStock } from "./CorrectionStock.js";
import { Comptage } from "./Inventaire.js";

/** Stock plein et vide par marque, alerte de seuil bas, confirmation du soir. */
export function StockGaz() {
  const { t } = useI18n();
  const lecture = useCached("gaz-stock", api.gazStock, []);
  const { data } = lecture;
  const { profilsActifs } = useSession();
  const peutCorriger = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const [corrigee, setCorrigee] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const choisie = data.find((s) => `${s.brandId}:${s.formatId}` === corrigee);
  const formats = new Set(data.map((s) => s.formatId));
  const pleines = data.reduce((n, s) => n + s.pleines, 0);
  const vides = data.reduce((n, s) => n + s.vides, 0);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.stock.titre")}</h1>
        <Etat {...lecture} vide={data.length === 0} messageVide={t("gaz.stock.vide")}>
          <Table
            caption={t("gaz.stock.titre")}
            colonnes={[t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.total"), ""]}
          >
            {data.map((s) => (
              <tr key={`${s.brandId}:${s.formatId}`}>
                <th scope="row">
                  <MarqueGaz nom={s.marque} />
                  {formats.size > 1 && <FormatBouteille libelle={s.formatLabel} />}
                </th>
                <td>{s.pleines}</td>
                <td>{s.vides}</td>
                <td>{s.pleines + s.vides}</td>
                <td>
                  {s.pleines === 0 ? (
                    <Chip tone="danger">{t("gaz.rupture")}</Chip>
                  ) : s.pleines <= s.seuil ? (
                    <Chip tone="alerte">{t("gaz.bas")}</Chip>
                  ) : null}
                  {peutCorriger && (
                    <Button
                      variant="contour"
                      aria-label={`${t("corr.corriger")} ${s.marque} ${s.formatLabel}`}
                      onClick={() => {
                        setCorrigee(`${s.brandId}:${s.formatId}`);
                        setFait(false);
                      }}
                    >
                      {t("corr.corriger")}
                    </Button>
                  )}
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
        </Etat>
        {fait && <output className="bloc">{t("corr.faite")}</output>}
      </section>
      {choisie && (
        <CorrectionStock
          key={corrigee}
          ligne={choisie}
          onFait={() => {
            setCorrigee(null);
            setFait(true);
            lecture.recharger();
          }}
          onAbandonner={() => setCorrigee(null)}
        />
      )}
      {/* Sans stock lu, rien à confirmer : un seul message d'erreur sur la page. */}
      {lecture.charge && <Comptage kind="evening" />}
    </div>
  );
}
