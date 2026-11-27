import type { CashEntry } from "@jarvis/shared";
import { useCallback, useState } from "react";
import { api, type Caisse } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { jourActivite } from "../canal/regles.js";
import { useI18n } from "../i18n/index.js";
import { useAmener } from "../ui/amener.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Correction } from "../ui/Correction.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { formatFcfa } from "../vente/regles.js";

const VIDE: CashEntry[] = [];
const MOYENS = { cash: "paiement.especes", orange_money: "paiement.om", momo: "paiement.momo" } as const;
const signe = (e: CashEntry) => `${e.direction === "in" ? "+" : "−"} ${formatFcfa(e.amount)}`;

/** Détail d'une écriture et, pour le PDG et le gérant, sa correction par une écriture inverse. */
function Detail({
  ecriture: e,
  corrigee,
  onFait,
  onFermer,
}: Readonly<{ ecriture: CashEntry; corrigee: boolean; onFait: () => void; onFermer: () => void }>) {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const peut = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const [corriger, setCorriger] = useState(false);
  const empeche = (() => {
    if (e.saleId) return t("corr.caisse.vente");
    if (e.reversalOf) return t("corr.caisse.inverse");
    return corrigee ? t("corr.caisse.deja") : null;
  })();
  const lignes = [
    [t("gaz.heure"), new Date(e.createdAt).toLocaleString(lang)],
    [t("corr.libelle"), e.label],
    [t("gaz.client"), e.customerName ?? ""],
    [t("corr.montant"), signe(e)],
    [t("vente.paiement"), t(MOYENS[e.paymentMethod])],
    [t("corr.solde.apres"), formatFcfa(e.balanceAfter)],
  ].filter(([, valeur]) => valeur !== "");

  return (
    <>
      <section className="carte" aria-label={`${t("corr.ecriture")} ${e.number}`}>
        <h2>{`${t("corr.ecriture")} ${e.number}`}</h2>
        <dl>
          {lignes.map(([nom, valeur]) => (
            <div key={nom} className="livreur__ligne">
              <dt>{nom}</dt>
              <dd>{valeur}</dd>
            </div>
          ))}
        </dl>
        {peut && empeche && <p>{empeche}</p>}
        <div className="vente__actions">
          {peut && !empeche && !corriger && (
            <Button onClick={() => setCorriger(true)}>{t("corr.caisse")}</Button>
          )}
          <Button variant="contour" onClick={onFermer}>
            {t("corr.fermer")}
          </Button>
        </div>
      </section>
      {corriger && (
        <Correction
          titre={`${t("corr.caisse")} ${e.number}`}
          resume={`${t("corr.caisse.resume")} ${e.direction === "in" ? "−" : "+"} ${formatFcfa(e.amount)}.`}
          corps={e.id}
          envoyer={(justification, ref) => api.corrigerCaisse(e.id, justification, ref)}
          onFait={onFait}
          onAbandonner={() => setCorriger(false)}
        />
      )}
    </>
  );
}

/** Mouvements d'une caisse pour un jour ; le journal n'est jamais modifié. */
export function Journal({ caisse, onSolde }: Readonly<{ caisse: Caisse; onSolde: () => void }>) {
  const { t, lang } = useI18n();
  const [jour, setJour] = useState(() => jourActivite(new Date()));
  const charger = useCallback(
    (s: AbortSignal) => api.mouvementsCaisse(caisse.id, jour, s),
    [caisse.id, jour],
  );
  const lecture = useCached(`caisse-${caisse.id}-${jour}`, charger, VIDE);
  const { visibles, restants, plus } = usePagination(lecture.data);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const choisie = lecture.data.find((e) => e.id === ouverte);
  const heure = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });
  const titre = `${t("corr.mouvements")} : ${caisse.nom}`;
  const bloc = useAmener<HTMLElement>(false);

  return (
    <>
      <section ref={bloc} className="carte" aria-label={titre}>
        <h2>{titre}</h2>
        <Field
          label={t("canal.date")}
          type="date"
          value={jour}
          onChange={(e) => {
            if (!e.target.value) return;
            setJour(e.target.value);
            setOuverte(null);
          }}
        />
        {fait && <output className="bloc">{t("corr.faite")}</output>}
        <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("corr.aucun.mouvement")}>
          <Table cartes caption={titre} colonnes={[t("corr.piece"), t("corr.libelle"), t("corr.montant")]}>
            {visibles.map((e) => (
              <tr key={e.id}>
                <th scope="row">
                  <Button
                    variant="contour"
                    aria-label={`${t("corr.detail")} ${e.number}`}
                    onClick={() => {
                      setOuverte(e.id);
                      setFait(false);
                    }}
                  >
                    {e.number}
                  </Button>
                  <br />
                  {heure.format(new Date(e.createdAt))}
                </th>
                <td>
                  {e.label} {e.reversalOf && <Chip tone="alerte">{t("corr.inverse")}</Chip>}
                </td>
                <td>{signe(e)}</td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
        </Etat>
      </section>
      {choisie && (
        <Detail
          key={choisie.id}
          ecriture={choisie}
          corrigee={lecture.data.some((e) => e.reversalOf === choisie.id)}
          onFait={() => {
            setOuverte(null);
            setFait(true);
            lecture.recharger();
            onSolde();
          }}
          onFermer={() => setOuverte(null)}
        />
      )}
    </>
  );
}
