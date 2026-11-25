const HORLOGE = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2";
const EQUIPE =
  "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M17 14a5 5 0 0 1 4 6";
const ECHANGE = "M4 8h14l-3-3M20 16H6l3 3";
const PORTEFEUILLE = "M3 6h18v14H3zM3 10h18M16.5 14.5h.01";
const BOUTEILLE = "M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3zM7 12h10";
const CLOCHE = "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4";
const PIECE =
  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10c0-1.5 1.5-2 3-2s3 .5 3 2-1.5 2-3 2-3 .5-3 2 1.5 2 3 2 3-.5 3-2";
const LIVRE = "M5 4h14v16H5zM9 8h6M9 12h6M9 16h4";

/** Une icône de trait par rubrique (clé `volet.rubrique`), 24 × 24, décorative : le nom est écrit à côté. */
const TRACES: Record<string, string> = {
  "pilot.tableau": "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  "pilot.alertes": CLOCHE,
  "pilot.validations": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6",
  "pilot.audit": LIVRE,
  "vente.nouvelle": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8",
  "vente.commandes": "M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0",
  "vente.historique": HORLOGE,
  "vente.clients": EQUIPE,
  "gaz.stock": BOUTEILLE,
  "gaz.echanges": ECHANGE,
  "gaz.receptions": "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19h.01M17 19h.01",
  "gaz.fournisseurs": "M4 20V8l8-4 8 4v12zM9 20v-6h6v6",
  "gaz.inventaire": "M8 4h8v3H8zM6 6h12v15H6zM9 12l2 2 4-4",
  "market.articles": "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  "market.stock": "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  "market.mouvements": "M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4",
  "caisse.soldes": PORTEFEUILLE,
  "caisse.depenses": "M7 17L17 7M9 7h8v8",
  "caisse.transferts": ECHANGE,
  "caisse.cloture": "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  "canal.abonnes": EQUIPE,
  "canal.echeances": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  "canal.encaissements": PIECE,
  "canal.rappels": "M4 5h16v11H9l-5 4z",
  "money.operations": ECHANGE,
  "money.float": PORTEFEUILLE,
  "money.commissions": "M6 18L18 6M8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  "livre.file": "M4 6h16M4 12h16M4 18h10",
  "livre.tournee":
    "M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 17h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6",
  "livre.quartiers": "M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  "livre.historique": HORLOGE,
  "rapport.clients": EQUIPE,
  "rapport.journal": LIVRE,
  "rapport.x": "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  "rapport.gaz": BOUTEILLE,
  "rapport.exports": "M12 4v11M7 11l5 5 5-5M5 20h14",
  "config.marques": "M3 12V4h8l10 10-8 8zM7 8h.01",
  "config.prix": PIECE,
  "config.utilisateurs": EQUIPE,
  "config.caisses": PORTEFEUILLE,
  "config.notifications": CLOCHE,
  "config.langue": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
};

export const rubriquesAvecIcone = Object.keys(TRACES);

export function IconeRubrique({ volet, rubrique }: { volet: string; rubrique: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRACES[`${volet}.${rubrique}`] ?? "M12 12h.01"} />
    </svg>
  );
}
