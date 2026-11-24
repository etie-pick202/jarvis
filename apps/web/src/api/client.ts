/** Couche unique d'accès à l'API : aucun écran n'appelle `fetch` directement. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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

export async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const method = options.method ?? "GET";
  if (method !== "GET" && !options.idempotencyKey) {
    throw new Error("Une écriture exige une clé d'idempotence (Idempotency-Key).");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: "same-origin",
  });
  if (!response.ok) throw new ApiError(response.status, `${method} ${path} : ${response.status}`);
  return options.parse(response.status === 204 ? null : await response.json());
}
