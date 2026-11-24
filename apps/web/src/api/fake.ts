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

const CATALOGUE = [
  {
    id: "ola",
    nom: "Gaz 12,5 kg OLA",
    genre: "gaz",
    marque: "OLA",
    prix: 6800,
    stock: 12,
    valeurEmballage: 15900,
  },
  {
    id: "tradex",
    nom: "Gaz 12,5 kg TRADEX",
    genre: "gaz",
    marque: "TRADEX",
    prix: 6800,
    stock: 0,
    valeurEmballage: 17500,
  },
  { id: "bocom", nom: "Gaz 12,5 kg BOCOM", genre: "gaz", marque: "BOCOM", prix: 6800, stock: 5 },
  {
    id: "total",
    nom: "Gaz 12,5 kg TOTAL",
    genre: "gaz",
    marque: "TOTAL",
    prix: 6800,
    stock: 8,
    valeurEmballage: 17500,
  },
  {
    id: "stargas",
    nom: "Gaz 12,5 kg STARGAS",
    genre: "gaz",
    marque: "STARGAS",
    prix: 6800,
    stock: 3,
    valeurEmballage: 20000,
  },
  { id: "detendeur", nom: "Détendeur", genre: "autre", prix: 4500, stock: 6 },
  { id: "tuyau", nom: "Tuyau gaz 1,5 m", genre: "autre", prix: 2500, stock: 10 },
];

const CLIENTS = [
  { id: "c1", nom: "Ndongo Berthe", telephone: "237600000001" },
  { id: "c2", nom: "Ndongo Jean" },
  { id: "c3", nom: "Mbarga Alice" },
  { id: "c4", nom: "Kamga Paul" },
  { id: "c5", nom: "Fotso Marc" },
  { id: "c6", nom: "Biyik Claire" },
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
  if (path === "/catalogue") return json(CATALOGUE);
  if (path === "/clients") return json(CLIENTS);
  if (path === "/badges") return json(BADGES);
  if (path === "/livraisons/jour") return json(LIVRAISONS);
  return json({ erreur: "introuvable" }, 404);
}

export function installFakeApi(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api/")) return real(input, init);
    // Comme un vrai réseau : sans connexion, l'appel échoue.
    return navigator.onLine ? fakeApi(url.slice(4), init) : Promise.reject(new TypeError("hors ligne"));
  };
}
