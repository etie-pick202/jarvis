import type { TrackedOrder } from "@jarvis/shared";
import { type FormEvent, useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { LanguageSwitch } from "../i18n/LanguageSwitch.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { LogoCocosab } from "../visuels/LogoCocosab.js";
import { expliquer } from "./commande.js";

function Reference({ jeton, onEnvoyee }: Readonly<{ jeton: string; onEnvoyee: (o: TrackedOrder) => void }>) {
  const { t } = useI18n();
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [envoyer, occupe] = useEnvoi(async () => {
    setMessage(null);
    try {
      onEnvoyee(await api.referencePaiement(jeton, reference.trim()));
      setReference("");
      setMessage(t("commande.reference.ok"));
    } catch (e) {
      const raison = expliquer(e);
      setMessage(raison.message || t("commande.echec.reseau"));
    }
  });
  const valide = reference.trim().length >= 3;

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (valide) void envoyer();
  }

  return (
    <form onSubmit={soumettre} aria-label={t("commande.reference")}>
      <Field
        label={t("commande.reference")}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <Button type="submit" disabled={!valide || occupe}>
        {t("commande.reference.envoyer")}
      </Button>
      {message && <output className="bloc">{message}</output>}
    </form>
  );
}

function Commande({ jeton }: Readonly<{ jeton: string }>) {
  const { t } = useI18n();
  const charger = useCallback((s: AbortSignal) => api.suivreCommande(jeton, s), [jeton]);
  const lecture = useCached<TrackedOrder | null>(`suivi-${jeton}`, charger, null);
  const o = lecture.data;
  const attendPaiement = o && o.paymentMethod !== "cash" && !o.paymentConfirmed && o.status !== "cancelled";

  return (
    <Etat {...lecture}>
      {o && (
        <section className="carte">
          <h2>{o.number}</h2>
          <p>
            <Chip tone={o.status === "cancelled" || o.status === "problem" ? "danger" : "ok"}>
              {t(`commande.statut.${o.status}`)}
            </Chip>
          </p>
          <p>{t(o.mode === "delivery" ? "vente.livraison" : "boutique.retrait")}</p>
          <p>
            {t(
              o.paymentMethod === "cash"
                ? "commande.paiement.reception"
                : o.paymentConfirmed
                  ? "commande.paiement.confirme"
                  : "commande.paiement.attente",
            )}
          </p>
          <dl className="vente__recap">
            {o.lines.map((l) => (
              <div key={l.label}>
                <dt>{`${l.label} × ${l.quantity}`}</dt>
                <dd>{formatFcfa(l.total)}</dd>
              </div>
            ))}
            <div className="vente__total">
              <dt>{t("vente.total")}</dt>
              <dd>{formatFcfa(o.total)}</dd>
            </div>
          </dl>
          {attendPaiement && <Reference jeton={jeton} onEnvoyee={(n) => lecture.modifier(() => n)} />}
          <Button variant="contour" onClick={lecture.recharger}>
            {t("commande.actualiser")}
          </Button>
        </section>
      )}
    </Etat>
  );
}

/** Suivi d'une commande par son lien, sans compte. */
export function Suivi() {
  const { t } = useI18n();
  const { jeton = "" } = useParams();
  return (
    <div className="boutique">
      <header className="boutique__entete">
        <LogoCocosab sur="sombre" />
        <LanguageSwitch />
        <Link className="btn btn--contour" to="/boutique">
          {t("commande.retour")}
        </Link>
      </header>
      <main className="page">
        <h1>{t("commande.suivi")}</h1>
        <p>{t("commande.suivi.aide")}</p>
        <Commande key={jeton} jeton={jeton} />
      </main>
    </div>
  );
}
