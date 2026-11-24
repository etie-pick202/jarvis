import pg from "pg";

/**
 * Crée une base vierge dédiée (tests d'intégration) à côté de celle de `adminUrl` et renvoie son adresse.
 * Chaque paquet utilise sa propre base : turbo lance leurs tests en parallèle.
 */
export async function createFreshDatabase(adminUrl: string, name: string): Promise<string> {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Nom de base invalide");
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
