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

/** Compte tel que le PDG le gère : jamais de mot de passe en lecture. */
export const userAccount = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  roles: z.array(role),
  active: z.boolean(),
});
export type UserAccount = z.infer<typeof userAccount>;
export const userAccounts = z.array(userAccount);

export const updateUserInput = z
  .object({
    active: z.boolean().optional(),
    roles: roles.optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((u) => Object.values(u).some((v) => v !== undefined), { message: "Au moins un champ à modifier" });
export type UpdateUserInput = z.infer<typeof updateUserInput>;
