import { sql } from "drizzle-orm";
import { createDb } from "./client.js";
import { hashPassword } from "./password.js";
import { REGISTERS } from "./registers.js";
import { cashRegisters, userRoles, users } from "./schema.js";

/**
 * Initialisation d'une base VIDE (production ou démonstration) : uniquement la structure obligatoire.
 * - les six caisses prévues par le cahier des charges ;
 * - un premier compte PDG, créé seulement si la base n'a encore aucun utilisateur.
 * Aucune marque, aucun format, aucun prix, aucun stock : le PDG saisit tout depuis l'application.
 */
export async function initialiser(
  databaseUrl: string,
  pdg: { username: string; displayName: string; password: string },
): Promise<{ pdgCree: boolean }> {
  if (pdg.password.length < 8) throw new Error("Le mot de passe du PDG doit faire au moins 8 caractères.");
  const { db, close } = createDb(databaseUrl);
  try {
    await db.insert(cashRegisters).values(REGISTERS).onConflictDoNothing();
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(users)) as [{ n: number }];
    if (n > 0) return { pdgCree: false };
    const [row] = await db
      .insert(users)
      .values({
        username: pdg.username,
        displayName: pdg.displayName,
        passwordHash: await hashPassword(pdg.password),
      })
      .returning({ id: users.id });
    if (!row) throw new Error("Création du compte PDG impossible.");
    await db.insert(userRoles).values({ userId: row.id, role: "pdg" });
    return { pdgCree: true };
  } finally {
    await close();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("initialiser.ts")) {
  const url = process.env.DATABASE_URL;
  const username = process.env.PDG_USERNAME;
  const password = process.env.PDG_PASSWORD;
  if (!url || !username || !password) {
    console.error("DATABASE_URL, PDG_USERNAME et PDG_PASSWORD sont obligatoires (PDG_NAME facultatif).");
    process.exit(1);
  }
  const { pdgCree } = await initialiser(url, {
    username,
    displayName: process.env.PDG_NAME ?? "PDG",
    password,
  });
  console.log(
    pdgCree
      ? "Base initialisée : six caisses et compte PDG."
      : "Base déjà initialisée : caisses vérifiées, aucun compte ajouté.",
  );
}
