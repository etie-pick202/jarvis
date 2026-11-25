import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { LogoCocosab } from "../visuels/LogoCocosab.js";
import { recuPdf } from "./pdf.js";
import { formatFcfa, type Paiement, type Panier, total } from "./regles.js";

export interface RecuVente {
  numero: string;
  date: Date;
  client: string;
  telephone?: string;
  panier: Panier;
  paiement: Paiement;
}

/** Nom d'en-tête : la raison sociale officielle reste à fixer (point ouvert du cahier des charges). */
const ENTETE = "COCOSAB";

export function lignesRecu(
  r: RecuVente,
  libelle: (cle: "paiement.especes" | "paiement.om" | "paiement.momo") => string,
): string[] {
  const { panier } = r;
  return [
    `${ENTETE} - Reçu ${r.numero}`,
    r.date.toLocaleString("fr-FR"),
    `Client : ${r.client}`,
    `${panier.article.nom} x ${panier.quantite}`,
    ...(panier.echange ? [`Échange : bouteille ${panier.echange} rapportée`] : []),
    `Réception : ${panier.reception === "livraison" ? "livraison" : "comptoir"}`,
    `Paiement : ${libelle(`paiement.${r.paiement}`)}`,
    `Total : ${formatFcfa(total(panier))}`,
  ];
}

export function Recu({ recu, onNouvelle }: { recu: RecuVente; onNouvelle: () => void }) {
  const { t } = useI18n();
  const lignes = lignesRecu(recu, t);
  const nom = `recu-${recu.numero}.pdf`;

  async function partagerPdf() {
    const fichier = new File([recuPdf(lignes) as BlobPart], nom, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: lignes[0] });
      return;
    }
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(fichier);
    lien.download = nom;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  const numero = recu.telephone?.replace(/\D/gu, "") ?? "";
  const whatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(lignes.join("\n"))}`;

  return (
    <section className="carte" aria-labelledby="titre-recu">
      <LogoCocosab />
      <h1 id="titre-recu">{t("vente.recu")}</h1>
      <p role="status">{t("vente.enregistree")}</p>
      <ul className="recu__lignes">
        {lignes.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="vente__actions">
        <Button variant="noir" onClick={() => void partagerPdf()}>
          {t("vente.pdf")}
        </Button>
        <a className="btn btn--contour" href={whatsapp} target="_blank" rel="noreferrer">
          {t("vente.whatsapp")}
        </a>
        <Button onClick={onNouvelle}>{t("vente.autre")}</Button>
      </div>
    </section>
  );
}
