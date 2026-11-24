import { api, type Rapport } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Table } from "../ui/Table.js";
import { enCsv, enTexte, lienMail, lienWhatsapp, telecharger } from "./export.js";

const VIDE: Rapport = { colonnes: [], lignes: [] };

function Cellule({ v }: { v: string | number }) {
  return (
    <td className={typeof v === "number" ? "num" : undefined}>
      {typeof v === "number" ? v.toLocaleString("fr-FR") : v}
    </td>
  );
}

/** Un rapport quotidien consultable à l'écran, avec envoi par WhatsApp ou e-mail et export CSV. */
export function RapportTable({ id, titre }: { id: "clients" | "journal" | "x"; titre: MessageKey }) {
  const { t } = useI18n();
  const { data, pret } = useCached(`rapport-${id}`, (s) => api.rapport(id, s), VIDE);
  const nom = t(titre);
  const texte = enTexte(nom, data);
  return (
    <section className="carte">
      <h1>{nom}</h1>
      {!pret && data.colonnes.length === 0 ? (
        <p role="status">{t("page.chargement")}</p>
      ) : (
        <Table caption={nom} colonnes={data.colonnes}>
          {data.lignes.map((l, i) => (
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
      )}
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
  const { data } = useCached("gaz-stock", api.gazStock, []);
  const pleines = data.reduce((n, s) => n + s.pleines, 0);
  const vides = data.reduce((n, s) => n + s.vides, 0);
  const rapport: Rapport = {
    colonnes: [t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.total")],
    lignes: data.map((s) => [s.marque, s.pleines, s.vides, s.pleines + s.vides]),
    pied: [t("gaz.total.general"), pleines, vides, pleines + vides],
  };
  const texte = enTexte(t("rub.rapport.gaz"), rapport);
  return (
    <section className="carte">
      <h1>{t("rub.rapport.gaz")}</h1>
      <Table caption={t("rub.rapport.gaz")} colonnes={rapport.colonnes}>
        {rapport.lignes.map((l) => (
          <tr key={String(l[0])}>
            {l.map((v, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
              <Cellule key={j} v={v} />
            ))}
          </tr>
        ))}
        <tr className="tableau__total">
          {(rapport.pied ?? []).map((v, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: colonnes fixes
            <Cellule key={j} v={v} />
          ))}
        </tr>
      </Table>
      <div className="vente__actions">
        <Button
          variant="noir"
          onClick={() => telecharger("situation-gaz.csv", enCsv(rapport), "text/csv;charset=utf-8")}
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

/** Exports : un fichier CSV (ouvre dans Excel) par état, en attendant le format Sage 100 i7 à confirmer. */
export function Exports() {
  const { t } = useI18n();
  const ventes = useCached("rapport-clients", (s) => api.rapport("clients", s), VIDE).data;
  const journal = useCached("rapport-journal", (s) => api.rapport("journal", s), VIDE).data;
  const x = useCached("rapport-x", (s) => api.rapport("x", s), VIDE).data;
  const fichiers: [string, string, Rapport][] = [
    [t("rub.rapport.clients"), "statistiques-clients.csv", ventes],
    [t("rub.rapport.journal"), "journal-de-caisse.csv", journal],
    [t("rub.rapport.x"), "x-de-caisse.csv", x],
  ];
  return (
    <section className="carte">
      <h1>{t("rub.rapport.exports")}</h1>
      <p>{t("rapport.sage")}</p>
      <ul className="liste">
        {fichiers.map(([libelle, fichier, rapport]) => (
          <li key={fichier} className="validation">
            <strong>{libelle}</strong>
            <Button
              variant="noir"
              onClick={() => telecharger(fichier, enCsv(rapport), "text/csv;charset=utf-8")}
            >
              {`${t("rapport.csv")} (${fichier})`}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
