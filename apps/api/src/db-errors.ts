import { AppError } from "./http.js";

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Une contrainte d'unicité violée devient un conflit lisible. */
export async function guardUnique<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, "conflict", message);
    throw err;
  }
}

/** Première ligne d'un résultat, sinon 404. */
export function requireRow<T>(rows: T[], message = "Introuvable"): T {
  const row = rows[0];
  if (!row) throw new AppError(404, "not_found", message);
  return row;
}
