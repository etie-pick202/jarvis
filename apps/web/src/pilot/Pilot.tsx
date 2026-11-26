import { useState } from "react";
import { api, type Tableau, type Validation } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";

const TABLEAU_VIDE: Tableau = {
  caJour: 0,
  nbVentes: 0,
  marge: 0,
  margePct: null,
  totalCaisses: 0,
  especes: 0,
  pleines: 0,
  vides: 0,
  alertesStock: 0,
  notifications: 0,
};

/** Tableau de bord du PDG : ventes et marge du jour, caisses, stock et ce qui demande une action. */
export function TableauDeBord() {
  const { t, lang } = useI18n();
  const lecture = useCached("pilot-tableau", api.tableau, TABLEAU_VIDE);
  const tab = lecture.data;
  const pourcent = tab.margePct === null ? "" : ` (${tab.margePct.toLocaleString(lang)} %)`;
  const chiffres: [string, string][] = [
    [t("pilot.ca"), formatFcfa(tab.caJour)],
    [t("pilot.marge"), `${formatFcfa(tab.marge)}${pourcent}`],
    [t("pilot.ventes"), String(tab.nbVentes)],
    [t("pilot.caisses"), formatFcfa(tab.totalCaisses)],
    [t("pilot.especes"), formatFcfa(tab.especes)],
    [t("pilot.stock"), `${tab.pleines} / ${tab.vides}`],
    [t("pilot.stock.alertes"), String(tab.alertesStock)],
    [t("pilot.notifications"), String(tab.notifications)],
  ];
  return (
    <div className="page">
      <h1>{t("rub.pilot.tableau")}</h1>
      <Etat {...lecture}>
        <dl className="chiffres">
          {chiffres.map(([libelle, valeur]) => (
            <div key={libelle} className="chiffres__carte">
              <dt>{libelle}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
      </Etat>
      <Alertes />
    </div>
  );
}

export function Alertes({ page = false }: { page?: boolean }) {
  const { t } = useI18n();
  const lecture = useCached("pilot-alertes", api.alertes, []);
  const { data } = lecture;
  return (
    <section className="carte">
      {page ? <h1>{t("rub.pilot.alertes")}</h1> : <h2>{t("rub.pilot.alertes")}</h2>}
      <Etat {...lecture} vide={data.length === 0} messageVide={t("pilot.aucune.alerte")}>
        <ul className="liste">
          {data.map((a) => (
            <li key={a.id}>
              <Chip tone={a.niveau}>{a.niveau === "danger" ? t("pilot.urgent") : t("pilot.attention")}</Chip>{" "}
              {a.texte}
            </li>
          ))}
        </ul>
      </Etat>
    </section>
  );
}

/** Validations en attente : le PDG valide ou refuse (avec motif) les comptages, le gérant consulte. */
export function Validations() {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("pilot-validations", api.validations, []);
  const { data, modifier } = lecture;
  const { visibles, restants, plus } = usePagination(data);
  const [refus, setRefus] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const peutDecider = profilsActifs.includes("pdg");
  const date = new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function decider(v: Validation, decision: "valider" | "refuser") {
    // La décision est rangée dans la file d'envoi et la ligne quitte la liste ; un refus du serveur reste signalé.
    await ecrire({
      method: "POST",
      path: `/inventory/${v.id}/${decision === "valider" ? "validate" : "reject"}`,
      label: `${t(decision === "valider" ? "pilot.valider" : "pilot.refuser")} : ${v.resume}`,
      body: decision === "valider" ? undefined : { reason: motif.trim() },
    });
    modifier((l) => l.filter((x) => x.id !== v.id));
    setRefus(null);
    setMotif("");
  }

  return (
    <section className="carte">
      <h1>{t("rub.pilot.validations")}</h1>
      {!peutDecider && <p>{t("pilot.lecture")}</p>}
      <Etat {...lecture} vide={data.length === 0} messageVide={t("pilot.aucune.validation")}>
        <ul className="liste">
          {visibles.map((v) => (
            <li key={v.id} className="validation">
              <div>
                <strong>{v.resume}</strong>
                <p className="champ__aide">{`${v.auteur} · ${date.format(new Date(v.date))}`}</p>
              </div>
              {peutDecider && refus !== v.id && (
                <div className="vente__actions">
                  <Button variant="noir" onClick={() => void decider(v, "valider")}>
                    {t("pilot.valider")}
                  </Button>
                  <Button
                    variant="contour"
                    onClick={() => {
                      setRefus(v.id);
                      setMotif("");
                    }}
                  >
                    {t("pilot.refuser")}
                  </Button>
                </div>
              )}
              {peutDecider && refus === v.id && (
                <div className="validation__refus">
                  <Field label={t("pilot.motif")} value={motif} onChange={(e) => setMotif(e.target.value)} />
                  <Button disabled={motif.trim().length < 5} onClick={() => void decider(v, "refuser")}>
                    {t("pilot.confirmer.refus")}
                  </Button>
                  <Button variant="contour" onClick={() => setRefus(null)}>
                    {t("vente.retour")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
    </section>
  );
}

export function Audit() {
  const { t, lang } = useI18n();
  const lecture = useCached("pilot-audit", api.audit, []);
  const { data } = lecture;
  const { visibles, restants, plus } = usePagination(data);
  const date = new Intl.DateTimeFormat(lang, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <section className="carte">
      <h1>{t("rub.pilot.audit")}</h1>
      <Etat {...lecture} vide={data.length === 0} messageVide={t("pilot.audit.vide")}>
        <Table
          caption={t("rub.pilot.audit")}
          colonnes={[t("pilot.quand"), t("pilot.auteur"), t("pilot.action"), t("pilot.detail")]}
        >
          {visibles.map((l) => (
            <tr key={l.id}>
              <td>{date.format(new Date(l.date))}</td>
              <td>{l.auteur || t("pilot.systeme")}</td>
              <td>{l.action}</td>
              <td>{l.detail}</td>
            </tr>
          ))}
        </Table>
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
    </section>
  );
}
