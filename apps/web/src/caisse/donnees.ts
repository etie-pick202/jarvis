import { useMemo } from "react";
import { api, type Caisse, type Caisses } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { Operation } from "../offline/db.js";
import { useOutbox } from "../offline/useConnection.js";

const VIDE: Caisses = { caisses: [], seuilJustification: 0 };

/** Montants en FCFA : des entiers, jamais de décimales. */
export function lireMontant(saisie: string): number | null {
  return /^\d+$/u.test(saisie.trim()) && Number(saisie) > 0 ? Number(saisie) : null;
}

/** Effet sur les soldes des dépenses et transferts encore en attente d'envoi. */
export function deltasEnAttente(ops: readonly Operation[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  const ajouter = (id: unknown, n: number) => {
    if (typeof id === "string") deltas[id] = (deltas[id] ?? 0) + n;
  };
  for (const op of ops) {
    if (op.status !== "pending") continue;
    const b = op.body as Record<string, unknown>;
    if (op.path === "/caisses/depenses" && typeof b.montant === "number") ajouter(b.caisseId, -b.montant);
    if (op.path === "/caisses/transferts" && typeof b.montant === "number") {
      ajouter(b.de, -b.montant);
      ajouter(b.vers, b.montant);
    }
  }
  return deltas;
}

/**
 * Caisses avec leur solde théorique : valeur du serveur plus les mouvements encore en attente d'envoi.
 * Le solde n'est jamais saisi à la main ; à la reconnexion le serveur recalcule et fait foi.
 */
export function useCaisses() {
  const { data, pret } = useCached("caisses", api.caisses, VIDE);
  const ops = useOutbox();
  const caisses = useMemo(() => {
    const deltas = deltasEnAttente(ops);
    return data.caisses.map((c) => ({ ...c, solde: c.solde + (deltas[c.id] ?? 0) }));
  }, [data.caisses, ops]);
  return {
    caisses,
    seuilJustification: data.seuilJustification,
    actives: caisses.filter((c) => c.actif),
    pret,
  };
}

export const totalSoldes = (caisses: readonly Caisse[]) => caisses.reduce((n, c) => n + c.solde, 0);
export const totalEspeces = (caisses: readonly Caisse[]) =>
  caisses.filter((c) => c.especes).reduce((n, c) => n + c.solde, 0);
