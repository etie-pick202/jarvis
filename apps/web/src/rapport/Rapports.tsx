import { useCallback, useState } from "react";
import { api, nombreFr, type Rapport } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { enCsv, enTexte, lienMail, lienWhatsapp, telecharger } from "./export.js";

const VIDE: Rapport = { colonnes: [], lignes: [] };

function Cellule({ v }: { v: string | number }) {
  return (
    <td className={typeof v === "number" ? "num" : undefined}>{typeof v === "number" ? nombreFr(v) : v}</td>
  );
}

interface PropsRapport {
  id: "clients" | "journal" | "x";
  titre: MessageKey;
}

/** La clé évite qu'un rapport affiche un instant les données (ou l'erreur) du précédent. */
export function RapportTable(props: PropsRapport) {
  return <Rapport1 key={props.id} {...props} />;
}

/** Un rapport quotidien consultable à l'écran, avec envoi par WhatsApp ou e-mail et export CSV. */
function Rapport1({ id, titre }: PropsRapport) {
  const { t } = useI18n();
  const charger = useCallback((s: AbortSignal) => api.rapport(id, s), [id]);
  const lecture = useCached(`rapport-${id}`, charger, VIDE);
  const { data } = lecture;
  const { visibles, restants, plus } = usePagination(data.lignes);
  const nom = t(titre);
  const texte = enTexte(nom, data);
  return (
    <section className="carte">
      <h1>{nom}</h1>
      <Etat {...lecture} vide={data.lignes.length === 0} messageVide={t("rapport.vide")}>
        <Table caption={nom} colonnes={data.colonnes}>
          {visibles.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lignes d'un rapport figé, sans identifiant propre
            <tr key={i}>
              {l.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
                <Cellule key={j} v={v} />
              ))}
            </tr>
          ))}
          {data.pied && (
            <tr className="tableau__total">
              {data.pied.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
                <Cellule key={j} v={v} />
              ))}
            </tr>
          )}
        </Table>
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
      <div className="vente__actions">
        <Button
          variant="noir"
          onClick={() => telecharger(`${id}.csv`, enCsv(data), "text/csv;charset=utf-8")}
        >
          {t("rapport.csv")}
        </Button>
        <a className="btn btn--contour" href={lienWhatsapp(texte)} target="_blank" rel="noreferrer">
          {t("vente.whatsapp")}
        </a>
        <a className="btn btn--contour" href={lienMail(nom, texte)}>
          {t("rapport.mail")}
        </a>
      </div>
    </section>
  );
}

/** Situation gaz : par marque, pleines, vides et total, avec le total général. */
export function SituationGaz() {
  const { t } = useI18n();
  const lecture = useCached("rapport-gaz", api.situationGaz, VIDE);
  const { data } = lecture;
  const texte = enTexte(t("rub.rapport.gaz"), data);
  return (
    <section className="carte">
      <h1>{t("rub.rapport.gaz")}</h1>
      <Etat {...lecture} vide={data.lignes.length === 0} messageVide={t("rapport.vide")}>
        <Table caption={t("rub.rapport.gaz")} colonnes={data.colonnes}>
          {data.lignes.map((l) => (
            <tr key={String(l[0])}>
              {l.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
                <Cellule key={j} v={v} />
              ))}
            </tr>
          ))}
          {data.pied && (
            <tr className="tableau__total">
              {data.pied.map((v, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
                <Cellule key={j} v={v} />
              ))}
            </tr>
          )}
        </Table>
      </Etat>
      <div className="vente__actions">
        <Button
          variant="noir"
          onClick={() => telecharger("situation-gaz.csv", enCsv(data), "text/csv;charset=utf-8")}
        >
          {t("rapport.csv")}
        </Button>
        <a className="btn btn--contour" href={lienWhatsapp(texte)} target="_blank" rel="noreferrer">
          {t("vente.whatsapp")}
        </a>
      </div>
    </section>
  );
}

/** Exports : les fichiers CSV du serveur (ouvrent dans Excel), en attendant le format Sage 100 i7 à confirmer. */
export function Exports() {
  const { t } = useI18n();
  const [erreur, setErreur] = useState(false);
  const fichiers: ["sales" | "cash" | "stock", string, string][] = [
    ["sales", t("rub.rapport.clients"), "ventes.csv"],
    ["cash", t("rub.rapport.journal"), "caisse.csv"],
    ["stock", t("rub.rapport.gaz"), "stock-gaz.csv"],
  ];

  async function exporter(nom: "sales" | "cash" | "stock", fichier: string) {
    setErreur(false);
    try {
      telecharger(fichier, await (await api.exportCsv(nom)).text(), "text/csv;charset=utf-8");
    } catch {
      setErreur(true);
    }
  }

  return (
    <section className="carte">
      <h1>{t("rub.rapport.exports")}</h1>
      <p>{t("rapport.sage")}</p>
      {erreur && (
        <p role="alert" className="connexion__erreur">
          {t("rapport.export.erreur")}
        </p>
      )}
      <ul className="liste">
        {fichiers.map(([nom, libelle, fichier]) => (
          <li key={nom} className="validation">
            <strong>{libelle}</strong>
            <Button variant="noir" onClick={() => void exporter(nom, fichier)}>
              {`${t("rapport.csv")} (${fichier})`}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
