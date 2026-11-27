import type { CompleteOrderInput, Delivery, OrderStatus, PaymentMethod } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { useOutbox } from "../offline/useConnection.js";
import { Button } from "../ui/Button.js";
import { Chip, type Tone } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";

const TONS: Record<OrderStatus, Tone> = {
  pending: "neutre",
  validated: "alerte",
  out_for_delivery: "info",
  delivered: "ok",
  problem: "danger",
  cancelled: "neutre",
};

/** Un paiement mobile ne s'encaisse que s'il a été confirmé par le gérant ; sinon, des espèces. */
function moyensPossibles(l: Delivery): PaymentMethod[] {
  return l.paymentMethod !== "cash" && l.paymentConfirmed ? [l.paymentMethod, "cash"] : ["cash"];
}

const LIBELLES = { cash: "paiement.especes", orange_money: "paiement.om", momo: "paiement.momo" } as const;

function Remise({
  livraison,
  onValider,
  onAnnuler,
}: Readonly<{
  livraison: Delivery;
  onValider: (corps: CompleteOrderInput) => Promise<void>;
  onAnnuler: () => void;
}>) {
  const { t } = useI18n();
  const moyens = moyensPossibles(livraison);
  const [moyen, setMoyen] = useState<PaymentMethod>(moyens[0] ?? "cash");
  const [encaisse, setEncaisse] = useState(false);
  const [vides, setVides] = useState(false);
  const dejaPaye = moyen !== "cash";
  const aDuGaz = livraison.lines.some((l) => l.kind === "gas");
  const pret = (dejaPaye || encaisse) && (!aDuGaz || vides);
  const [valider, occupe] = useEnvoi(() => onValider({ paymentMethod: moyen }));

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (pret) void valider();
  }

  return (
    <form onSubmit={envoyer} aria-label={`${t("mode.remise")} ${livraison.number}`}>
      <p>
        <strong>{`${t(dejaPaye ? "mode.deja.paye" : "mode.a.encaisser")} ${formatFcfa(livraison.total)}`}</strong>
      </p>
      {moyens.length > 1 && (
        <Segmented<PaymentMethod>
          legend={t("vente.paiement")}
          value={moyen}
          onChange={setMoyen}
          options={moyens.map((m) => ({ value: m, label: t(LIBELLES[m]) }))}
        />
      )}
      {livraison.paymentMethod !== "cash" && !livraison.paymentConfirmed && (
        <output className="bloc">{t("mode.mobile.non.confirme")}</output>
      )}
      {!dejaPaye && (
        <label className="vente__bascule">
          <input type="checkbox" checked={encaisse} onChange={(e) => setEncaisse(e.target.checked)} />
          {t("mode.encaisse")}
        </label>
      )}
      {aDuGaz && (
        <label className="vente__bascule">
          <input type="checkbox" checked={vides} onChange={(e) => setVides(e.target.checked)} />
          {t("mode.vides")}
        </label>
      )}
      <div className="vente__actions">
        <Button type="submit" disabled={!pret || occupe}>
          {t("mode.confirmer")}
        </Button>
        <Button variant="contour" onClick={onAnnuler}>
          {t("vente.retour")}
        </Button>
      </div>
    </form>
  );
}

function Probleme({
  onValider,
  onAnnuler,
}: Readonly<{ onValider: (note: string) => Promise<void>; onAnnuler: () => void }>) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [valider, occupe] = useEnvoi(() => onValider(note.trim()));
  const pret = note.trim().length >= 3;

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (pret) void valider();
  }

  return (
    <form onSubmit={envoyer} aria-label={t("mode.probleme")}>
      <Field
        label={t("mode.probleme.note")}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="vente__actions">
        <Button type="submit" disabled={!pret || occupe}>
          {t("mode.signaler")}
        </Button>
        <Button variant="contour" onClick={onAnnuler}>
          {t("vente.retour")}
        </Button>
      </div>
    </form>
  );
}

function Carte({
  livraison: l,
  enAttente,
  onChange,
}: Readonly<{
  livraison: Delivery;
  enAttente: boolean;
  onChange: (suivante: Delivery) => void;
}>) {
  const { t } = useI18n();
  const [panneau, setPanneau] = useState<"remise" | "probleme" | null>(null);

  async function agir(action: "depart" | "delivered" | "problem", body: unknown, suivante: Delivery) {
    await ecrire({
      method: "POST",
      path: `/deliveries/${l.id}/${action}`,
      label: `${l.number} · ${t(`mode.etat.${suivante.status}`)}`,
      body,
    });
    onChange(suivante);
    setPanneau(null);
  }

  const [partir, depart] = useEnvoi(() => agir("depart", undefined, { ...l, status: "out_for_delivery" }));
  const aPartir = l.status === "validated" || l.status === "problem";
  const enRoute = l.status === "out_for_delivery";
  const adresse = [l.neighbourhoodName, l.landmark].filter(Boolean).join(" · ");

  return (
    <article className="carte" aria-label={`${l.number} ${l.customerName}`}>
      <div className="livreur__ligne">
        <strong>{l.customerName}</strong>
        <Chip tone={TONS[l.status]}>{t(`mode.etat.${l.status}`)}</Chip>
      </div>
      <p>{`${l.number}${adresse ? ` · ${adresse}` : ""}`}</p>
      <ul className="liste">
        {l.lines.map((ligne, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: les lignes d'une commande ne changent pas d'ordre
          <li key={i}>{`${ligne.label} × ${ligne.quantity}`}</li>
        ))}
      </ul>
      <p>
        <strong>{formatFcfa(l.total)}</strong>
        {` · ${t(LIBELLES[l.paymentMethod])}`}
        {l.paymentMethod !== "cash" && ` (${t(l.paymentConfirmed ? "mode.confirme" : "mode.a.confirmer")})`}
      </p>
      <div className="vente__actions">
        <a className="btn btn--contour" href={`tel:${l.phone}`}>
          {`${t("mode.appeler")} ${l.phone}`}
        </a>
        {l.latitude !== null && l.longitude !== null && (
          <a
            className="btn btn--contour"
            href={`https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}&zoom=17`}
            target="_blank"
            rel="noreferrer"
          >
            {t("mode.carte")}
          </a>
        )}
      </div>
      {l.problemNote && l.status === "problem" && <p>{l.problemNote}</p>}
      {enAttente && <output className="bloc">{t("mode.attente")}</output>}
      {panneau === null && (aPartir || enRoute) && (
        <div className="livreur__actions">
          <Button variant="noir" disabled={!aPartir || depart} onClick={() => void partir()}>
            {t("mode.parti")}
          </Button>
          <Button disabled={!enRoute} onClick={() => setPanneau("remise")}>
            {t("mode.livre")}
          </Button>
          <Button variant="contour" disabled={l.status === "problem"} onClick={() => setPanneau("probleme")}>
            {t("mode.probleme")}
          </Button>
        </div>
      )}
      {panneau === "remise" && (
        <Remise
          livraison={l}
          onValider={(corps) => agir("delivered", corps, { ...l, status: "delivered" })}
          onAnnuler={() => setPanneau(null)}
        />
      )}
      {panneau === "probleme" && (
        <Probleme
          onValider={(note) => agir("problem", { note }, { ...l, status: "problem", problemNote: note })}
          onAnnuler={() => setPanneau(null)}
        />
      )}
    </article>
  );
}

/** Mode livreur : la tournée du jour et trois boutons (Parti, Livré, Problème), utilisables sans réseau. */
export function LivreurMode() {
  const { t } = useI18n();
  const lecture = useCached("tournee", api.tournee, []);
  const attente = useOutbox().filter((o) => o.status === "pending");

  return (
    <section aria-labelledby="titre-livreur" className="livreur">
      <h1 id="titre-livreur">{t("mode.titre")}</h1>
      <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("mode.vide")}>
        {lecture.data.map((l) => (
          <Carte
            key={l.id}
            livraison={l}
            enAttente={attente.some((o) => o.path.startsWith(`/deliveries/${l.id}/`))}
            onChange={(suivante) => lecture.modifier((d) => d.map((x) => (x.id === l.id ? suivante : x)))}
          />
        ))}
      </Etat>
    </section>
  );
}
