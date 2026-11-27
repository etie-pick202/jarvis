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
  "sale.settle": ["pdg"],
  "sale.cancel": ["pdg", "gerant"],
  "stock.read": ["pdg", "gerant", "caissier"],
  "stock.write": ["pdg", "gerant"],
  "inventory.validate": ["pdg"],
  "cash.read": ["pdg", "gerant", "caissier"],
  "cash.write": ["pdg", "gerant", "caissier"],
  "cash.close": ["pdg", "gerant"],
  "cash.manage": ["pdg"],
  "audit.read": ["pdg", "gerant"],
  "report.read": ["pdg", "gerant"],
  "canal.read": ["pdg", "gerant", "caissier"],
  "canal.write": ["pdg", "gerant", "caissier"],
  "canal.cancel": ["pdg", "gerant"],
  "canal.manage": ["pdg", "gerant"],
  "money.read": ["pdg", "gerant"],
  "money.write": ["pdg", "gerant"],
  "money.manage": ["pdg"],
  "delivery.read": ["pdg", "gerant", "caissier"],
  "delivery.manage": ["pdg", "gerant"],
  "delivery.ceiling": ["pdg"],
  "order.read": ["pdg", "gerant", "caissier"],
  "order.manage": ["pdg", "gerant"],
  "delivery.drive": ["pdg", "gerant", "livreur"],
  "sync.replay": ["pdg", "gerant", "caissier"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
