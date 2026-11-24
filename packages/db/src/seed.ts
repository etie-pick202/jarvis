import { createDb } from "./client.js";
import { hashPassword } from "./password.js";
import { brands, cashRegisters, formats, gasPrices, userRoles, users } from "./schema.js";

/**
 * Données de départ FICTIVES, pour le développement et les tests uniquement.
 * Aucune donnée réelle COCOSAB. Mot de passe des comptes d'essai : variable SEED_PASSWORD (obligatoire).
 */
export const REGISTERS = [
  { id: "sales_cash", label: "Ventes en espèces", active: true },
  { id: "canal_om", label: "Canal+ OM", active: true },
  { id: "canal_cash", label: "Canal+ espèces", active: true },
  { id: "settlement_om_momo", label: "Règlement OM et MoMo", active: true },
  { id: "transaction_om", label: "Transaction OM", active: false },
  { id: "transaction_momo", label: "Transaction MoMo", active: false },
];

export async function seed(databaseUrl: string, password: string) {
  const { db, close } = createDb(databaseUrl);
  try {
    await db.insert(cashRegisters).values(REGISTERS).onConflictDoNothing();
    const hash = await hashPassword(password);
    const accounts = [
      { username: "pdg.essai", displayName: "PDG (essai)", roles: ["pdg"] },
      { username: "gerant.essai", displayName: "Gérant (essai)", roles: ["gerant", "livreur"] },
      { username: "caissier.essai", displayName: "Caissier (essai)", roles: ["caissier"] },
    ];
    for (const a of accounts) {
      const [row] = await db
        .insert(users)
        .values({ username: a.username, displayName: a.displayName, passwordHash: hash })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (row) await db.insert(userRoles).values(a.roles.map((role) => ({ userId: row.id, role })));
    }
    const brandRows = await db
      .insert(brands)
      .values([
        { name: "Alpha Gaz (fictif)", packagingValue: 20000 },
        { name: "Boreal Gaz (fictif)", packagingValue: 17500 },
        { name: "Cobalt Gaz (fictif)", packagingValue: 15900 },
      ])
      .onConflictDoNothing()
      .returning({ id: brands.id });
    const [format] = await db
      .insert(formats)
      .values({ label: "12,5 kg (fictif)", weightGrams: 12500 })
      .onConflictDoNothing()
      .returning({ id: formats.id });
    if (format && brandRows.length > 0) {
      await db.insert(gasPrices).values({
        formatId: format.id,
        brandId: null,
        amount: 6500,
        transportContribution: 300,
        purchaseCost: 6070,
      });
    }
  } finally {
    await close();
  }
}

if (
  import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}` ||
  process.argv[1]?.endsWith("seed.ts")
) {
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_PASSWORD;
  if (!url || !password) {
    console.error("DATABASE_URL et SEED_PASSWORD sont obligatoires.");
    process.exit(1);
  }
  await seed(url, password);
  console.log("Données d'essai fictives insérées.");
}
