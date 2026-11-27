export type Format = "csv" | "xlsx" | "pdf";

/** Période la plus longue exportable en une fois (règle du serveur). */
export const JOURS_MAX = 92;

export function erreurPeriode(du: string, au: string) {
  if (!du || !au || du > au) return "exports.ordre" as const;
  const jours = Math.round((Date.parse(au) - Date.parse(du)) / 86_400_000) + 1;
  return jours > JOURS_MAX ? ("exports.trop.long" as const) : null;
}

/** Les tableaux couvrent la période ; les PDF et la situation du stock portent sur un jour (la fin de période). */
const chemin =
  (nom: "sales" | "cash" | "stock", periode: boolean) => (format: Format, du: string, au: string) => {
    if (format === "pdf") return `/documents/reports/${nom}.pdf?date=${au}`;
    return `/reports/export/${nom}.${format}${periode ? `?from=${du}&to=${au}` : ""}`;
  };

const TOUS: readonly Format[] = ["xlsx", "csv", "pdf"];

export const FICHIERS = [
  { nom: "ventes", libelle: "rub.rapport.clients", formats: TOUS, chemin: chemin("sales", true) },
  { nom: "caisse", libelle: "rub.rapport.journal", formats: TOUS, chemin: chemin("cash", true) },
  { nom: "stock-gaz", libelle: "rub.rapport.gaz", formats: TOUS, chemin: chemin("stock", false) },
  {
    nom: "x-de-caisse",
    libelle: "rub.rapport.x",
    formats: ["pdf"] as readonly Format[],
    chemin: (_f: Format, _du: string, au: string) => `/documents/reports/x.pdf?date=${au}`,
  },
  {
    nom: "sage",
    libelle: "exports.sage",
    formats: ["csv"] as readonly Format[],
    chemin: (_f: Format, du: string, au: string) => `/reports/export/sage.csv?from=${du}&to=${au}`,
  },
] as const;
