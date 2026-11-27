import { useCallback, useState } from "react";
import { api, type CanalSubscriber } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { Etat } from "../ui/Etat.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Segmented } from "../ui/Segmented.js";
import { Table } from "../ui/Table.js";
import { EtatChip } from "./EtatChip.js";

type Fenetre = "7" | "15" | "30";

/** Les relances viennent du serveur, message et lien WhatsApp compris (indicatif ajouté). */
function useEcheances(jours: Fenetre, rappels: boolean, langue: "fr" | "en") {
  const charger = useCallback(
    (signal: AbortSignal): Promise<(CanalSubscriber & { whatsappUrl?: string })[]> =>
      rappels ? api.relancesCanal(Number(jours), langue, signal) : api.echeancesCanal(Number(jours), signal),
    [jours, rappels, langue],
  );
  return useCached(rappels ? `canal-relances-${langue}-${jours}` : `canal-echeances-${jours}`, charger, []);
}

/**
 * Échéances proches ou dépassées. Avec `rappels`, chaque ligne porte un lien WhatsApp prérempli :
 * le gérant relance l'abonné sans frais.
 */
export function Echeances({ rappels = false }: { rappels?: boolean }) {
  const [jours, setJours] = useState<Fenetre>("7");
  // La clé repart d'un état neuf à chaque fenêtre (sinon on verrait un instant les données de la précédente).
  const { lang } = useI18n();
  return <Liste key={`${jours}-${rappels}-${lang}`} jours={jours} setJours={setJours} rappels={rappels} />;
}

function Liste({
  jours,
  setJours,
  rappels,
}: Readonly<{
  jours: Fenetre;
  setJours: (j: Fenetre) => void;
  rappels: boolean;
}>) {
  const { t, lang } = useI18n();
  const lecture = useEcheances(jours, rappels, lang);
  const { data } = lecture;
  const { visibles, restants, plus } = usePagination(data);
  const titre = rappels ? t("rub.canal.rappels") : t("rub.canal.echeances");

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
      <Etat {...lecture} vide={data.length === 0} messageVide={t("canal.aucune.echeance")}>
        <Table
          cartes
          caption={titre}
          colonnes={[
            t("canal.nom"),
            t("canal.formule"),
            t("canal.echeance"),
            rappels ? t("canal.rappel") : t("canal.telephone"),
          ]}
        >
          {visibles.map((a) => (
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
                    href={a.whatsappUrl}
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
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
    </section>
  );
}
