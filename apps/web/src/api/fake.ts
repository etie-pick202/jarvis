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
    stock: 30,
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
  { id: "bocom", nom: "Gaz 12,5 kg BOCOM", genre: "gaz", marque: "BOCOM", prix: 6800, stock: 18 },
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

const GAZ_STOCK = [
  { marque: "OLA", pleines: 30, vides: 10, seuil: 10 },
  { marque: "TRADEX", pleines: 0, vides: 9, seuil: 10 },
  { marque: "BOCOM", pleines: 18, vides: 4, seuil: 10 },
  { marque: "TOTAL", pleines: 28, vides: 6, seuil: 10 },
  { marque: "STARGAS", pleines: 22, vides: 4, seuil: 10 },
];

const ECHANGES = [
  {
    id: "e1",
    date: "2026-11-24T09:12:00Z",
    client: "Fotso Marc",
    remise: "STARGAS",
    rapportee: "TOTAL",
    ecart: -2500,
  },
  {
    id: "e2",
    date: "2026-11-24T10:40:00Z",
    client: "Kamga Paul",
    remise: "OLA",
    rapportee: "TOTAL",
    ecart: 1600,
  },
];

const FOURNISSEURS = [
  { id: "f1", nom: "Dépôt Central", telephone: "237600000010", marques: ["OLA", "TOTAL"] },
  { id: "f2", nom: "Gaz du Mfoundi", telephone: "237600000011", marques: ["TRADEX", "BOCOM", "STARGAS"] },
];

const RECEPTIONS = [
  { id: "r1", date: "2026-11-20T08:30:00Z", fournisseur: "Dépôt Central", pleines: 24, vides: 24 },
  { id: "r2", date: "2026-11-12T14:05:00Z", fournisseur: "Gaz du Mfoundi", pleines: 18, vides: 16 },
];

const CAISSES = {
  seuilJustification: 500,
  caisses: [
    { id: "ventes", nom: "Ventes en espèces", solde: 215300, fond: 180000, actif: true, especes: true },
    { id: "canal-om", nom: "Canal+ Orange Money", solde: 96500, fond: 80000, actif: true, especes: false },
    { id: "canal-esp", nom: "Canal+ en espèces", solde: 42000, fond: 30000, actif: true, especes: true },
    {
      id: "reglement",
      nom: "Règlement OM et MoMo",
      solde: 115712,
      fond: 100000,
      actif: true,
      especes: false,
    },
    { id: "trans-om", nom: "Transaction Orange Money", solde: 0, fond: 0, actif: false, especes: false },
    { id: "trans-momo", nom: "Transaction MoMo", solde: 0, fond: 0, actif: false, especes: false },
  ],
};

const TABLEAU = { caJour: 108800, nbVentes: 16, livraisonsEnCours: 2, echeances: 4 };

const ALERTES = [
  { id: "a1", texte: "Gaz TRADEX en rupture : vente bloquée", niveau: "danger" },
  { id: "a2", texte: "4 échéances Canal+ cette semaine", niveau: "alerte" },
  { id: "a3", texte: "Écart de clôture hier : Canal+ en espèces, -1 000 FCFA (justifié)", niveau: "alerte" },
];

const VALIDATIONS = [
  {
    id: "v1",
    genre: "inventaire",
    resume: "Inventaire hebdomadaire : BOCOM pleines -1",
    auteur: "Gérant",
    date: "2026-11-23T18:10:00Z",
  },
  {
    id: "v2",
    genre: "annulation",
    resume: "Vente 1991 annulée : erreur de moyen de paiement",
    auteur: "Gérant",
    date: "2026-11-24T11:25:00Z",
  },
];

const AUDIT = [
  {
    id: "l1",
    date: "2026-11-24T11:25:00Z",
    auteur: "Gérant",
    action: "Annulation de vente",
    detail: "Vente 1991, erreur de moyen de paiement",
  },
  {
    id: "l2",
    date: "2026-11-23T18:12:00Z",
    auteur: "Gérant",
    action: "Écart d'inventaire",
    detail: "BOCOM pleines -1",
  },
  {
    id: "l3",
    date: "2026-11-20T09:00:00Z",
    auteur: "Direction",
    action: "Changement de prix",
    detail: "Recharge 12,5 kg : transport 300 FCFA",
  },
];

const RAPPORTS = {
  clients: {
    colonnes: ["Heure", "Client", "Article", "Qté", "Prix unitaire", "Paiement", "Total", "Marge", "Marge %"],
    lignes: [
      ["08:52", "Ndongo Berthe", "Gaz OLA 12,5 kg", 1, 6800, "Espèces", 6800, 730, "10,74"],
      [
        "09:12",
        "Fotso Marc",
        "Gaz STARGAS 12,5 kg (échange TOTAL)",
        1,
        6800,
        "Espèces",
        6800,
        -1770,
        "-26,03",
      ],
      ["10:40", "Kamga Paul", "Gaz TOTAL 12,5 kg", 1, 6800, "Espèces", 6800, 730, "10,74"],
    ],
    pied: ["Total", "", "", 3, "", "", 20400, -310, ""],
  },
  journal: {
    colonnes: [
      "Date",
      "Caisse",
      "N° pièce",
      "Sens",
      "Mode",
      "Client",
      "Libellé",
      "Montant",
      "Solde après",
      "Opérateur",
    ],
    lignes: [
      [
        "2026-11-24 08:52",
        "Ventes en espèces",
        "RGTVT2449",
        "Entrée",
        "Espèces",
        "Ndongo Berthe",
        "Vente gaz OLA",
        6800,
        215300,
        "Gérant",
      ],
      [
        "2026-11-24 09:30",
        "Ventes en espèces",
        "SORT0112",
        "Sortie",
        "Espèces",
        "Client comptoir",
        "Transport",
        5000,
        210300,
        "Gérant",
      ],
    ],
  },
  x: {
    colonnes: ["Caisse", "Type", "N° pièce", "Libellé", "Montant"],
    lignes: [
      ["Ventes en espèces", "FDC", "FDC0001", "Fond de caisse", 180000],
      ["Ventes en espèces", "REG", "RGTVT2449", "Règlement vente 1993", 6800],
      ["Ventes en espèces", "MSC", "SORT0112", "Sortie de caisse : transport", -5000],
    ],
    pied: ["Total général", "", "", "", 181800],
  },
};

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
  if (init?.method && init.method !== "GET") return json({ ok: true }, 201);
  if (path === "/catalogue") return json(CATALOGUE);
  if (path === "/pilotage/tableau") return json(TABLEAU);
  if (path === "/pilotage/alertes") return json(ALERTES);
  if (path === "/pilotage/validations") return json(VALIDATIONS);
  if (path === "/pilotage/audit") return json(AUDIT);
  if (path.startsWith("/rapports/")) {
    const rapport = (RAPPORTS as Record<string, unknown>)[path.slice(10)];
    return rapport ? json(rapport) : json({ erreur: "introuvable" }, 404);
  }
  if (path === "/caisses") return json(CAISSES);
  if (path === "/gaz/receptions") return json(RECEPTIONS);
  if (path === "/gaz/stock") return json(GAZ_STOCK);
  if (path === "/gaz/echanges") return json(ECHANGES);
  if (path === "/fournisseurs") return json(FOURNISSEURS);
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
