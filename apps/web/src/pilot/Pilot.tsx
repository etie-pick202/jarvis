import { api, type Validation } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { totalEspeces, totalSoldes, useCaisses } from "../caisse/donnees.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";

const TABLEAU_VIDE = { caJour: 0, nbVentes: 0, livraisonsEnCours: 0, echeances: 0 };

/** Tableau de bord du PDG : chiffre d'affaires, caisses, stock, livraisons, échéances. */
export function TableauDeBord() {
  const { t } = useI18n();
  const { data: tab } = useCached("pilot-tableau", api.tableau, TABLEAU_VIDE);
  const { data: stock } = useCached("gaz-stock", api.gazStock, []);
  const { caisses } = useCaisses();
  const pleines = stock.reduce((n, s) => n + s.pleines, 0);
  const vides = stock.reduce((n, s) => n + s.vides, 0);
  const chiffres: [string, string][] = [
    [t("pilot.ca"), formatFcfa(tab.caJour)],
    [t("pilot.ventes"), String(tab.nbVentes)],
    [t("pilot.caisses"), formatFcfa(totalSoldes(caisses))],
    [t("pilot.especes"), formatFcfa(totalEspeces(caisses))],
    [t("pilot.stock"), `${pleines} / ${vides}`],
    [t("pilot.livraisons"), String(tab.livraisonsEnCours)],
    [t("pilot.echeances"), String(tab.echeances)],
  ];
  return (
    <div className="page">
      <h1>{t("rub.pilot.tableau")}</h1>
      <dl className="chiffres">
        {chiffres.map(([libelle, valeur]) => (
          <div key={libelle} className="chiffres__carte">
            <dt>{libelle}</dt>
            <dd>{valeur}</dd>
          </div>
        ))}
      </dl>
      <Alertes />
    </div>
  );
}

export function Alertes({ page = false }: { page?: boolean }) {
  const { t } = useI18n();
  const { data } = useCached("pilot-alertes", api.alertes, []);
  return (
    <section className="carte">
      {page ? <h1>{t("rub.pilot.alertes")}</h1> : <h2>{t("rub.pilot.alertes")}</h2>}
      {data.length === 0 ? (
        <p>{t("pilot.aucune.alerte")}</p>
      ) : (
        <ul className="liste">
          {data.map((a) => (
            <li key={a.id}>
              <Chip tone={a.niveau}>{a.niveau === "danger" ? t("pilot.urgent") : t("pilot.attention")}</Chip>{" "}
              {a.texte}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Validations en attente : le PDG valide les comptages d'inventaire, le gérant consulte. */
export function Validations() {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const { data, modifier } = useCached("pilot-validations", api.validations, []);
  const peutDecider = profilsActifs.includes("pdg");
  const date = new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function valider(v: Validation) {
    // La validation ajuste le stock côté serveur ; elle est rangée dans la file d'envoi et la ligne quitte la liste.
    await ecrire({
      method: "POST",
      path: `/inventory/${v.id}/validate`,
      label: `${t("pilot.valider")} : ${v.resume}`,
      body: undefined,
    });
    modifier((l) => l.filter((x) => x.id !== v.id));
  }

  return (
    <section className="carte">
      <h1>{t("rub.pilot.validations")}</h1>
      {!peutDecider && <p>{t("pilot.lecture")}</p>}
      {data.length === 0 && <p>{t("pilot.aucune.validation")}</p>}
      <ul className="liste">
        {data.map((v) => (
          <li key={v.id} className="validation">
            <div>
              <strong>{v.resume}</strong>
              <p className="champ__aide">{date.format(new Date(v.date))}</p>
            </div>
            {peutDecider && (
              <Button variant="noir" onClick={() => void valider(v)}>
                {t("pilot.valider")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Audit() {
  const { t, lang } = useI18n();
  const { data } = useCached("pilot-audit", api.audit, []);
  const date = new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="carte">
      <h1>{t("rub.pilot.audit")}</h1>
      <Table
        caption={t("rub.pilot.audit")}
        colonnes={[t("pilot.quand"), t("pilot.action"), t("pilot.detail")]}
      >
        {data.map((l) => (
          <tr key={l.id}>
            <td>{date.format(new Date(l.date))}</td>
            <td>{l.action}</td>
            <td>{l.detail}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
