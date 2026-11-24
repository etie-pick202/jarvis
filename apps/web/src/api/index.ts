import { request } from "./client.js";
import {
  type Article,
  type Badges,
  type Client,
  type Echange,
  type Fournisseur,
  type GazStock,
  type Health,
  type Livraison,
  type LoginInput,
  parseBadges,
  parseCatalogue,
  parseClients,
  parseEchanges,
  parseFournisseurs,
  parseGazStock,
  parseHealth,
  parseLivraisons,
  parseReceptions,
  parseSession,
  type ReceptionResume,
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
  catalogue: (signal?: AbortSignal): Promise<Article[]> =>
    request("/catalogue", { signal, parse: parseCatalogue }),
  clients: (signal?: AbortSignal): Promise<Client[]> => request("/clients", { signal, parse: parseClients }),
  gazStock: (signal?: AbortSignal): Promise<GazStock[]> =>
    request("/gaz/stock", { signal, parse: parseGazStock }),
  echanges: (signal?: AbortSignal): Promise<Echange[]> =>
    request("/gaz/echanges", { signal, parse: parseEchanges }),
  receptions: (signal?: AbortSignal): Promise<ReceptionResume[]> =>
    request("/gaz/receptions", { signal, parse: parseReceptions }),
  fournisseurs: (signal?: AbortSignal): Promise<Fournisseur[]> =>
    request("/fournisseurs", { signal, parse: parseFournisseurs }),
  livraisons: (signal?: AbortSignal): Promise<Livraison[]> =>
    request("/livraisons/jour", { signal, parse: parseLivraisons }),
};
