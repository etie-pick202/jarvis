/** Couche unique d'accès à l'API : aucun écran n'appelle `fetch` directement. */
import { IDEMPOTENCY_HEADER } from "@jarvis/shared";

export const API_BASE = "/api/v1";
const CLE_JETON = "jarvis.token";

export const lireJeton = (): string | null => localStorage.getItem(CLE_JETON);
export const garderJeton = (jeton: string): void => localStorage.setItem(CLE_JETON, jeton);
export const oublierJeton = (): void => localStorage.removeItem(CLE_JETON);

/** Erreur de l'API : `{ error: { code, message } }` côté serveur. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "unknown",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Obligatoire pour toute écriture : la même clé rejouée ne produit qu'un seul effet. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Valide et type la réponse ; lève une erreur si le contrat n'est pas respecté. */
  parse: (data: unknown) => T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** En-têtes communs : jeton de session (Bearer) et clé d'idempotence. */
export function enTetes(extra: Record<string, string> = {}, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", ...extra };
  const jeton = lireJeton();
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  return headers;
}

export async function erreurDe(response: Response, repere: string): Promise<ApiError> {
  const corps: unknown = await response.json().catch(() => null);
  const e = typeof corps === "object" && corps !== null ? (corps as { error?: unknown }).error : null;
  if (typeof e === "object" && e !== null) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    return new ApiError(response.status, String(message ?? repere), String(code ?? "unknown"));
  }
  return new ApiError(response.status, `${repere} : ${response.status}`);
}

export async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const method = options.method ?? "GET";
  if (method !== "GET" && !options.idempotencyKey) {
    throw new Error("Une écriture exige une clé d'idempotence (Idempotency-Key).");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: enTetes(
      options.body !== undefined ? { "Content-Type": "application/json" } : {},
      options.idempotencyKey,
    ),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.ok) throw await erreurDe(response, `${method} ${path}`);
  return options.parse(response.status === 204 ? null : await response.json());
}
