import { z } from "zod";

/** Profils internes. Un utilisateur peut en cumuler plusieurs ; le client n'a pas de compte. */
export const role = z.enum(["pdg", "gerant", "livreur", "caissier"]);
export type Role = z.infer<typeof role>;

export const roles = z.array(role).min(1);

export const loginInput = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof loginInput>;

export const sessionUser = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  roles,
  /** Profil actuellement actif (bascule de profil sans reconnexion). */
  activeRole: role,
});
export type SessionUser = z.infer<typeof sessionUser>;

export function hasAnyRole(userRoles: readonly Role[], allowed: readonly Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}
