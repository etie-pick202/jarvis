/**
 * Faux serveur en mémoire (données d'exemple fictives) qui répond avec les formes réelles de l'API /api/v1.
 * Sert aux tests et au développement sans backend ; activé par `VITE_API_MOCK=1`, absent de la production.
 */
import type { Role } from "@jarvis/shared";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const MARQUES = [
  { id: uuid(101), name: "OLA", packagingValue: 15900, full: 30, empty: 10 },
  { id: uuid(102), name: "TRADEX", packagingValue: 17500, full: 0, empty: 9 },
  { id: uuid(103), name: "BOCOM", packagingValue: 0, known: false, full: 18, empty: 4 },
  { id: uuid(104), name: "TOTAL", packagingValue: 17500, full: 28, empty: 6 },
  { id: uuid(105), name: "STARGAS", packagingValue: 20000, full: 22, empty: 4 },
];
const FORMAT = { id: uuid(201), label: "12,5 kg", weightGrams: 12500, priceCeiling: null, active: true };
const SEUIL_BAS = 10;

const ligneStock = (m: (typeof MARQUES)[number]) => ({
  brandId: m.id,
  brandName: m.name,
  formatId: FORMAT.id,
  formatLabel: FORMAT.label,
  full: m.full,
  empty: m.empty,
  total: m.full + m.empty,
  threshold: SEUIL_BAS,
  available: m.full > 0,
  low: m.full <= SEUIL_BAS,
});

const USERS: Record<string, { id: string; displayName: string; roles: Role[] }> = {
  pdg: { id: uuid(1), displayName: "Direction", roles: ["pdg"] },
  gerant: { id: uuid(2), displayName: "Gérant", roles: ["gerant", "livreur"] },
  caissier: { id: uuid(3), displayName: "Caissier", roles: ["caissier"] },
  livreur: { id: uuid(4), displayName: "Livreur", roles: ["livreur"] },
};

const REGISTRES = [
  { id: "sales_cash", label: "Ventes en espèces", active: true, balance: 215300, opening: 180000 },
  { id: "canal_om", label: "Canal+ Orange Money", active: true, balance: 96500, opening: 80000 },
  { id: "canal_cash", label: "Canal+ en espèces", active: true, balance: 42000, opening: 30000 },
  { id: "settlement_om_momo", label: "Règlement OM et MoMo", active: true, balance: 115712, opening: 100000 },
  { id: "transaction_om", label: "Transaction Orange Money", active: false, balance: 0, opening: 0 },
  { id: "transaction_momo", label: "Transaction MoMo", active: false, balance: 0, opening: 0 },
];

const CLIENTS = [
  { id: uuid(301), name: "Ndongo Berthe", phone: "237600000001" },
  { id: uuid(302), name: "Ndongo Jean", phone: null },
  { id: uuid(303), name: "Mbarga Alice", phone: null },
  { id: uuid(304), name: "Kamga Paul", phone: null },
  { id: uuid(305), name: "Fotso Marc", phone: null },
  { id: uuid(306), name: "Biyik Claire", phone: null },
];

const jour = "2026-11-24";
const ligneVente = (brand: string, returned: string | null, gap: number, pending = false) => ({
  kind: "gas",
  brandId: brand,
  formatId: FORMAT.id,
  articleId: null,
  quantity: 1,
  unitPrice: 6500,
  transportContribution: 300,
  deliveryFee: 0,
  returnedBrandId: returned,
  packagingGap: gap,
  packagingGapPending: pending,
  total: 6800,
});
const VENTES = [
  {
    id: uuid(401),
    number: "TK1993",
    customerName: "Fotso Marc",
    paymentMethod: "cash",
    total: 6800,
    lines: [ligneVente(uuid(105), uuid(104), -2500)],
    authorId: uuid(2),
    createdAt: `${jour}T09:12:00.000Z`,
    reversalOf: null,
  },
  {
    id: uuid(402),
    number: "TK1994",
    customerName: "Kamga Paul",
    paymentMethod: "cash",
    total: 6800,
    lines: [ligneVente(uuid(101), uuid(104), 1600)],
    authorId: uuid(2),
    createdAt: `${jour}T10:40:00.000Z`,
    reversalOf: null,
  },
  {
    id: uuid(403),
    number: "TK1995",
    customerName: "Biyik Claire",
    paymentMethod: "momo",
    total: 6800,
    lines: [ligneVente(uuid(101), uuid(103), 0, true)],
    authorId: uuid(2),
    createdAt: `${jour}T11:05:00.000Z`,
    reversalOf: null,
  },
];

const COMPTAGES = [
  {
    id: uuid(501),
    kind: "weekly",
    brandId: uuid(103),
    formatId: FORMAT.id,
    countedFull: 17,
    countedEmpty: 4,
    theoreticalFull: 18,
    theoreticalEmpty: 4,
    justification: "Une bouteille prêtée",
    createdAt: `${jour}T18:10:00.000Z`,
    validatedAt: null,
    status: "pending",
    authorName: "Gérant",
    validatedByName: null,
    rejectedByName: null,
    rejectedAt: null,
    rejectionReason: null,
  },
];

const PRIX_COURANT = {
  id: uuid(601),
  formatId: FORMAT.id,
  brandId: null,
  amount: 6500,
  transportContribution: 300,
  purchaseCost: 6170,
  changedBy: null,
  effectiveFrom: "2026-11-01T08:00:00.000Z",
};

const ARTICLES = [
  {
    id: uuid(701),
    name: "Détendeur",
    price: 4500,
    purchaseCost: 3000,
    trackStock: true,
    stockQty: 6,
    active: true,
  },
  {
    id: uuid(702),
    name: "Tuyau gaz 1,5 m",
    price: 2500,
    purchaseCost: 1500,
    trackStock: true,
    stockQty: 10,
    active: true,
  },
];

const FOURNISSEURS = [
  {
    id: uuid(801),
    name: "Dépôt Central",
    phone: "237600000010",
    active: true,
    brandIds: [uuid(101), uuid(104)],
  },
  {
    id: uuid(802),
    name: "Gaz du Mfoundi",
    phone: "237600000011",
    active: true,
    brandIds: [uuid(102), uuid(103), uuid(105)],
  },
];

const RECEPTIONS = [
  {
    id: uuid(901),
    supplierId: uuid(801),
    receivedAt: "2026-11-20T08:30:00.000Z",
    lines: [
      { brandId: uuid(101), formatId: FORMAT.id, fullReceived: 12, emptyReturned: 12, unitCost: 6170 },
      { brandId: uuid(104), formatId: FORMAT.id, fullReceived: 12, emptyReturned: 12, unitCost: 6170 },
    ],
  },
];

const AUDIT = [
  {
    id: uuid(1001),
    action: "sale.cancel",
    entity: "sale",
    entityId: uuid(401),
    actorId: uuid(2),
    actorName: "Gérant",
    details: { justification: "Erreur de moyen de paiement" },
    createdAt: `${jour}T11:25:00.000Z`,
  },
  {
    id: uuid(1002),
    action: "inventory.count",
    entity: "inventory",
    entityId: uuid(501),
    actorId: null,
    actorName: null,
    details: { ecart: -1 },
    createdAt: `${jour}T18:12:00.000Z`,
  },
];

const NOTIFICATIONS = [
  {
    id: uuid(1101),
    message: "Écart d'inventaire : BOCOM, une bouteille pleine en moins",
    createdAt: `${jour}T18:12:00.000Z`,
    readAt: null,
  },
];

const RAPPORT_CLIENTS = {
  day: jour,
  lines: [
    {
      saleNumber: "TK1991",
      at: `${jour}T08:52:00.000Z`,
      customerName: "Ndongo Berthe",
      item: "Gaz OLA 12,5 kg",
      quantity: 1,
      unitPrice: 6800,
      paymentMethod: "cash",
      total: 6800,
      margin: 630,
      marginPercent: 9.26,
    },
    {
      saleNumber: "TK1993",
      at: `${jour}T09:12:00.000Z`,
      customerName: "Fotso Marc",
      item: "Gaz STARGAS/TOTAL 12,5 kg",
      quantity: 1,
      unitPrice: 6800,
      paymentMethod: "cash",
      total: 6800,
      margin: -1870,
      marginPercent: -27.5,
    },
    {
      saleNumber: "TK1994",
      at: `${jour}T10:40:00.000Z`,
      customerName: "Kamga Paul",
      item: "Gaz TOTAL 12,5 kg",
      quantity: 1,
      unitPrice: 6800,
      paymentMethod: "orange_money",
      total: 6800,
      margin: 630,
      marginPercent: 9.26,
    },
  ],
  totals: { quantity: 3, total: 20400, margin: -610, marginPercent: -2.99 },
};

const RAPPORT_JOURNAL = {
  day: jour,
  entries: [
    {
      at: `${jour}T08:52:00.000Z`,
      registerId: "sales_cash",
      register: "Ventes en espèces",
      number: "RG0001",
      type: "REG",
      direction: "in",
      paymentMethod: "cash",
      customerName: "Ndongo Berthe",
      label: "Vente TK1991",
      amount: 6800,
      balanceAfter: 215300,
      operator: "Gérant",
    },
    {
      at: `${jour}T09:30:00.000Z`,
      registerId: "sales_cash",
      register: "Ventes en espèces",
      number: "MS0001",
      type: "MSC",
      direction: "out",
      paymentMethod: "cash",
      customerName: null,
      label: "Transport",
      amount: 5000,
      balanceAfter: 210300,
      operator: "Gérant",
    },
  ],
  total: 469512,
  inCash: 257300,
};

const RAPPORT_X = {
  day: jour,
  registers: [
    {
      registerId: "sales_cash",
      label: "Ventes en espèces",
      opening: 180000,
      movements: [
        {
          line: 1,
          at: `${jour}T08:52:00.000Z`,
          number: "RG0001",
          type: "REG",
          label: "Vente TK1991",
          amount: 6800,
        },
        {
          line: 2,
          at: `${jour}T09:30:00.000Z`,
          number: "MS0001",
          type: "MSC",
          label: "Transport",
          amount: -5000,
        },
      ],
      net: 1800,
      closing: 181800,
    },
  ],
  grandTotal: 181800,
};

const SEUIL_CLOTURE = 500;

/** Vue agrégée, calculée à partir des mêmes données que les autres routes. */
function tableauDeBord() {
  return {
    day: jour,
    sales: { count: 3, quantity: 3, total: 20400, margin: -610, marginPercent: -2.99 },
    registers: REGISTRES.map(({ id, label, active, opening, balance }) => ({
      id,
      label,
      active,
      opening,
      balance,
    })),
    stock: {
      full: MARQUES.reduce((n, m) => n + m.full, 0),
      empty: MARQUES.reduce((n, m) => n + m.empty, 0),
      alerts: MARQUES.filter((m) => m.full <= SEUIL_BAS).map(ligneStock),
    },
    unreadNotifications: 1,
  };
}

const FORMULES = [
  { id: uuid(1301), name: "Access", price: 5000, months: 1, commission: 0, active: true },
  { id: uuid(1302), name: "Évasion", price: 10500, months: 1, commission: 0, active: true },
  { id: uuid(1303), name: "Tout Canal+", price: 45000, months: 1, commission: 0, active: true },
];

/** Échéances relatives au jour fictif : dépassée, proche, lointaine, sans abonnement. */
const abonne = (n: number, name: string, formule: number, decodeur: string, jours: number | null) => ({
  id: uuid(1400 + n),
  name,
  phone: `23769000000${n}`,
  decoderNumber: decodeur,
  formulaId: FORMULES[formule]?.id ?? uuid(1301),
  formulaName: FORMULES[formule]?.name ?? "Access",
  formulaPrice: FORMULES[formule]?.price ?? 5000,
  expiresOn:
    jours === null
      ? null
      : new Date(Date.parse(`${jour}T00:00:00.000Z`) + jours * 86_400_000).toISOString().slice(0, 10),
  daysLeft: jours,
  active: true,
  createdAt: `${jour}T08:00:00.000Z`,
});

const ABONNES = [
  abonne(1, "Atangana Rose", 1, "DEC-0001", -2),
  abonne(2, "Essomba Jean", 0, "DEC-0002", 3),
  abonne(3, "Manga Sylvie", 2, "DEC-0003", 12),
  abonne(4, "Owona Marc", 0, "DEC-0004", null),
];

const vitrine = () => ({
  gas: MARQUES.map((m) => ({
    brandId: m.id,
    brandName: m.name,
    formatId: FORMAT.id,
    formatLabel: FORMAT.label,
    price: 6800,
    available: m.full > 0,
  })),
  articles: ARTICLES.map((a) => ({ id: a.id, name: a.name, price: a.price, available: true })),
  neighbourhoods: [
    { id: uuid(1701), name: "Quartier Essai Nord", feePerBottle: 400 },
    { id: uuid(1702), name: "Quartier Essai Sud", feePerBottle: 600 },
  ],
  shop: {
    openingHours: "Lundi au samedi, 7 h à 20 h",
    orderHours: "Commandes prises jusqu'à 18 h.",
    phone: "+237690000000",
    address: "Boutique d'exemple, Douala",
    minimumOrder: 2000,
    deliveryFeePerBottle: 400,
  },
});
/** Deux encaissements d'exemple pour la date demandée. */
const encaissementsCanal = (date: string) =>
  ABONNES.slice(1, 3).map((a, i) => ({
    id: uuid(1501 + i),
    subscriberId: a.id,
    subscriberName: a.name,
    decoderNumber: a.decoderNumber,
    formulaId: a.formulaId,
    formulaName: a.formulaName,
    months: 1,
    amount: a.formulaPrice,
    commission: 0,
    paymentMethod: i === 0 ? ("cash" as const) : ("orange_money" as const),
    registerId: i === 0 ? ("canal_cash" as const) : ("canal_om" as const),
    previousExpiry: null,
    newExpiry: date,
    authorId: uuid(1),
    authorName: "Gérant démo",
    createdAt: `${date}T0${9 - i}:15:00.000Z`,
    reversalOf: null,
    cancelled: false,
  }));

const FLOATS = [
  { operator: "orange_money" as const, active: true, float: 250000 },
  { operator: "momo" as const, active: false, float: 0 },
];

const operationsMoney = (date: string) => [
  {
    id: uuid(1601),
    operator: "orange_money" as const,
    kind: "deposit" as const,
    amount: 25000,
    commission: 0,
    phone: "237690000011",
    customerName: "Client Essai",
    reference: "OM-0001",
    authorId: uuid(1),
    authorName: "Gérant démo",
    createdAt: `${date}T08:30:00.000Z`,
    reversalOf: null,
    cancelled: false,
  },
];

/** Comptes d'exemple, d'après les utilisateurs du faux serveur. */
const comptes = () =>
  Object.entries(USERS).map(([username, u]) => ({
    id: u.id,
    username,
    displayName: u.displayName,
    roles: u.roles,
    active: true,
  }));

/** Rejoue la création ou la modification d'un compte. */
function ecrireCompte(route: string, init?: RequestInit): Response {
  const corps = JSON.parse(String(init?.body ?? "{}")) as { active?: boolean; roles?: Role[] };
  const id = route.split("/")[3];
  if (!id) return json({ ok: true }, 201);
  const c = comptes().find((x) => x.id === id);
  if (!c) return erreur(404, "not_found", "Compte introuvable");
  return json({ ...c, active: corps.active ?? c.active, roles: corps.roles ?? c.roles });
}

const CLE_FAUX = "jarvis.fake-user";

/** L'utilisateur « connecté » survit au rechargement, comme le ferait un jeton de session. */
export function setFakeUser(id: string | null, profilActif?: Role): void {
  if (id) localStorage.setItem(CLE_FAUX, profilActif ? `${id}:${profilActif}` : id);
  else localStorage.removeItem(CLE_FAUX);
}

function utilisateur() {
  const [id = "", actif] = (localStorage.getItem(CLE_FAUX) ?? "").split(":");
  const u = USERS[id];
  if (!u) return null;
  const activeRole = (actif as Role | undefined) ?? u.roles[0] ?? "gerant";
  return { id: u.id, username: id, displayName: u.displayName, roles: u.roles, activeRole };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const erreur = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

/** Répond comme le backend. `path` est relatif à /api/v1 (avec sa chaîne de requête). */
export async function fakeApi(path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(path, "http://fake");
  const route = url.pathname;
  const ecriture = Boolean(init?.method && init.method !== "GET");

  // Vitrine publique : aucune session requise.
  if (route === "/shop/catalogue") return json(vitrine());

  if (route === "/auth/login") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { username?: string; password?: string };
    if (!USERS[body.username ?? ""] || body.password !== "demo-jarvis") {
      return erreur(401, "unauthorized", "Identifiants invalides");
    }
    setFakeUser(body.username ?? null);
    return json({ token: `fake-${body.username}`, user: utilisateur() });
  }
  const moi = utilisateur();
  if (!moi) return erreur(401, "unauthorized", "Non connecté");
  // Panne provoquée pour les essais : « 500:/stock » fait échouer les lectures commençant par ce chemin.
  const [statut = "", chemin = ""] = (localStorage.getItem("jarvis.fake-panne") ?? "").split(":");
  if (!ecriture && chemin && route.startsWith(chemin)) {
    return erreur(Number(statut), `essai_${statut}`, "Panne provoquée");
  }

  if (route === "/auth/logout") {
    setFakeUser(null);
    return new Response(null, { status: 204 });
  }
  if (route === "/auth/me") return json(moi);
  if (route === "/auth/switch-role") {
    const { role } = JSON.parse(String(init?.body ?? "{}")) as { role: Role };
    if (!moi.roles.includes(role)) return erreur(403, "forbidden", "Profil non attribué");
    setFakeUser(moi.username, role);
    return json(utilisateur());
  }
  if (route === "/sync/replay") {
    const { operations } = JSON.parse(String(init?.body ?? "{}")) as { operations: { clientOpId: string }[] };
    return json({
      results: operations.map((o) => ({ clientOpId: o.clientOpId, status: "applied", applied: true })),
    });
  }
  if (route === "/receipts" && ecriture)
    return json({ id: uuid(1201), contentType: "application/pdf", size: 1 }, 201);
  if (ecriture && route.startsWith("/auth/users")) return ecrireCompte(route, init);
  if (ecriture) return json({ ok: true }, 201);

  switch (route) {
    case "/catalogue/brands":
      return json(
        MARQUES.map(({ id, name, packagingValue, known }) => ({
          id,
          name,
          packagingValue,
          packagingValueKnown: known ?? true,
          active: true,
        })),
      );
    case "/catalogue/formats":
      return json([FORMAT]);
    case `/catalogue/prices/${FORMAT.id}/current`:
      return json(PRIX_COURANT);
    case "/catalogue/articles":
      return json(ARTICLES);
    case "/stock":
      return json(MARQUES.map(ligneStock));
    case "/stock/alerts":
      return json(MARQUES.filter((m) => m.full <= SEUIL_BAS).map(ligneStock));
    case "/customers": {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return json(
        q
          ? CLIENTS.filter((c) =>
              c.name
                .toLowerCase()
                .split(" ")
                .some((mot) => mot.startsWith(q)),
            )
          : [],
      );
    }
    case "/sales":
      return json(
        url.searchParams.get("type") === "exchange"
          ? VENTES.filter((v) => v.lines.some((l) => l.returnedBrandId && l.returnedBrandId !== l.brandId))
          : VENTES,
      );
    case "/canal/formulas":
      return json(FORMULES);
    case "/canal/payments":
      return json(encaissementsCanal(url.searchParams.get("date") ?? jour));
    case "/money/float":
      return json(FLOATS);
    case "/money/commissions":
      return json({ orange_money: { deposit: 100, withdrawal: 150 }, momo: { deposit: 0, withdrawal: 0 } });
    case "/money/operations":
      return json(operationsMoney(url.searchParams.get("date") ?? jour));
    case "/canal/subscribers":
      return json(ABONNES);
    case "/canal/due": {
      const jours = Number(url.searchParams.get("within") ?? 7);
      return json(ABONNES.filter((a) => a.active && a.daysLeft !== null && a.daysLeft <= jours));
    }
    case "/auth/users":
      return json(comptes());
    case "/stock/thresholds":
      return json({ default: SEUIL_BAS, overrides: [] });
    case "/cash/closure-threshold":
      return json({ threshold: SEUIL_CLOTURE });
    case "/reports/dashboard":
      return json(tableauDeBord());
    case "/suppliers":
      return json(FOURNISSEURS);
    case "/receptions":
      return json(RECEPTIONS);
    case "/inventory":
      return json(COMPTAGES);
    case "/cash/registers":
      return json(REGISTRES);
    case "/control/audit":
      return json(AUDIT);
    case "/control/notifications":
      return json(NOTIFICATIONS);
    case "/reports/customers":
      return json(RAPPORT_CLIENTS);
    case "/reports/cash-journal":
      return json(RAPPORT_JOURNAL);
    case "/reports/x":
      return json(RAPPORT_X);
    case "/reports/gas-situation":
      return json({
        rows: MARQUES.map((m) => ({ brand: m.name, full: m.full, empty: m.empty, total: m.full + m.empty })),
        totals: { full: 98, empty: 33, total: 131 },
      });
    default:
      if (route.startsWith("/reports/export/")) {
        return new Response("﻿N° vente;Total\r\nTK1991;6800", {
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        });
      }
      return erreur(404, "not_found", "Route inconnue");
  }
}

export function installFakeApi(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const interne = url.startsWith("/api/v1/")
      ? url.slice("/api/v1".length)
      : url === "/health"
        ? "/health"
        : null;
    if (interne === null) return real(input, init);
    // Comme un vrai réseau : sans connexion, l'appel échoue.
    if (!navigator.onLine) return Promise.reject(new TypeError("hors ligne"));
    return interne === "/health" ? Promise.resolve(json({ status: "ok" })) : fakeApi(interne, init);
  };
}
