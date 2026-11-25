import { type FormEvent, useId, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { ecrire } from "../offline/ecrire.js";
import { useOutbox } from "../offline/useConnection.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { compresserPiece } from "./piece.js";

interface Ligne {
  pleines: string;
  vides: string;
  prix: string;
}

const VIDE: Ligne = { pleines: "", vides: "", prix: "" };
const nombre = (v: string) => (v.trim() === "" ? 0 : Number(v));

/** Réception fournisseur à sa date réelle ; la pièce justificative est obligatoire. */
export function Receptions() {
  const { t, lang } = useI18n();
  const { data: fournisseurs } = useCached("fournisseurs", api.fournisseurs, []);
  const { data: marques } = useCached("marques", api.marques, []);
  const { data: formats } = useCached("formats", api.formats, []);
  const { data: recues } = useCached("gaz-receptions", api.receptions, []);
  const enAttente = useOutbox().filter((o) => o.path === "/receptions" && o.status === "pending");
  const [fournisseurId, setFournisseurId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [piece, setPiece] = useState<File | null>(null);
  const [enregistree, setEnregistree] = useState(false);
  const idFournisseur = useId();
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);

  // Une ligne par marque fournie et par format : le serveur compte les bouteilles par marque et par format.
  const saisies = (fournisseur?.brandIds ?? []).flatMap((brandId) =>
    formats.map((f) => {
      const cle = `${brandId}:${f.id}`;
      const nom = marques.find((m) => m.id === brandId)?.nom ?? "?";
      return {
        cle,
        brandId,
        formatId: f.id,
        titre: formats.length > 1 ? `${nom} ${f.libelle}` : nom,
        ...(lignes[cle] ?? VIDE),
      };
    }),
  );
  const quantites = saisies.some((l) => nombre(l.pleines) > 0 || nombre(l.vides) > 0);
  const valide = fournisseur !== undefined && date !== "" && quantites && piece !== null;
  const jour = new Intl.DateTimeFormat(lang, { day: "2-digit", month: "short", year: "numeric" });

  function maj(cle: string, champ: keyof Ligne, valeur: string) {
    setLignes((l) => ({ ...l, [cle]: { ...(l[cle] ?? VIDE), [champ]: valeur } }));
    setEnregistree(false);
  }

  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (!fournisseur || !piece) return;
    // La pièce est compressée puis gardée sur l'appareil jusqu'à son envoi (réception « en attente de la pièce »).
    const blob = await compresserPiece(piece);
    const pieceId = crypto.randomUUID();
    await db.pieces.add({ id: pieceId, nom: piece.name, blob });
    await ecrire({
      method: "POST",
      path: "/receptions",
      syncType: "reception",
      label: `${t("gaz.reception.titre")} : ${fournisseur.nom}`,
      pieceId,
      body: {
        supplierId: fournisseur.id,
        receivedAt: `${date}T12:00:00.000Z`,
        lines: saisies
          .filter((l) => nombre(l.pleines) > 0 || nombre(l.vides) > 0)
          .map((l) => ({
            brandId: l.brandId,
            formatId: l.formatId,
            fullReceived: nombre(l.pleines),
            emptyReturned: nombre(l.vides),
            unitCost: nombre(l.prix),
          })),
      },
    });
    setLignes({});
    setPiece(null);
    setFournisseurId("");
    setEnregistree(true);
  }

  return (
    <div className="page">
      <form className="carte" onSubmit={enregistrer}>
        <h1>{t("gaz.reception.titre")}</h1>
        <div className="champ">
          <label className="champ__label" htmlFor={idFournisseur}>
            {t("gaz.reception.fournisseur")}
          </label>
          <select
            id={idFournisseur}
            className="champ__saisie"
            value={fournisseurId}
            onChange={(e) => setFournisseurId(e.target.value)}
          >
            <option value="">—</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t("gaz.reception.date")}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {saisies.map((l) => (
          <fieldset key={l.cle} className="reception__ligne">
            <legend className="champ__label">{l.titre}</legend>
            <Field
              label={t("gaz.reception.pleines")}
              inputMode="numeric"
              value={l.pleines}
              onChange={(e) => maj(l.cle, "pleines", e.target.value)}
            />
            <Field
              label={t("gaz.reception.vides")}
              inputMode="numeric"
              value={l.vides}
              onChange={(e) => maj(l.cle, "vides", e.target.value)}
            />
            <Field
              label={t("gaz.reception.prix")}
              inputMode="numeric"
              value={l.prix}
              onChange={(e) => maj(l.cle, "prix", e.target.value)}
            />
          </fieldset>
        ))}
        <Field
          label={t("gaz.reception.piece")}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => {
            setPiece(e.target.files?.[0] ?? null);
            setEnregistree(false);
          }}
        />
        {piece === null && <p className="champ__aide">{t("gaz.reception.piece.obligatoire")}</p>}
        <Button type="submit" disabled={!valide}>
          {t("gaz.reception.enregistrer")}
        </Button>
        {enregistree && <p role="status">{t("gaz.reception.ok")}</p>}
      </form>

      <section className="carte">
        <h2>{t("gaz.reception.historique")}</h2>
        <Table
          caption={t("gaz.reception.historique")}
          colonnes={[
            t("gaz.reception.date"),
            t("gaz.reception.fournisseur"),
            t("gaz.pleines"),
            t("gaz.vides"),
            "",
          ]}
        >
          {enAttente.map((o) => (
            <tr key={o.id}>
              <td colSpan={4}>{o.label}</td>
              <td>
                <Chip tone="alerte">{t("sync.piece")}</Chip>
              </td>
            </tr>
          ))}
          {recues.map((r) => (
            <tr key={r.id}>
              <td>{jour.format(new Date(r.date))}</td>
              <td>{r.fournisseur}</td>
              <td>{r.pleines}</td>
              <td>{r.vides}</td>
              <td />
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
