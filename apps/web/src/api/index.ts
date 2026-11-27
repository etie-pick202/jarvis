import * as contrat from "@jarvis/shared";
import { z } from "zod";
import type { Profil } from "../nav/volets.js";
import { API_BASE, ApiError, enTetes, erreurDe, newIdempotencyKey, request } from "./client.js";
import type {
  Alerte,
  Article,
  Badges,
  Caisse,
  Client,
  Echange,
  Fournisseur,
  GazStock,
  LigneAudit,
  Livraison,
  LoginInput,
  Rapport,
  ReceptionResume,
  Session,
  Tableau,
  Validation,
} from "./contracts.js";

export * from "./client.js";
export * from "./contracts.js";

/** Valide une réponse avec son schéma ; un contrat non respecté lève une erreur claire. */
const lire =
  <S extends z.ZodType>(schema: S) =>
  (data: unknown): z.infer<S> =>
    schema.parse(data);

export const toSession = (u: contrat.SessionUser): Session => ({
  userId: u.id,
  nom: u.displayName,
  profils: u.roles,
  profilActif: u.activeRole,
});

/** Valeur affichée pour un article que le serveur ne suit pas en stock. */
export const STOCK_ILLIMITE = 9999;

const CAISSES_ESPECES: readonly string[] = ["sales_cash", "canal_cash"];

export const MODES_PAIEMENT = { especes: "cash", om: "orange_money", momo: "momo" } as const satisfies Record<
  string,
  contrat.PaymentMethod
>;

const PAIEMENT_LIBELLE: Record<string, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  momo: "MoMo",
};

const LISTES = {
  marques: z.array(contrat.brand),
  formats: z.array(contrat.format),
  articles: z.array(contrat.article),
  ventes: z.array(contrat.sale),
};

const get = <S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal) =>
  request(path, { signal, parse: lire(schema) });

async function marquesParId(signal?: AbortSignal): Promise<Map<string, string>> {
  const brands = await get("/catalogue/brands", LISTES.marques, signal);
  return new Map(brands.map((b) => [b.id, b.name]));
}

/** Lecture réservée à certains profils : un refus (403) ou une route absente (404) donne une liste vide. */
const sansDroit = async <T>(p: Promise<T>, defaut: T): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return defaut;
    throw e;
  }
};

const signe = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const heure = (iso: string) => iso.slice(11, 16);

export const api = {
  health: async (signal?: AbortSignal): Promise<void> => {
    const r = await fetch("/health", { signal });
    if (!r.ok) throw new ApiError(r.status, "Serveur indisponible");
  },

  login: async (input: LoginInput, idempotencyKey: string): Promise<{ token: string; session: Session }> => {
    const r = await request("/auth/login", {
      method: "POST",
      body: { username: input.identifiant, password: input.motDePasse },
      idempotencyKey,
      parse: lire(contrat.loginResult),
    });
    return { token: r.token, session: toSession(r.user) };
  },
  me: async (signal?: AbortSignal): Promise<Session> =>
    toSession(await get("/auth/me", contrat.sessionUser, signal)),
  logout: (idempotencyKey: string): Promise<null> =>
    request("/auth/logout", { method: "POST", idempotencyKey, parse: () => null }),
  switchRole: async (role: Profil, idempotencyKey: string): Promise<Session> =>
    toSession(
      await request("/auth/switch-role", {
        method: "POST",
        body: { role },
        idempotencyKey,
        parse: lire(contrat.sessionUser),
      }),
    ),

  /** Catalogue vendable : gaz (marque × format avec son prix en vigueur) et articles libres. */
  catalogue: async (signal?: AbortSignal): Promise<Article[]> => {
    const [brands, formats, articles, stock] = await Promise.all([
      get("/catalogue/brands", LISTES.marques, signal),
      get("/catalogue/formats", LISTES.formats, signal),
      get("/catalogue/articles", LISTES.articles, signal),
      get("/stock", contrat.stockRows, signal),
    ]);
    const combinaisons = brands
      .filter((b) => b.active)
      .flatMap((b) => formats.filter((f) => f.active).map((f) => ({ b, f })));
    const gaz = (
      await Promise.all(
        combinaisons.map(async ({ b, f }): Promise<Article[]> => {
          // Prix en vigueur (exception de marque comprise) ; 404 = le PDG n'a pas encore saisi de prix.
          const prix = await sansDroit<contrat.GasPrice | null>(
            get(`/catalogue/prices/${f.id}/current?brandId=${b.id}`, contrat.gasPrice, signal),
            null,
          );
          if (!prix) return [];
          return [
            {
              id: `${b.id}:${f.id}`,
              nom: `Gaz ${f.label} ${b.name}`,
              genre: "gaz",
              marque: b.name,
              formatLibelle: f.label,
              prix: prix.amount + prix.transportContribution,
              stock: stock.find((s) => s.brandId === b.id && s.formatId === f.id)?.full ?? 0,
              // Valeur non relevée : l'écart d'un échange ne se calcule pas, il sera régularisé par le PDG.
              valeurEmballage: b.packagingValueKnown === false ? undefined : b.packagingValue,
              brandId: b.id,
              formatId: f.id,
            },
          ];
        }),
      )
    ).flat();
    const libres = articles
      .filter((a) => a.active)
      .map(
        (a): Article => ({
          id: a.id,
          nom: a.name,
          genre: "autre",
          prix: a.price,
          stock: a.trackStock ? a.stockQty : STOCK_ILLIMITE,
          articleId: a.id,
        }),
      );
    return [...gaz, ...libres];
  },

  /** Vitrine publique (sans compte) : produits, disponibilité, quartiers livrés et coordonnées. */
  vitrine: (signal?: AbortSignal): Promise<contrat.PublicCatalogue> =>
    get("/shop/catalogue", contrat.publicCatalogue, signal),

  /** Commande sans compte : `ref` la rend rejouable sans doublon. */
  commander: (body: contrat.CreateOrderInput, ref: string): Promise<contrat.PlacedOrder> =>
    request("/shop/orders", { method: "POST", body, idempotencyKey: ref, parse: lire(contrat.placedOrder) }),
  suivreCommande: (jeton: string, signal?: AbortSignal): Promise<contrat.TrackedOrder> =>
    get(`/shop/orders/${encodeURIComponent(jeton)}`, contrat.trackedOrder, signal),
  referencePaiement: (jeton: string, paymentReference: string): Promise<contrat.TrackedOrder> =>
    request(`/shop/orders/${encodeURIComponent(jeton)}/payment-reference`, {
      method: "PUT",
      body: { paymentReference },
      idempotencyKey: newIdempotencyKey(),
      parse: lire(contrat.trackedOrder),
    }),

  /** Recherche de client dès les premières lettres (le serveur normalise accents et casse). */
  clients: async (q: string, signal?: AbortSignal): Promise<Client[]> =>
    (await get(`/customers?q=${encodeURIComponent(q)}`, contrat.customerRows, signal)).map((c) => ({
      id: c.id,
      nom: c.name,
      telephone: c.phone ?? undefined,
    })),

  gazStock: async (signal?: AbortSignal): Promise<GazStock[]> =>
    (await get("/stock", contrat.stockRows, signal)).map((s) => ({
      marque: s.brandName,
      brandId: s.brandId,
      formatId: s.formatId,
      formatLabel: s.formatLabel,
      pleines: s.full,
      vides: s.empty,
      seuil: s.threshold,
    })),

  /** Dernières ventes avec échange entre marques ; l'écart est vide tant qu'il reste à régulariser. */
  echanges: async (signal?: AbortSignal): Promise<Echange[]> => {
    const [ventes, noms] = await Promise.all([
      get("/sales?type=exchange", LISTES.ventes, signal),
      marquesParId(signal),
    ]);
    return ventes.flatMap((v) =>
      v.lines
        .filter((l) => l.kind === "gas" && l.returnedBrandId && l.returnedBrandId !== l.brandId)
        .map((l, i) => ({
          id: `${v.id}:${i}`,
          date: v.createdAt,
          client: v.customerName,
          remise: noms.get(l.brandId ?? "") ?? "?",
          rapportee: noms.get(l.returnedBrandId ?? "") ?? "?",
          ecart: l.packagingGapPending ? null : l.packagingGap,
        })),
    );
  },

  marques: async (signal?: AbortSignal): Promise<{ id: string; nom: string }[]> =>
    (await get("/catalogue/brands", LISTES.marques, signal))
      .filter((b) => b.active)
      .map((b) => ({ id: b.id, nom: b.name })),

  formats: async (signal?: AbortSignal): Promise<{ id: string; libelle: string }[]> =>
    (await get("/catalogue/formats", LISTES.formats, signal))
      .filter((f) => f.active)
      .map((f) => ({ id: f.id, libelle: f.label })),

  fournisseurs: async (signal?: AbortSignal): Promise<Fournisseur[]> => {
    const [lignes, noms] = await Promise.all([
      get("/suppliers", contrat.supplierRows, signal),
      marquesParId(signal),
    ]);
    return lignes
      .filter((s) => s.active)
      .map((s) => ({
        id: s.id,
        nom: s.name,
        telephone: s.phone ?? "",
        brandIds: s.brandIds,
        marques: s.brandIds.map((id) => noms.get(id) ?? "?"),
      }));
  },

  receptions: async (signal?: AbortSignal): Promise<ReceptionResume[]> => {
    const [lignes, fournisseurs] = await Promise.all([
      get("/receptions", contrat.receptionRows, signal),
      get("/suppliers", contrat.supplierRows, signal),
    ]);
    return lignes.map((r) => ({
      id: r.id,
      date: r.receivedAt,
      fournisseur: fournisseurs.find((s) => s.id === r.supplierId)?.name ?? "?",
      pleines: r.lines.reduce((n, l) => n + l.fullReceived, 0),
      vides: r.lines.reduce((n, l) => n + l.emptyReturned, 0),
    }));
  },

  caisses: async (signal?: AbortSignal): Promise<Caisse[]> =>
    (await get("/cash/registers", contrat.registerRows, signal)).map((r) => ({
      id: r.id,
      nom: r.label,
      solde: r.balance,
      fond: r.opening,
      actif: r.active,
      especes: CAISSES_ESPECES.includes(r.id),
    })),

  seuilCloture: async (signal?: AbortSignal): Promise<number> =>
    (await get("/cash/closure-threshold", contrat.closureThresholdResult, signal)).threshold,

  /** Vue agrégée du PDG pour le jour d'activité. */
  tableau: async (signal?: AbortSignal): Promise<Tableau> => {
    const d = await get("/reports/dashboard", contrat.dashboard, signal);
    const somme = (l: typeof d.registers) => l.reduce((n, r) => n + r.balance, 0);
    return {
      caJour: d.sales.total,
      nbVentes: d.sales.count,
      marge: d.sales.margin,
      margePct: d.sales.marginPercent,
      totalCaisses: somme(d.registers),
      especes: somme(d.registers.filter((r) => CAISSES_ESPECES.includes(r.id))),
      pleines: d.stock.full,
      vides: d.stock.empty,
      alertesStock: d.stock.alerts.length,
      notifications: d.unreadNotifications,
      echeancesCanal: d.canalDue,
    };
  },

  alertes: async (signal?: AbortSignal): Promise<Alerte[]> => {
    const [bas, notes] = await Promise.all([
      sansDroit(get("/stock/alerts", contrat.stockRows, signal), []),
      sansDroit(get("/control/notifications?unread=1", contrat.notificationRows, signal), []),
    ]);
    return [
      ...bas.map(
        (s): Alerte => ({
          id: `stock:${s.brandId}:${s.formatId}`,
          texte: s.available
            ? `Gaz ${s.formatLabel} ${s.brandName} : stock bas (${s.full} pleines)`
            : `Gaz ${s.formatLabel} ${s.brandName} en rupture : vente bloquée`,
          niveau: s.available ? "alerte" : "danger",
        }),
      ),
      ...notes.map((n): Alerte => ({ id: n.id, texte: n.message, niveau: "alerte" })),
    ];
  },

  /** Validations en attente : les comptages d'inventaire que le PDG doit valider. */
  validations: async (signal?: AbortSignal): Promise<Validation[]> => {
    const [lignes, noms, formats] = await Promise.all([
      get("/inventory?pending=1", contrat.countRows, signal),
      marquesParId(signal),
      get("/catalogue/formats", LISTES.formats, signal),
    ]);
    return lignes.map((c) => {
      const format = formats.find((f) => f.id === c.formatId)?.label ?? "";
      const genre = c.kind === "weekly" ? "Inventaire hebdomadaire" : "Confirmation du soir";
      return {
        id: c.id,
        genre: "inventaire",
        resume: `${genre} : ${noms.get(c.brandId) ?? "?"} ${format}, écart pleines ${signe(c.countedFull - c.theoreticalFull)}, vides ${signe(c.countedEmpty - c.theoreticalEmpty)}`,
        auteur: c.authorName,
        date: c.createdAt,
      };
    });
  },

  audit: async (signal?: AbortSignal): Promise<LigneAudit[]> =>
    (await get("/control/audit", contrat.auditRows, signal)).map((a) => ({
      id: a.id,
      date: a.createdAt,
      auteur: a.actorName ?? "",
      action: a.action,
      detail: [a.entity, ...Object.entries(a.details ?? {}).map(([k, v]) => `${k} : ${String(v)}`)].join(
        " · ",
      ),
    })),

  badges: async (signal?: AbortSignal): Promise<Badges> => {
    const [bas, attente, echeances] = await Promise.all([
      sansDroit(get("/stock/alerts", contrat.stockRows, signal), []),
      sansDroit(get("/inventory?pending=1", contrat.countRows, signal), []),
      sansDroit(get("/canal/due?within=7", contrat.canalSubscribers, signal), []),
    ]);
    return { commandes: 0, stockBas: bas.length, echeances: echeances.length, validations: attente.length };
  },

  /** Canal+ : formules, abonnés (liste complète, filtrée sur l'appareil) et échéances proches. */
  formulesCanal: (signal?: AbortSignal): Promise<contrat.CanalFormula[]> =>
    get("/canal/formulas", contrat.canalFormulas, signal),
  abonnesCanal: (signal?: AbortSignal): Promise<contrat.CanalSubscriber[]> =>
    get("/canal/subscribers", contrat.canalSubscribers, signal),
  encaissementsCanal: (jour: string, signal?: AbortSignal): Promise<contrat.CanalPayment[]> =>
    get(`/canal/payments?date=${jour}`, contrat.canalPayments, signal),
  relancesCanal: (
    jours: number,
    langue: "fr" | "en",
    signal?: AbortSignal,
  ): Promise<contrat.CanalReminder[]> =>
    get(`/canal/reminders?within=${jours}&lang=${langue}`, contrat.canalReminders, signal),
  /** Articles hors gaz, actifs ou non. */
  articlesLibres: (signal?: AbortSignal) => get("/catalogue/articles", LISTES.articles, signal),
  /** Orange Money et MoMo : float par opérateur, commissions et opérations du jour. */
  floats: (signal?: AbortSignal): Promise<contrat.FloatState[]> =>
    get("/money/float", contrat.floatStates, signal),
  commissions: (signal?: AbortSignal): Promise<contrat.CommissionSettings> =>
    get("/money/commissions", contrat.commissionSettings, signal),
  operationsMoney: (jour: string, signal?: AbortSignal): Promise<contrat.MoneyOperation[]> =>
    get(`/money/operations?date=${jour}`, contrat.moneyOperations, signal),
  echeancesCanal: (jours: number, signal?: AbortSignal): Promise<contrat.CanalSubscriber[]> =>
    get(`/canal/due?within=${jours}`, contrat.canalSubscribers, signal),

  /** Livraisons du jour : le module de livraison n'a pas encore de contrat côté serveur (lot 3). */
  livraisons: async (): Promise<Livraison[]> => [],

  rapport: async (id: "clients" | "journal" | "x", signal?: AbortSignal): Promise<Rapport> => {
    if (id === "clients")
      return rapportClients(await get("/reports/customers", contrat.customerStats, signal));
    if (id === "journal")
      return rapportJournal(await get("/reports/cash-journal", contrat.cashJournal, signal));
    return rapportX(await get("/reports/x", contrat.xReport, signal));
  },

  situationGaz: async (signal?: AbortSignal): Promise<Rapport> => {
    const s = await get("/reports/gas-situation", contrat.gasSituation, signal);
    return {
      colonnes: ["Marque", "Pleines", "Vides", "Total"],
      lignes: s.rows.map((r) => [r.brand, r.full, r.empty, r.total]),
      pied: ["Total général", s.totals.full, s.totals.empty, s.totals.total],
    };
  },

  /** Export CSV produit par le serveur (s'ouvre dans Excel). */
  exportCsv: async (nom: "sales" | "cash" | "stock"): Promise<Blob> => {
    const r = await fetch(`${API_BASE}/reports/export/${nom}.csv`, { headers: enTetes() });
    if (!r.ok) throw await erreurDe(r, `export ${nom}`);
    return r.blob();
  },
};

// toLocaleString utilise des espaces insécables fines (U+202F, U+00A0) : on les remplace pour l'affichage et les exports.
const ESPACES = new RegExp(`[${String.fromCharCode(0x202f)}${String.fromCharCode(0xa0)}]`, "gu");
export const nombreFr = (n: number) => n.toLocaleString("fr-FR").replace(ESPACES, " ");
const pourcent = (v: number | null) => (v === null ? "" : nombreFr(v));

export function rapportClients(s: z.infer<typeof contrat.customerStats>): Rapport {
  return {
    colonnes: [
      "Heure",
      "N° vente",
      "Client",
      "Article",
      "Qté",
      "Prix unitaire",
      "Paiement",
      "Total",
      "Marge",
      "Marge %",
    ],
    lignes: s.lines.map((l) => [
      heure(l.at),
      l.saleNumber,
      l.customerName,
      l.item,
      l.quantity,
      l.unitPrice,
      PAIEMENT_LIBELLE[l.paymentMethod] ?? l.paymentMethod,
      l.total,
      l.margin,
      pourcent(l.marginPercent),
    ]),
    pied: [
      "Total",
      "",
      "",
      "",
      s.totals.quantity,
      "",
      "",
      s.totals.total,
      s.totals.margin,
      pourcent(s.totals.marginPercent),
    ],
  };
}

export function rapportJournal(j: z.infer<typeof contrat.cashJournal>): Rapport {
  return {
    colonnes: [
      "Heure",
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
    lignes: j.entries.map((e) => [
      heure(e.at),
      e.register,
      e.number,
      e.direction === "in" ? "Entrée" : "Sortie",
      PAIEMENT_LIBELLE[e.paymentMethod] ?? e.paymentMethod,
      e.customerName ?? "",
      e.label,
      e.amount,
      e.balanceAfter,
      e.operator,
    ]),
    pied: ["Total des caisses", "", "", "", "", "", "", "", j.total, `dont ${nombreFr(j.inCash)} en espèces`],
  };
}

export function rapportX(x: z.infer<typeof contrat.xReport>): Rapport {
  return {
    colonnes: ["Caisse", "Type", "N° pièce", "Libellé", "Montant"],
    lignes: x.registers.flatMap((r) => [
      [r.label, "FDC", "", "Fond de caisse", r.opening],
      ...r.movements.map((m) => [r.label, m.type, m.number, m.label, m.amount]),
    ]),
    pied: ["Total général", "", "", "", x.grandTotal],
  };
}
