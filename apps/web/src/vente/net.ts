import type { Sale } from "@jarvis/shared";

export { jourActivite } from "../canal/regles.js";

type Ligne = Pick<Sale, "id" | "total" | "reversalOf">;

/** Une vente s'annule une fois ; une écriture d'annulation ne s'annule pas. */
export function annulables(ventes: readonly Ligne[]): Set<string> {
  const inversees = new Set(ventes.map((v) => v.reversalOf));
  return new Set(ventes.filter((v) => v.reversalOf === null && !inversees.has(v.id)).map((v) => v.id));
}

/** Total net : les ventes annulées et leurs annulations se neutralisent. */
export function totalVendu(ventes: readonly Ligne[]): number {
  const valides = annulables(ventes);
  return ventes.reduce((n, v) => n + (valides.has(v.id) ? v.total : 0), 0);
}
