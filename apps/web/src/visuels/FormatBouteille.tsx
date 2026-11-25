/** « 12,5 kg » donne 12,5 ; sans nombre lisible, le format courant (12,5 kg). */
export function poidsDuFormat(libelle: string): number {
  const n = Number.parseFloat(libelle.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 12.5;
}

/**
 * Silhouette de bouteille dont la taille suit le format (6, 12,5 ou 35 kg) : repère visuel rapide
 * dans le stock, la vente et les échanges. Le libellé du format reste écrit à côté.
 */
export function FormatBouteille({ libelle }: { libelle: string }) {
  const poids = poidsDuFormat(libelle);
  const hauteur = Math.round(16 + Math.min(poids, 35) * 0.5);
  const largeur = Math.round(hauteur * 0.62);
  return (
    <span className="format-bouteille">
      <svg
        width={largeur}
        height={hauteur}
        viewBox="0 0 20 32"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M8 2h4v3l3 3v20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8l3-3z"
          fill="currentColor"
          fillOpacity=".12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M5 14h10M5 22h10" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      {libelle}
    </span>
  );
}
