import type { Order, OrderStatus, PaymentMethod } from "@jarvis/shared";
import { useId, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { Annulation } from "../ui/Annulation.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Segmented } from "../ui/Segmented.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { type Action, actionsPossibles, FILTRES, type Filtre, refus } from "./regles.js";

const LIBELLES: Record<PaymentMethod, "paiement.especes" | "paiement.om" | "paiement.momo"> = {
  cash: "paiement.especes",
  orange_money: "paiement.om",
  momo: "paiement.momo",
};

type Livreur = { id: string; displayName: string };
/** Envoie l'action au serveur ; vrai si elle est acceptée. */
type Agir = (action: Action, corps?: unknown) => Promise<boolean>;

function Validation({ commande, agir }: Readonly<{ commande: Order; agir: Agir }>) {
  const { t } = useI18n();
  const [frais, setFrais] = useState(String(commande.deliveryFeePerBottle));
  const livraison = commande.mode === "delivery";
  const montant = /^\d{1,6}$/u.test(frais.trim()) ? Number(frais) : null;
  const [valider, occupe] = useEnvoi(async () => {
    await agir(
      "validate",
      livraison && montant !== commande.deliveryFeePerBottle ? { deliveryFeePerBottle: montant } : {},
    );
  });
  return (
    <div className="validation__refus">
      {livraison && (
        <Field
          label={`${t("commandes.frais")} (${commande.number})`}
          inputMode="numeric"
          value={frais}
          onChange={(e) => setFrais(e.target.value)}
        />
      )}
      <Button disabled={occupe || (livraison && montant === null)} onClick={() => void valider()}>
        {t("commandes.valider")}
      </Button>
    </div>
  );
}

function Affectation({
  commande,
  livreurs,
  agir,
}: Readonly<{ commande: Order; livreurs: readonly Livreur[]; agir: Agir }>) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={id}>
        {`${t("commandes.livreur")} (${commande.number})`}
      </label>
      <select
        id={id}
        className="champ__saisie"
        value={commande.assignedTo ?? ""}
        onChange={(e) => e.target.value && void agir("assign", { driverId: e.target.value })}
      >
        <option value="">{t("commandes.non.confiee")}</option>
        {livreurs.map((l) => (
          <option key={l.id} value={l.id}>
            {l.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

function Carte({
  commande: o,
  livreurs,
  gere,
  agir,
}: Readonly<{ commande: Order; livreurs: readonly Livreur[]; gere: boolean; agir: Agir }>) {
  const { t, lang } = useI18n();
  const [panneau, setPanneau] = useState<"annuler" | "remise" | null>(null);
  const [encaisse, setEncaisse] = useState(false);
  const possibles = gere ? actionsPossibles(o) : [];
  const confirmee = o.paymentConfirmedAt !== null;
  const quand = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
  const [confirmer, confirmation] = useEnvoi(async () => {
    await agir("confirm-payment");
  });
  const [remettre, remise] = useEnvoi(async () => {
    const moyen: PaymentMethod = o.paymentMethod !== "cash" && confirmee ? o.paymentMethod : "cash";
    if (await agir("collect", { paymentMethod: moyen })) setPanneau(null);
  });

  return (
    <li>
      <article className="carte" aria-label={`${o.number} ${o.customerName}`}>
        <div className="livreur__ligne">
          <h2>{`${o.number} · ${o.customerName}`}</h2>
          <Chip tone={o.status === "cancelled" || o.status === "problem" ? "danger" : "info"}>
            {t(`commande.statut.${o.status}`)}
          </Chip>
        </div>
        <p className="champ__aide">
          {[
            quand.format(new Date(o.createdAt)),
            t(o.source === "online" ? "commandes.en.ligne" : "commandes.telephone"),
            t(o.mode === "delivery" ? "vente.livraison" : "boutique.retrait"),
          ].join(" · ")}
        </p>
        <p>
          <a href={`tel:${o.phone}`}>{o.phone}</a>
          {[o.neighbourhoodName, o.landmark]
            .filter(Boolean)
            .map((x) => ` · ${x}`)
            .join("")}
        </p>
        <ul className="liste">
          {o.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: les lignes d'une commande ne changent pas d'ordre
            <li key={i}>{`${l.label} × ${l.quantity} : ${formatFcfa(l.total)}`}</li>
          ))}
        </ul>
        <p>
          <strong>{formatFcfa(o.total)}</strong>
          {` · ${t(LIBELLES[o.paymentMethod])}`}
          {o.paymentMethod !== "cash" &&
            ` · ${o.paymentReference ?? t("commandes.sans.reference")} · ${t(confirmee ? "mode.confirme" : "mode.a.confirmer")}`}
        </p>
        {o.problemNote && o.status === "problem" && <p>{o.problemNote}</p>}
        {possibles.includes("assign") && <Affectation commande={o} livreurs={livreurs} agir={agir} />}
        {possibles.includes("validate") && <Validation commande={o} agir={agir} />}
        <div className="vente__actions">
          {possibles.includes("confirm-payment") && (
            <Button variant="noir" disabled={confirmation} onClick={() => void confirmer()}>
              {t("commandes.confirmer.paiement")}
            </Button>
          )}
          {possibles.includes("collect") && panneau !== "remise" && (
            <Button onClick={() => setPanneau("remise")}>{t("commandes.remettre")}</Button>
          )}
          {possibles.includes("cancel") && panneau !== "annuler" && (
            <Button variant="contour" onClick={() => setPanneau("annuler")}>
              {t("canal.annuler")}
            </Button>
          )}
        </div>
        {panneau === "remise" && (
          <div className="validation__refus">
            <label className="vente__bascule">
              <input type="checkbox" checked={encaisse} onChange={(e) => setEncaisse(e.target.checked)} />
              {`${t("mode.encaisse")} (${formatFcfa(o.total)})`}
            </label>
            <Button disabled={!encaisse || remise} onClick={() => void remettre()}>
              {t("mode.confirmer")}
            </Button>
          </div>
        )}
        {panneau === "annuler" && (
          <Annulation
            objet={o.number}
            onConfirmer={async (justification) => {
              if (await agir("cancel", { justification })) setPanneau(null);
            }}
            onAbandonner={() => setPanneau(null)}
          />
        )}
      </article>
    </li>
  );
}

const STATUTS: Record<Filtre, readonly OrderStatus[]> = FILTRES;

/**
 * Commandes de la boutique : valider (stock réservé), confirmer un paiement mobile, confier à un livreur,
 * remettre un retrait, annuler avec motif. Ces gestes demandent le réseau : le serveur revérifie le stock.
 */
export function Commandes({ historique = false }: Readonly<{ historique?: boolean }>) {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const gere = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const lecture = useCached("commandes", api.commandes, []);
  const livreurs = useCached("livreurs", api.livreurs, []);
  const [filtre, setFiltre] = useState<Filtre>(historique ? "finies" : "attente");
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = lecture.data.filter((o) => STATUTS[filtre].includes(o.status));
  const { visibles, restants, plus } = usePagination(liste, 20);
  const titre = historique ? t("rub.livre.historique") : t("rub.vente.commandes");

  const agirSur =
    (commande: Order): Agir =>
    async (action, corps) => {
      setErreur(null);
      try {
        const suivante = await api.agirCommande(commande.id, action, corps);
        lecture.modifier((l) => l.map((o) => (o.id === commande.id ? suivante : o)));
        return true;
      } catch (e) {
        setErreur(`${commande.number} : ${refus(e) ?? t("commandes.reseau")}`);
        // L'état a pu changer ailleurs (autre appareil, livreur) : on relit.
        lecture.recharger();
        return false;
      }
    };

  return (
    <div className="page">
      <h1>{titre}</h1>
      {!historique && (
        <Segmented<Filtre>
          legend={t("commandes.filtre")}
          value={filtre}
          onChange={setFiltre}
          options={(["attente", "cours", "finies"] as const).map((f) => ({
            value: f,
            label: `${t(`commandes.filtre.${f}`)} (${lecture.data.filter((o) => STATUTS[f].includes(o.status)).length})`,
          }))}
        />
      )}
      {erreur && (
        <p role="alert" className="connexion__erreur">
          {erreur}
        </p>
      )}
      <Etat {...lecture} vide={liste.length === 0} messageVide={t("commandes.aucune")}>
        <ul className="liste">
          {visibles.map((o) => (
            <Carte key={o.id} commande={o} livreurs={livreurs.data} gere={gere} agir={agirSur(o)} />
          ))}
        </ul>
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
    </div>
  );
}

export const HistoriqueCommandes = () => <Commandes historique />;
