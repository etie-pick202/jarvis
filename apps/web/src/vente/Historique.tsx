import type { Sale } from "@jarvis/shared";
import { useCallback, useState } from "react";
import { ApiError } from "../api/client.js";
import { api } from "../api/index.js";
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
import { partagerFichier } from "../ui/partage.js";
import { Table } from "../ui/Table.js";
import { annulables, jourActivite, totalVendu } from "./net.js";
import { recuDeVente } from "./recuServeur.js";
import { formatFcfa } from "./regles.js";

const MOYENS = { cash: "paiement.especes", orange_money: "paiement.om", momo: "paiement.momo" } as const;

function Journee({ jour, setJour }: Readonly<{ jour: string; setJour: (j: string) => void }>) {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const charger = useCallback((s: AbortSignal) => api.ventesDuJour(jour, s), [jour]);
  const lecture = useCached(`ventes-${jour}`, charger, []);
  const noms = useCached("noms-produits", api.nomsProduits, {});
  const attente = useOutbox().filter((o) => o.syncType === "sale").length;
  const [annulation, setAnnulation] = useState<string | null>(null);
  const [recuEnCours, setRecuEnCours] = useState<string | null>(null);
  const [avis, setAvis] = useState<{ texte: string; erreur: boolean } | null>(null);
  const { visibles, restants, plus } = usePagination(lecture.data);
  const peutAnnuler = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const permises = annulables(lecture.data);
  const choisie = lecture.data.find((v) => v.id === annulation);
  const heure = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" });

  const detail = (v: Sale) =>
    v.lines
      .map((l) => `${noms.data[l.articleId ?? l.brandId ?? ""] ?? t("vente.article")} × ${l.quantity}`)
      .join(", ");

  async function recu(vente: Sale) {
    if (recuEnCours) return;
    setRecuEnCours(vente.id);
    setAvis(null);
    try {
      const { contenu, local } = await recuDeVente(vente, lang, () => [
        `COCOSAB - ${t(vente.reversalOf ? "canal.annulation" : "vente.recu")} ${vente.number}`,
        new Date(vente.createdAt).toLocaleString(lang),
        `${t("gaz.client")} : ${vente.customerName}`,
        detail(vente),
        `${t("vente.total")} : ${formatFcfa(Math.abs(vente.total))}`,
        t(MOYENS[vente.paymentMethod]),
      ]);
      await partagerFichier(`recu-${vente.number}.pdf`, contenu, vente.number);
      if (local) setAvis({ texte: t("ventes.recu.local"), erreur: false });
    } catch (e) {
      setAvis({ texte: e instanceof ApiError ? e.message : t("ventes.recu.erreur"), erreur: true });
    } finally {
      setRecuEnCours(null);
    }
  }

  async function annuler(vente: Sale, justification: string) {
    await ecrire({
      method: "POST",
      path: `/sales/${vente.id}/cancel`,
      label: `${t("canal.annuler")} : ${vente.number}`,
      body: { justification },
    });
    // La ligne inverse viendra du serveur ; en attendant, la vente est marquée comme annulée.
    lecture.modifier((l) => [...l, { ...vente, id: `annulation-${vente.id}`, reversalOf: vente.id }]);
    setAnnulation(null);
  }

  return (
    <section className="carte page">
      <h1>{t("rub.vente.historique")}</h1>
      <Field
        label={t("canal.date")}
        type="date"
        value={jour}
        onChange={(e) => e.target.value && setJour(e.target.value)}
      />
      {attente > 0 && <output className="bloc">{`${attente} ${t("ventes.attente")}`}</output>}
      {avis &&
        (avis.erreur ? (
          <p role="alert" className="connexion__erreur">
            {avis.texte}
          </p>
        ) : (
          <output className="bloc">{avis.texte}</output>
        ))}
      <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("ventes.aucune")}>
        <p>
          <strong>{`${t("ventes.total")} : ${formatFcfa(totalVendu(lecture.data))}`}</strong>
        </p>
        <Table
          caption={t("rub.vente.historique")}
          colonnes={[t("gaz.heure"), t("ventes.numero"), t("gaz.client"), t("vente.total"), ""]}
        >
          {visibles.map((v) => (
            <tr key={v.id}>
              <td>{heure.format(new Date(v.createdAt))}</td>
              <th scope="row">
                {v.number}
                <br />
                {detail(v)}
              </th>
              <td>{v.customerName}</td>
              <td>
                {`${v.reversalOf ? "−" : ""}${formatFcfa(Math.abs(v.total))}`}
                <br />
                {t(MOYENS[v.paymentMethod])}
              </td>
              <td>
                {v.reversalOf && <Chip tone="alerte">{t("canal.annulation")}</Chip>}
                {lecture.data.some((x) => x.reversalOf === v.id) && (
                  <Chip tone="danger">{t("ventes.annulee")}</Chip>
                )}
                {/* Une annulation pas encore envoyée n'a pas d'identifiant côté serveur. */}
                {!v.id.startsWith("annulation-") && (
                  <Button
                    variant="contour"
                    aria-label={`${t("vente.recu")} ${v.number}`}
                    disabled={recuEnCours !== null}
                    onClick={() => void recu(v)}
                  >
                    {t("vente.recu")}
                  </Button>
                )}
                {peutAnnuler && permises.has(v.id) && (
                  <Button
                    variant="contour"
                    aria-label={`${t("canal.annuler")} ${v.number}`}
                    onClick={() => setAnnulation(v.id)}
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
            objet={choisie.number}
            onConfirmer={(j) => annuler(choisie, j)}
            onAbandonner={() => setAnnulation(null)}
          />
        )}
      </Etat>
    </section>
  );
}

/** Ventes d'un jour : détail, total, annulation justifiée (PDG et gérant) ; rien n'est jamais effacé. */
export function Historique() {
  const [jour, setJour] = useState(() => jourActivite(new Date()));
  return <Journee key={jour} jour={jour} setJour={setJour} />;
}
