import { useMemo } from "react";
import { api, type Caisse } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { Operation } from "../offline/db.js";
import { useOutbox } from "../offline/useConnection.js";

const VIDE: Caisse[] = [];

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
    if (op.path === "/cash/expenses" && typeof b.amount === "number") ajouter(b.registerId, -b.amount);
    if (op.path === "/cash/transfers" && typeof b.amount === "number") {
      ajouter(b.fromRegisterId, -b.amount);
      ajouter(b.toRegisterId, b.amount);
    }
  }
  return deltas;
}

/**
 * Caisses avec leur solde théorique : valeur du serveur plus les mouvements encore en attente d'envoi.
 * Le solde n'est jamais saisi à la main ; à la reconnexion le serveur recalcule et fait foi.
 */
export function useCaisses() {
  const lecture = useCached("caisses", api.caisses, VIDE);
  const { data } = lecture;
  const ops = useOutbox();
  const caisses = useMemo(() => {
    const deltas = deltasEnAttente(ops);
    return data.map((c) => ({ ...c, solde: c.solde + (deltas[c.id] ?? 0) }));
  }, [data, ops]);
  return { caisses, actives: caisses.filter((c) => c.actif), lecture };
}

export const totalSoldes = (caisses: readonly Caisse[]) => caisses.reduce((n, c) => n + c.solde, 0);
export const totalEspeces = (caisses: readonly Caisse[]) =>
  caisses.filter((c) => c.especes).reduce((n, c) => n + c.solde, 0);
