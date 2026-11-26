import { useCallback, useState } from "react";
import { api, type CanalSubscriber } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { Segmented } from "../ui/Segmented.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";
import { EtatVide } from "../visuels/Illustration.js";
import { EtatChip } from "./EtatChip.js";
import { dateCourte, lienRappel } from "./regles.js";

type Fenetre = "7" | "15" | "30";

function useEcheances(jours: Fenetre) {
  const charger = useCallback((signal: AbortSignal) => api.echeancesCanal(Number(jours), signal), [jours]);
  return useCached(`canal-echeances-${jours}`, charger, []);
}

/**
 * Échéances proches ou dépassées. Avec `rappels`, chaque ligne porte un lien WhatsApp prérempli :
 * le gérant relance l'abonné sans frais.
 */
export function Echeances({ rappels = false }: { rappels?: boolean }) {
  const { t, lang } = useI18n();
  const [jours, setJours] = useState<Fenetre>("7");
  const { data, hors } = useEcheances(jours);
  const titre = rappels ? t("rub.canal.rappels") : t("rub.canal.echeances");

  const message = (a: CanalSubscriber) =>
    [
      t("canal.rappel.bonjour"),
      `${a.name},`,
      a.daysLeft !== null && a.daysLeft < 0 ? t("canal.rappel.expire") : t("canal.rappel.expirera"),
      `(${a.formulaName}, ${formatFcfa(a.formulaPrice)})`,
      a.expiresOn ? `: ${dateCourte(a.expiresOn, lang)}.` : ".",
      t("canal.rappel.boutique"),
    ].join(" ");

  return (
    <section className="carte page">
      <h1>{titre}</h1>
      <Segmented<Fenetre>
        legend={t("canal.fenetre")}
        value={jours}
        onChange={setJours}
        options={[
          { value: "7", label: t("canal.jours.7") },
          { value: "15", label: t("canal.jours.15") },
          { value: "30", label: t("canal.jours.30") },
        ]}
      />
      {data.length === 0 ? (
        hors ? (
          <EtatVide genre="hors-ligne" titre={t("horsligne.titre")} texte={t("horsligne.texte")} />
        ) : (
          <EtatVide genre="vide" titre={t("canal.aucune.echeance")} />
        )
      ) : (
        <Table
          caption={titre}
          colonnes={[
            t("canal.nom"),
            t("canal.formule"),
            t("canal.echeance"),
            rappels ? t("canal.rappel") : t("canal.telephone"),
          ]}
        >
          {data.map((a) => (
            <tr key={a.id}>
              <th scope="row">{a.name}</th>
              <td>{a.formulaName}</td>
              <td>
                <EtatChip abonne={a} />
              </td>
              <td>
                {rappels ? (
                  <a
                    className="btn btn--contour"
                    href={lienRappel(a, message(a))}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${t("vente.whatsapp")} ${a.name}`}
                  >
                    {t("vente.whatsapp")}
                  </a>
                ) : (
                  <a href={`tel:${a.phone}`}>{a.phone}</a>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
