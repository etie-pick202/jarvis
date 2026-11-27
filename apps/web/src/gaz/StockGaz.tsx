import { useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Suite } from "../ui/Suite.js";
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
  const [corrige, setCorrige] = useState(false);
  const [fait, setFait] = useState(false);
  const formats = new Set(data.map((s) => s.formatId));
  const pleines = data.reduce((n, s) => n + s.pleines, 0);
  const vides = data.reduce((n, s) => n + s.vides, 0);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.stock.titre")}</h1>
        <Etat
          {...lecture}
          vide={data.length === 0}
          messageVide={t("gaz.stock.vide")}
          texteVide={t("vide.stock")}
          actionVide={<Suite vers="/config/marques" libelle={t("vide.vers.marques")} />}
        >
          <Table
            cartes
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
        {peutCorriger && data.length > 0 && !corrige && (
          <div className="vente__actions">
            <Button
              variant="contour"
              onClick={() => {
                setCorrige(true);
                setFait(false);
              }}
            >
              {t("corr.stock.bouton")}
            </Button>
          </div>
        )}
      </section>
      {corrige && (
        <CorrectionStock
          lignes={data}
          onFait={() => {
            setCorrige(false);
            setFait(true);
            lecture.recharger();
          }}
          onAbandonner={() => setCorrige(false)}
        />
      )}
      {/* Sans stock lu, rien à confirmer : un seul message sur la page. */}
      {lecture.charge && data.length > 0 && <Comptage kind="evening" />}
    </div>
  );
}
