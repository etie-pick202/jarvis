import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import { asc, ilike, or } from "drizzle-orm";

const { customers } = schema;

/** Clé de recherche : minuscules, sans accents, espaces simples. « Aïssatou  Diop » → « aissatou diop ». */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Trouve le client par son nom ou le crée (code client dérivé du nom, comme dans Sage). */
export async function findOrCreateCustomer(tx: Database, name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const searchKey = normalizeName(trimmed);
  await tx.insert(customers).values({ name: trimmed, searchKey }).onConflictDoNothing();
  const found = await tx.query.customers.findFirst({ where: (c, { eq }) => eq(c.searchKey, searchKey) });
  if (!found) throw new Error("Client introuvable après création");
  return found;
}

/** Recherche dès les premières lettres : début du nom ou début d'un des mots (prénom, nom). */
export async function searchCustomers(db: Database, query: string, limit = 10) {
  const key = escapeLike(normalizeName(query));
  if (!key) return [];
  return db
    .select()
    .from(customers)
    .where(or(ilike(customers.searchKey, `${key}%`), ilike(customers.searchKey, `% ${key}%`)))
    .orderBy(asc(customers.searchKey))
    .limit(limit);
}
