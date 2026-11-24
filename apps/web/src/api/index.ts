import { request } from "./client.js";
import {
  type Badges,
  type Health,
  type Livraison,
  type LoginInput,
  parseBadges,
  parseHealth,
  parseLivraisons,
  parseSession,
  type Session,
} from "./contracts.js";

export * from "./client.js";
export * from "./contracts.js";

export const api = {
  health: (signal?: AbortSignal): Promise<Health> => request("/health", { signal, parse: parseHealth }),
  login: (input: LoginInput, idempotencyKey: string): Promise<Session> =>
    request("/auth/login", { method: "POST", body: input, idempotencyKey, parse: parseSession }),
  me: (signal?: AbortSignal): Promise<Session> => request("/auth/me", { signal, parse: parseSession }),
  logout: (idempotencyKey: string): Promise<null> =>
    request("/auth/logout", { method: "POST", idempotencyKey, parse: () => null }),
  badges: (signal?: AbortSignal): Promise<Badges> => request("/badges", { signal, parse: parseBadges }),
  livraisons: (signal?: AbortSignal): Promise<Livraison[]> =>
    request("/livraisons/jour", { signal, parse: parseLivraisons }),
};
