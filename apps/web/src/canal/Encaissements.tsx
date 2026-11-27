import type { CanalPayment, CanalPaymentInput } from "@jarvis/shared";
import { type FormEvent, useCallback, useId, useState } from "react";
import { api, type CanalFormula, type CanalSubscriber } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { useOutbox } from "../offline/useConnection.js";
import { Annulation } from "../ui/Annulation.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Segmented } from "../ui/Segmented.js";
import { Table } from "../ui/Table.js";
import { lienWhatsappPour } from "../ui/telephone.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { annulables, dateCourte, jourActivite, nouvelleEcheance, totalEncaisse } from "./regles.js";

/** Canal+ s'encaisse en espèces ou par Orange Money (les deux caisses du service). */
type Mode = "cash" | "orange_money";

const CAISSE: Record<Mode, string> = { cash: "canal_cash", orange_money: "canal_om" };

interface Fait {
  nom: string;
  telephone: string;
  montant: number;
  echeance: string;
}

function Saisie({
  abonnes,
  formules,
  encaisses,
}: Readonly<{
  abonnes: readonly CanalSubscriber[];
  formules: readonly CanalFormula[];
  /** Abonnés déjà encaissés aujourd'hui d'après le serveur. */
  encaisses: ReadonlySet<string>;
}>) {
  const { t, lang } = useI18n();
  const caisses = useCached("caisses", api.caisses, []);
  const [abonneId, setAbonneId] = useState("");
  const [formuleId, setFormuleId] = useState("");
  const [mode, setMode] = useState<Mode>("cash");
  const [confirme, setConfirme] = useState(false);
  const [fait, setFait] = useState<Fait | null>(null);
  const idAbonne = useId();
  const idFormule = useId();
  const enAttente = useOutbox().some(
    (o) => o.syncType === "canal_payment" && (o.body as { subscriberId?: string }).subscriberId === abonneId,
  );

  const abonne = abonnes.find((a) => a.id === abonneId);
  const formule = formules.find((f) => f.id === (formuleId || abonne?.formulaId));
  const caisse = caisses.data.find((c) => c.id === CAISSE[mode]);
  const standBy = caisse !== undefined && !caisse.actif;
  const inactive = formule !== undefined && !formule.active;
  const deja = abonne !== undefined && encaisses.has(abonne.id);
  const echeance =
    abonne && formule ? nouvelleEcheance(abonne.expiresOn, jourActivite(new Date()), formule.months) : null;
  const valide = echeance !== null && !standBy && !inactive && !enAttente && (!deja || confirme);

  const [encaisser, occupe] = useEnvoi(async () => {
    if (!abonne || !formule || !echeance) return;
    const body: CanalPaymentInput & { subscriberId: string } = {
      subscriberId: abonne.id,
      paymentMethod: mode,
      ...(formule.id === abonne.formulaId ? {} : { formulaId: formule.id }),
    };
    await ecrire({
      method: "POST",
      path: `/canal/subscribers/${abonne.id}/payments`,
      syncType: "canal_payment",
      label: `${t("canal.encaissement")} : ${abonne.name} (${formatFcfa(formule.price)})`,
      body,
    });
    setFait({ nom: abonne.name, telephone: abonne.phone, montant: formule.price, echeance });
    setAbonneId("");
    setFormuleId("");
    setConfirme(false);
  });

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (valide) void encaisser();
  }

  const recu = fait
    ? `${t("canal.recu")} ${fait.nom} : ${formatFcfa(fait.montant)}. ${t("canal.recu.jusqu")} ${dateCourte(fait.echeance, lang)}.`
    : "";

  return (
    <form className="carte" onSubmit={envoyer} aria-label={t("canal.encaisser.titre")}>
      <h2>{t("canal.encaisser.titre")}</h2>
      <div className="champ">
        <label className="champ__label" htmlFor={idAbonne}>
          {t("canal.abonne")}
        </label>
        <select
          id={idAbonne}
          className="champ__saisie"
          value={abonneId}
          onChange={(e) => {
            setAbonneId(e.target.value);
            setFormuleId("");
            setConfirme(false);
            setFait(null);
          }}
        >
          <option value="">—</option>
          {abonnes.map((a) => (
            <option key={a.id} value={a.id}>
              {`${a.name} (${a.decoderNumber})`}
            </option>
          ))}
        </select>
      </div>
      {abonne && (
        <div className="champ">
          <label className="champ__label" htmlFor={idFormule}>
            {t("canal.formule")}
          </label>
          <select
            id={idFormule}
            className="champ__saisie"
            value={formule?.id ?? ""}
            onChange={(e) => setFormuleId(e.target.value)}
          >
            {formules
              .filter((f) => f.active || f.id === abonne.formulaId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {`${f.name} (${formatFcfa(f.price)})`}
                </option>
              ))}
          </select>
        </div>
      )}
      <Segmented<Mode>
        legend={t("vente.paiement")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "cash", label: t("paiement.especes") },
          { value: "orange_money", label: t("paiement.om") },
        ]}
      />
      {echeance && (
        <output className="bloc">{`${t("canal.nouvelle.echeance")} : ${dateCourte(echeance, lang)}`}</output>
      )}
      {standBy && (
        <p role="alert" className="connexion__erreur">
          {t("canal.caisse.standby")}
        </p>
      )}
      {inactive && (
        <p role="alert" className="connexion__erreur">
          {t("canal.formule.inactive")}
        </p>
      )}
      {enAttente && (
        <p role="alert" className="connexion__erreur">
          {t("canal.attente")}
        </p>
      )}
      {deja && !enAttente && (
        <label className="vente__bascule">
          <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
          {t("canal.deja")}
        </label>
      )}
      <Button type="submit" disabled={!valide || occupe}>
        {formule && abonne ? `${t("vente.encaisser")} ${formatFcfa(formule.price)}` : t("vente.encaisser")}
      </Button>
      {fait && (
        <>
          <output className="bloc">{`${t("canal.encaisse.ok")} ${recu}`}</output>
          <a
            className="btn btn--contour"
            href={lienWhatsappPour(fait.telephone, recu)}
            target="_blank"
            rel="noreferrer"
          >
            {t("vente.whatsapp")}
          </a>
        </>
      )}
    </form>
  );
}

/** Abonnement et réabonnement : saisie (hors ligne comprise), journal du jour et annulation justifiée. */
export function Encaissements() {
  const [jour, setJour] = useState(() => jourActivite(new Date()));
  // La clé repart d'un état neuf à chaque date (sinon on verrait un instant la liste de la précédente).
  return <Journee key={jour} jour={jour} setJour={setJour} />;
}

function Journee({ jour, setJour }: Readonly<{ jour: string; setJour: (j: string) => void }>) {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const charger = useCallback((s: AbortSignal) => api.encaissementsCanal(jour, s), [jour]);
  const lecture = useCached(`canal-encaissements-${jour}`, charger, []);
  const abonnes = useCached("canal-abonnes", api.abonnesCanal, []);
  const formules = useCached("canal-formules", api.formulesCanal, []);
  const [annulation, setAnnulation] = useState<string | null>(null);
  const { visibles, restants, plus } = usePagination(lecture.data);
  const peutAnnuler = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const permis = annulables(lecture.data);
  const encaisses = new Set(
    jour === jourActivite(new Date())
      ? lecture.data.filter((p) => !p.cancelled && p.reversalOf === null).map((p) => p.subscriberId)
      : [],
  );
  const heure = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });
  const choisi = lecture.data.find((p) => p.id === annulation);

  async function annuler(paiement: CanalPayment, justification: string) {
    await ecrire({
      method: "POST",
      path: `/canal/payments/${paiement.id}/cancel`,
      label: `${t("canal.annuler")} : ${paiement.subscriberName}`,
      body: { justification },
    });
    lecture.modifier((l) => l.map((p) => (p.id === paiement.id ? { ...p, cancelled: true } : p)));
    setAnnulation(null);
  }

  return (
    <div className="page">
      <h1>{t("rub.canal.encaissements")}</h1>
      <Etat {...abonnes} vide={abonnes.data.length === 0} messageVide={t("canal.aucun")}>
        <Saisie
          abonnes={abonnes.data.filter((a) => a.active)}
          formules={formules.data}
          encaisses={encaisses}
        />
      </Etat>
      <section className="carte">
        <h2>{t("canal.journal")}</h2>
        <Field
          label={t("canal.date")}
          type="date"
          value={jour}
          onChange={(e) => e.target.value && setJour(e.target.value)}
        />
        <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("canal.aucun.encaissement")}>
          <p>
            <strong>{`${t("canal.total")} : ${formatFcfa(totalEncaisse(lecture.data))}`}</strong>
          </p>
          <Table
            caption={t("canal.journal")}
            colonnes={[t("gaz.heure"), t("canal.abonne"), t("canal.formule"), t("canal.montant"), ""]}
          >
            {visibles.map((p) => (
              <tr key={p.id}>
                <td>{heure.format(new Date(p.createdAt))}</td>
                <th scope="row">{p.subscriberName}</th>
                <td>{p.formulaName}</td>
                <td>{`${p.reversalOf ? "−" : ""}${formatFcfa(p.amount)}`}</td>
                <td>
                  {p.reversalOf && <Chip tone="alerte">{t("canal.annulation")}</Chip>}
                  {p.cancelled && <Chip tone="danger">{t("canal.annule")}</Chip>}
                  {peutAnnuler && permis.has(p.id) && (
                    <Button
                      variant="contour"
                      aria-label={`${t("canal.annuler")} ${p.subscriberName}`}
                      onClick={() => setAnnulation(p.id)}
                    >
                      {t("canal.annuler")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
          {choisi && (
            <Annulation
              key={choisi.id}
              objet={choisi.subscriberName}
              onConfirmer={(j) => annuler(choisi, j)}
              onAbandonner={() => setAnnulation(null)}
            />
          )}
        </Etat>
      </section>
    </div>
  );
}
