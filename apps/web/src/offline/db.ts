import Dexie, { type EntityTable } from "dexie";

export type OperationStatus = "pending" | "conflict" | "rejected";

/** Une écriture en attente d'envoi. Jamais supprimée en silence : seul un envoi réussi ou un choix explicite l'efface. */
export interface Operation {
  id: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  /** Clé stable : la rejouer côté API ne produit qu'un seul effet. */
  idempotencyKey: string;
  label: string;
  createdAt: number;
  status: OperationStatus;
  attempts: number;
  /** Réponse du serveur en cas de conflit de stock ou de refus. */
  detail?: string;
}

export class JarvisDB extends Dexie {
  outbox!: EntityTable<Operation, "id">;

  constructor(name = "jarvis") {
    super(name);
    this.version(1).stores({ outbox: "id, status, createdAt" });
  }
}

export const db = new JarvisDB();
