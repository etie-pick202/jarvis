import { hashPassword, schema } from "@jarvis/db";
import { type Role, role as roleSchema, type UpdateUserInput, type UserAccount } from "@jarvis/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";

const { users, userRoles, sessions } = schema;

async function accounts(deps: Deps, userIds?: string[]): Promise<UserAccount[]> {
  const rows = await deps.db
    .select()
    .from(users)
    .where(userIds ? inArray(users.id, userIds) : undefined)
    .orderBy(asc(users.username));
  const roles = await deps.db.select().from(userRoles);
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    roles: roles.filter((r) => r.userId === u.id).map((r) => roleSchema.parse(r.role)),
    active: u.active,
  }));
}

export const listUsers = (deps: Deps) => accounts(deps);

/**
 * Activation, profils et mot de passe d'un compte, par le PDG. Tout changement ferme les sessions du compte. Le PDG
 * ne peut ni se désactiver ni se retirer son propre profil : il resterait toujours un administrateur.
 */
export async function updateUser(
  deps: Deps,
  actorId: string,
  userId: string,
  input: UpdateUserInput,
): Promise<UserAccount> {
  requireRow(await deps.db.select().from(users).where(eq(users.id, userId)), "Compte introuvable");
  const roles: Role[] | undefined = input.roles ? [...new Set(input.roles)] : undefined;
  if (userId === actorId && (input.active === false || (roles && !roles.includes("pdg")))) {
    throw new AppError(409, "conflict", "Vous ne pouvez pas désactiver ou rétrograder votre propre compte");
  }
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  await deps.db.transaction(async (tx) => {
    const changes = {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    };
    if (Object.keys(changes).length > 0) await tx.update(users).set(changes).where(eq(users.id, userId));
    if (roles) {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      await tx.insert(userRoles).values(roles.map((role) => ({ userId, role })));
    }
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await recordAudit(tx, {
      action: "user.update",
      entity: "user",
      entityId: userId,
      actorId,
      // Le mot de passe n'est jamais écrit dans le journal.
      details: { active: input.active, roles, passwordChanged: Boolean(input.password) },
    });
  });
  const [account] = await accounts(deps, [userId]);
  return requireRow(account ? [account] : [], "Compte introuvable");
}
