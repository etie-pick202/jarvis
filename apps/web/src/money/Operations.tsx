import type { MobileOperator, MoneyOperation, MoneyOperationInput, MoneyOperationKind } from "@jarvis/shared";
import { type FormEvent, useCallback, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useCaisses } from "../caisse/donnees.js";
import { jourActivite } from "../canal/regles.js";
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
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { annulable, OPERATEURS, referenceDejaVue, soldeInsuffisant } from "./regles.js";

const MONTANT_MAX = 999_999_999;

function Saisie({ journal }: Readonly<{ journal: readonly MoneyOperation[] }>) {
  const { t } = useI18n();
  const floats = useCached("money-float", api.floats, []);
  const { caisses } = useCaisses();
  const attente = useOutbox().filter((o) => o.path === "/money/operations");
  const [operateur, setOperateur] = useState<MobileOperator>("orange_money");
  const [sens, setSens] = useState<MoneyOperationKind>("deposit");
  const [montant, setMontant] = useState("");
  const [telephone, setTelephone] = useState("");
  const [client, setClient] = useState("");
  const [reference, setReference] = useState("");
  const [ok, setOk] = useState(false);

  const etat = floats.data.find((f) => f.operator === operateur);
  const standBy = etat !== undefined && !etat.active;
  const somme = /^\d+$/u.test(montant.trim()) ? Number(montant) : 0;
  const tropGrand = somme > MONTANT_MAX;
  const insuffisant = soldeInsuffisant(sens, somme, {
    float: etat?.float,
    especes: caisses.find((c) => c.id === "sales_cash")?.solde,
  });
  const doublon = referenceDejaVue(reference, operateur, [
    ...journal,
    ...attente.map((o) => o.body as MoneyOperationInput),
  ]);
  const valide =
    !standBy &&
    somme > 0 &&
    !tropGrand &&
    !insuffisant &&
    !doublon &&
    telephone.trim().length >= 6 &&
    reference.trim().length >= 3;

  const [enregistrer, occupe] = useEnvoi(async () => {
    const body: MoneyOperationInput = {
      operator: operateur,
      kind: sens,
      amount: somme,
      phone: telephone.trim(),
      ...(client.trim() ? { customerName: client.trim() } : {}),
      reference: reference.trim(),
    };
    const nomSens = t(`money.sens.${sens}`);
    const nomOperateur = t(`money.operateur.${operateur}`);
    await ecrire({
      method: "POST",
      path: "/money/operations",
      label: `${nomSens} ${nomOperateur} : ${formatFcfa(somme)} (${body.reference})`,
      body,
    });
    setMontant("");
    setTelephone("");
    setClient("");
    setReference("");
    setOk(true);
  });

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (valide) void enregistrer();
  }

  const saisir = (f: (v: string) => void) => (e: { target: { value: string } }) => {
    f(e.target.value);
    setOk(false);
  };

  return (
    <form className="carte" onSubmit={envoyer} aria-label={t("money.nouvelle")}>
      <h2>{t("money.nouvelle")}</h2>
      <Segmented<MobileOperator>
        legend={t("money.operateur")}
        value={operateur}
        onChange={setOperateur}
        options={OPERATEURS.map((o) => ({ value: o, label: t(`money.operateur.${o}`) }))}
      />
      <Segmented<MoneyOperationKind>
        legend={t("money.sens")}
        value={sens}
        onChange={setSens}
        options={[
          { value: "deposit", label: t("money.sens.deposit") },
          { value: "withdrawal", label: t("money.sens.withdrawal") },
        ]}
      />
      <p>{t(`money.aide.${sens}`)}</p>
      {standBy && (
        <p role="alert" className="connexion__erreur">
          {t("money.standby")}
        </p>
      )}
      <Field label={t("caisse.montant")} inputMode="numeric" value={montant} onChange={saisir(setMontant)} />
      {tropGrand && (
        <p role="alert" className="connexion__erreur">
          {t("money.trop.grand")}
        </p>
      )}
      {insuffisant && !tropGrand && (
        <p role="alert" className="connexion__erreur">
          {t(sens === "deposit" ? "money.float.insuffisant" : "money.especes.insuffisantes")}
        </p>
      )}
      <Field label={t("money.telephone")} type="tel" value={telephone} onChange={saisir(setTelephone)} />
      <Field label={t("money.client")} value={client} onChange={saisir(setClient)} />
      <Field label={t("money.reference")} value={reference} onChange={saisir(setReference)} />
      {doublon && (
        <p role="alert" className="connexion__erreur">
          {t("money.doublon")}
        </p>
      )}
      <Button type="submit" disabled={!valide || occupe}>
        {t("caisse.enregistrer")}
      </Button>
      {ok && <output className="bloc">{t("money.ok")}</output>}
    </form>
  );
}

function Journal() {
  const { t, lang } = useI18n();
  const jour = jourActivite(new Date());
  const charger = useCallback((s: AbortSignal) => api.operationsMoney(jour, s), [jour]);
  const lecture = useCached(`money-operations-${jour}`, charger, []);
  const { visibles, restants, plus } = usePagination(lecture.data);
  const [annulation, setAnnulation] = useState<string | null>(null);
  const choisie = lecture.data.find((o) => o.id === annulation);
  const heure = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });

  async function annuler(operation: MoneyOperation, justification: string) {
    await ecrire({
      method: "POST",
      path: `/money/operations/${operation.id}/cancel`,
      label: `${t("canal.annuler")} : ${operation.reference}`,
      body: { justification },
    });
    lecture.modifier((l) => l.map((o) => (o.id === operation.id ? { ...o, cancelled: true } : o)));
    setAnnulation(null);
  }

  return (
    <>
      <Saisie journal={lecture.data} />
      <section className="carte">
        <h2>{t("money.journal")}</h2>
        <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("money.aucune")}>
          <Table
            caption={t("money.journal")}
            colonnes={[t("gaz.heure"), t("money.reference"), t("money.operation"), t("canal.montant"), ""]}
          >
            {visibles.map((o) => (
              <tr key={o.id}>
                <td>{heure.format(new Date(o.createdAt))}</td>
                <th scope="row">
                  {o.reference}
                  <br />
                  {o.customerName ?? o.phone}
                </th>
                <td>{[t(`money.sens.${o.kind}`), t(`money.operateur.${o.operator}`)].join(" · ")}</td>
                <td>{`${o.reversalOf ? "−" : ""}${formatFcfa(o.amount)}`}</td>
                <td>
                  {o.reversalOf ? <Chip tone="alerte">{t("canal.annulation")}</Chip> : null}
                  {o.cancelled ? <Chip tone="danger">{t("canal.annule")}</Chip> : null}
                  {annulable(o) && (
                    <Button
                      variant="contour"
                      aria-label={`${t("canal.annuler")} ${o.reference}`}
                      onClick={() => setAnnulation(o.id)}
                    >
                      {t("canal.annuler")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
          {choisie && (
            <Annulation
              key={choisie.id}
              objet={choisie.reference}
              onConfirmer={(j) => annuler(choisie, j)}
              onAbandonner={() => setAnnulation(null)}
            />
          )}
        </Etat>
      </section>
    </>
  );
}

/** Dépôts et retraits Orange Money et MoMo : saisie (hors ligne comprise), journal du jour, annulation. */
export function Operations() {
  const { t } = useI18n();
  return (
    <div className="page">
      <h1>{t("rub.money.operations")}</h1>
      <Journal />
    </div>
  );
}
