/**
 * Faux serveur en mémoire (données d'exemple fictives) pour travailler sans API.
 * Activé seulement par `VITE_API_MOCK=1` ; absent du bundle de production.
 */
import type { Badges, Livraison, Session } from "./contracts.js";

const USERS: Record<string, Session> = {
  pdg: { userId: "u1", nom: "Direction", profils: ["pdg"] },
  gerant: { userId: "u2", nom: "Gérant", profils: ["gerant", "livreur"] },
  caissier: { userId: "u3", nom: "Caissier", profils: ["caissier"] },
  livreur: { userId: "u4", nom: "Livreur", profils: ["livreur"] },
};

const BADGES: Badges = { commandes: 3, stockBas: 2, echeances: 4, validations: 1 };

const LIVRAISONS: Livraison[] = [
  {
    id: "CMD-0142",
    client: "Mme Ndongo",
    quartier: "Bastos",
    article: "Gaz 12,5 kg OLA",
    montant: 7200,
    etat: "a_livrer",
  },
  {
    id: "CMD-0143",
    client: "Mme Mbarga",
    quartier: "Melen",
    article: "Gaz 12,5 kg TOTAL",
    montant: 7200,
    etat: "a_livrer",
  },
];

const CLE_FAUX = "jarvis.fake-user";

/** L'utilisateur « connecté » survit au rechargement, comme le ferait un cookie de session. */
export function setFakeUser(id: string | null): void {
  if (id) localStorage.setItem(CLE_FAUX, id);
  else localStorage.removeItem(CLE_FAUX);
}

function currentUser(): Session | null {
  return USERS[localStorage.getItem(CLE_FAUX) ?? ""] ?? null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function fakeApi(path: string, init?: RequestInit): Promise<Response> {
  if (path === "/health") return json({ status: "ok" });
  if (path === "/auth/login") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { identifiant?: string; motDePasse?: string };
    const user = USERS[body.identifiant ?? ""];
    if (!user || body.motDePasse !== "demo") return json({ erreur: "identifiants" }, 401);
    setFakeUser(body.identifiant ?? null);
    return json(user);
  }
  if (path === "/auth/logout") {
    setFakeUser(null);
    return new Response(null, { status: 204 });
  }
  const current = currentUser();
  if (!current) return json({ erreur: "non connecté" }, 401);
  if (path === "/auth/me") return json(current);
  if (path === "/ventes" && init?.method === "POST") return json({ ok: true }, 201);
  if (path === "/badges") return json(BADGES);
  if (path === "/livraisons/jour") return json(LIVRAISONS);
  return json({ erreur: "introuvable" }, 404);
}

export function installFakeApi(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith("/api/") ? fakeApi(url.slice(4), init) : real(input, init);
  };
}
