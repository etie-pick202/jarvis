import type { Role } from "@jarvis/shared";

/**
 * Matrice des droits (cahier des charges, « Profils utilisateurs et droits »).
 * Vérifiée côté serveur sur chaque route, selon le profil ACTIF de la session.
 * Les droits du caissier sont des valeurs par défaut, réglables par le PDG plus tard.
 */
export const PERMISSIONS = {
  "user.manage": ["pdg"],
  "catalog.gas.read": ["pdg", "gerant", "caissier"],
  "catalog.gas.write": ["pdg"],
  "catalog.article.write": ["pdg", "gerant"],
  "sale.create": ["pdg", "gerant", "caissier"],
  "sale.read": ["pdg", "gerant", "caissier"],
  "sale.cancel": ["pdg", "gerant"],
  "stock.read": ["pdg", "gerant", "caissier"],
  "stock.write": ["pdg", "gerant"],
  "inventory.validate": ["pdg"],
  "cash.read": ["pdg", "gerant", "caissier"],
  "cash.write": ["pdg", "gerant", "caissier"],
  "cash.close": ["pdg", "gerant"],
  "audit.read": ["pdg", "gerant"],
  "report.read": ["pdg", "gerant"],
  "sync.replay": ["pdg", "gerant", "caissier"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
