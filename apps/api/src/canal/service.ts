import { schema } from "@jarvis/db";
import type {
  CanalSubscriber,
  CreateCanalFormulaInput,
  CreateCanalSubscriberInput,
  UpdateCanalFormulaInput,
  UpdateCanalSubscriberInput,
} from "@jarvis/shared";
import { and, asc, eq, ilike, isNotNull, lte, or, type SQL } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { businessDate } from "../cash/rules.js";
import { normalizeName } from "../customers/service.js";
import { guardUnique, requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { addDays, daysBetween } from "./rules.js";

const { canalFormulas, canalSubscribers } = schema;

const DUPLICATE_FORMULA = "Cette formule existe déjà";
const DUPLICATE_DECODER = "Ce numéro de décodeur est déjà enregistré";

// ---------- Formules ----------
export const listFormulas = (deps: Deps) =>
  deps.db.select().from(canalFormulas).orderBy(asc(canalFormulas.price), asc(canalFormulas.name));

export async function createFormula(deps: Deps, actorId: string, input: CreateCanalFormulaInput) {
  const row = await guardUnique(
    async () => requireRow(await deps.db.insert(canalFormulas).values(input).returning()),
    DUPLICATE_FORMULA,
  );
  await recordAudit(deps.db, {
    action: "canal.formula.create",
    entity: "canal_formula",
    entityId: row.id,
    actorId,
    details: input,
  });
  return row;
}

export async function updateFormula(
  deps: Deps,
  actorId: string,
  formulaId: string,
  input: UpdateCanalFormulaInput,
) {
  const row = await guardUnique(
    async () =>
      requireRow(
        await deps.db.update(canalFormulas).set(input).where(eq(canalFormulas.id, formulaId)).returning(),
        "Formule introuvable",
      ),
    DUPLICATE_FORMULA,
  );
  await recordAudit(deps.db, {
    action: "canal.formula.update",
    entity: "canal_formula",
    entityId: row.id,
    actorId,
    details: input,
  });
  return row;
}

// ---------- Abonnés ----------
async function requireActiveFormula(deps: Deps, formulaId: string) {
  const [formula] = await deps.db.select().from(canalFormulas).where(eq(canalFormulas.id, formulaId));
  if (!formula?.active) throw new AppError(422, "invalid_request", "Formule inconnue ou désactivée");
}

async function selectSubscribers(deps: Deps, where?: SQL): Promise<CanalSubscriber[]> {
  const today = businessDate(deps.now());
  const rows = await deps.db
    .select({ subscriber: canalSubscribers, formula: canalFormulas })
    .from(canalSubscribers)
    .innerJoin(canalFormulas, eq(canalFormulas.id, canalSubscribers.formulaId))
    .where(where)
    .orderBy(asc(canalSubscribers.expiresOn), asc(canalSubscribers.searchKey));
  return rows.map(({ subscriber: s, formula }) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    decoderNumber: s.decoderNumber,
    formulaId: s.formulaId,
    formulaName: formula.name,
    formulaPrice: formula.price,
    expiresOn: s.expiresOn,
    daysLeft: s.expiresOn ? daysBetween(today, s.expiresOn) : null,
    active: s.active,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function getSubscriber(deps: Deps, subscriberId: string): Promise<CanalSubscriber> {
  return requireRow(
    await selectSubscribers(deps, eq(canalSubscribers.id, subscriberId)),
    "Abonné introuvable",
  );
}

/** Recherche par début de nom ou de mot, numéro de décodeur ou de téléphone ; sans critère : tous les abonnés. */
export function searchSubscribers(deps: Deps, query: string) {
  const text = query.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
  if (!text) return selectSubscribers(deps);
  const key = normalizeName(text);
  return selectSubscribers(
    deps,
    or(
      ilike(canalSubscribers.searchKey, `${key}%`),
      ilike(canalSubscribers.searchKey, `% ${key}%`),
      ilike(canalSubscribers.decoderNumber, `${text}%`),
      ilike(canalSubscribers.phone, `%${text}%`),
    ),
  );
}

/** Échéances à relancer : abonnés actifs dont l'échéance est dépassée ou tombe dans les `within` jours. */
export function dueSubscribers(deps: Deps, within: number) {
  const limit = addDays(businessDate(deps.now()), within);
  return selectSubscribers(
    deps,
    and(
      eq(canalSubscribers.active, true),
      isNotNull(canalSubscribers.expiresOn),
      lte(canalSubscribers.expiresOn, limit),
    ),
  );
}

export async function createSubscriber(deps: Deps, actorId: string, input: CreateCanalSubscriberInput) {
  await requireActiveFormula(deps, input.formulaId);
  const row = await guardUnique(
    async () =>
      requireRow(
        await deps.db
          .insert(canalSubscribers)
          .values({ ...input, searchKey: normalizeName(input.name), createdAt: deps.now() })
          .returning(),
      ),
    DUPLICATE_DECODER,
  );
  await recordAudit(deps.db, {
    action: "canal.subscriber.create",
    entity: "canal_subscriber",
    entityId: row.id,
    actorId,
    details: input,
  });
  return getSubscriber(deps, row.id);
}

export async function updateSubscriber(
  deps: Deps,
  actorId: string,
  subscriberId: string,
  input: UpdateCanalSubscriberInput,
) {
  if (input.formulaId) await requireActiveFormula(deps, input.formulaId);
  await guardUnique(
    async () =>
      requireRow(
        await deps.db
          .update(canalSubscribers)
          .set({ ...input, ...(input.name ? { searchKey: normalizeName(input.name) } : {}) })
          .where(eq(canalSubscribers.id, subscriberId))
          .returning(),
        "Abonné introuvable",
      ),
    DUPLICATE_DECODER,
  );
  await recordAudit(deps.db, {
    action: "canal.subscriber.update",
    entity: "canal_subscriber",
    entityId: subscriberId,
    actorId,
    details: input,
  });
  return getSubscriber(deps, subscriberId);
}
