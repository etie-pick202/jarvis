import type { GasPrice, PaymentMethod, SessionUser } from "@jarvis/shared";
import type { z } from "zod";
import type { Profil } from "../nav/volets.js";
import { API_BASE, ApiError, enTetes, erreurDe, request } from "./client.js";
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
import * as dto from "./dto.js";

export * from "./client.js";
export * from "./contracts.js";

/** Valide une réponse avec son schéma ; un contrat non respecté lève une erreur claire. */
const lire =
  <S extends z.ZodType>(schema: S) =>
  (data: unknown): z.infer<S> =>
    schema.parse(data);

export const toSession = (u: SessionUser): Session => ({
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
  PaymentMethod
>;

const PAIEMENT_LIBELLE: Record<string, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  momo: "MoMo",
};

/** Prix en vigueur d'une marque : l'exception de marque la plus récente, sinon le prix du format. */
export function prixEnVigueur(historique: readonly GasPrice[], brandId: string): GasPrice | null {
  const plusRecent = (l: readonly GasPrice[]) =>
    [...l].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
  return (
    plusRecent(historique.filter((p) => p.brandId === brandId)) ??
    plusRecent(historique.filter((p) => p.brandId === null))
  );
}

const get = <S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal) =>
  request(path, { signal, parse: lire(schema) });

async function marquesParId(signal?: AbortSignal): Promise<Map<string, string>> {
  const brands = await get("/catalogue/brands", dto.brandList, signal);
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
      parse: lire(dto.loginResult),
    });
    return { token: r.token, session: toSession(r.user) };
  },
  me: async (signal?: AbortSignal): Promise<Session> =>
    toSession(await get("/auth/me", dto.sessionUserSchema, signal)),
  logout: (idempotencyKey: string): Promise<null> =>
    request("/auth/logout", { method: "POST", idempotencyKey, parse: () => null }),
  switchRole: async (role: Profil, idempotencyKey: string): Promise<Session> =>
    toSession(
      await request("/auth/switch-role", {
        method: "POST",
        body: { role },
        idempotencyKey,
        parse: lire(dto.sessionUserSchema),
      }),
    ),

  /** Catalogue vendable : gaz (marque × format avec son prix en vigueur) et articles libres. */
  catalogue: async (signal?: AbortSignal): Promise<Article[]> => {
    const [brands, formats, articles, stock] = await Promise.all([
      get("/catalogue/brands", dto.brandList, signal),
      get("/catalogue/formats", dto.formatList, signal),
      get("/catalogue/articles", dto.articleList, signal),
      get("/stock", dto.stockRows, signal),
    ]);
    const historiques = new Map(
      await Promise.all(
        formats
          .filter((f) => f.active)
          .map(
            async (f) =>
              [f.id, await get(`/catalogue/prices/${f.id}/history`, dto.gasPriceList, signal)] as const,
          ),
      ),
    );
    const gaz: Article[] = [];
    for (const b of brands.filter((x) => x.active)) {
      for (const f of formats.filter((x) => x.active)) {
        const prix = prixEnVigueur(historiques.get(f.id) ?? [], b.id);
        if (!prix) continue; // pas encore de prix saisi par le PDG : non vendable
        gaz.push({
          id: `${b.id}:${f.id}`,
          nom: `Gaz ${f.label} ${b.name}`,
          genre: "gaz",
          marque: b.name,
          formatLibelle: f.label,
          prix: prix.amount + prix.transportContribution,
          stock: stock.find((s) => s.brandId === b.id && s.formatId === f.id)?.full ?? 0,
          valeurEmballage: b.packagingValue,
          brandId: b.id,
          formatId: f.id,
        });
      }
    }
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

  /** Recherche de client dès les premières lettres (le serveur normalise accents et casse). */
  clients: async (q: string, signal?: AbortSignal): Promise<Client[]> =>
    (await get(`/customers?q=${encodeURIComponent(q)}`, dto.customerRows, signal)).map((c) => ({
      id: c.id,
      nom: c.name,
      telephone: c.phone ?? undefined,
    })),

  gazStock: async (signal?: AbortSignal): Promise<GazStock[]> =>
    (await get("/stock", dto.stockRows, signal)).map((s) => ({
      marque: s.brandName,
      brandId: s.brandId,
      formatId: s.formatId,
      formatLabel: s.formatLabel,
      pleines: s.full,
      vides: s.empty,
      seuil: s.threshold,
    })),

  /** Échanges entre marques, déduits des ventes (une ligne de gaz dont la marque rapportée diffère). */
  echanges: async (signal?: AbortSignal): Promise<Echange[]> => {
    const [ventes, noms] = await Promise.all([get("/sales", dto.saleList, signal), marquesParId(signal)]);
    return ventes.flatMap((v) =>
      v.lines
        .filter((l) => l.kind === "gas" && l.returnedBrandId && l.returnedBrandId !== l.brandId)
        .map((l, i) => ({
          id: `${v.id}:${i}`,
          date: v.createdAt,
          client: v.customerName,
          remise: noms.get(l.brandId ?? "") ?? "?",
          rapportee: noms.get(l.returnedBrandId ?? "") ?? "?",
          ecart: l.packagingGap,
        })),
    );
  },

  marques: async (signal?: AbortSignal): Promise<{ id: string; nom: string }[]> =>
    (await get("/catalogue/brands", dto.brandList, signal))
      .filter((b) => b.active)
      .map((b) => ({ id: b.id, nom: b.name })),

  formats: async (signal?: AbortSignal): Promise<{ id: string; libelle: string }[]> =>
    (await get("/catalogue/formats", dto.formatList, signal))
      .filter((f) => f.active)
      .map((f) => ({ id: f.id, libelle: f.label })),

  fournisseurs: async (signal?: AbortSignal): Promise<Fournisseur[]> => {
    const [lignes, noms] = await Promise.all([
      get("/suppliers", dto.supplierRows, signal),
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
      get("/receptions", dto.receptionRows, signal),
      get("/suppliers", dto.supplierRows, signal),
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
    (await get("/cash/registers", dto.registerRows, signal)).map((r) => ({
      id: r.id,
      nom: r.label,
      solde: r.balance,
      actif: r.active,
      especes: CAISSES_ESPECES.includes(r.id),
    })),

  /** Pas de route de tableau de bord côté serveur : composé à partir des rapports (livraisons et échéances : lots suivants). */
  tableau: async (signal?: AbortSignal): Promise<Tableau> => {
    const stats = await get("/reports/customers", dto.customerStats, signal);
    return { caJour: stats.totals.total, nbVentes: stats.lines.length, livraisonsEnCours: 0, echeances: 0 };
  },

  alertes: async (signal?: AbortSignal): Promise<Alerte[]> => {
    const [bas, notes] = await Promise.all([
      sansDroit(get("/stock/alerts", dto.stockRows, signal), []),
      sansDroit(get("/control/notifications?unread=1", dto.notificationRows, signal), []),
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
      get("/inventory?pending=1", dto.countRows, signal),
      marquesParId(signal),
      get("/catalogue/formats", dto.formatList, signal),
    ]);
    return lignes.map((c) => {
      const format = formats.find((f) => f.id === c.formatId)?.label ?? "";
      const genre = c.kind === "weekly" ? "Inventaire hebdomadaire" : "Confirmation du soir";
      return {
        id: c.id,
        genre: "inventaire",
        resume: `${genre} : ${noms.get(c.brandId) ?? "?"} ${format}, écart pleines ${signe(c.countedFull - c.theoreticalFull)}, vides ${signe(c.countedEmpty - c.theoreticalEmpty)}`,
        auteur: "",
        date: c.createdAt,
      };
    });
  },

  audit: async (signal?: AbortSignal): Promise<LigneAudit[]> =>
    (await get("/control/audit", dto.auditRows, signal)).map((a) => ({
      id: a.id,
      date: a.createdAt,
      action: a.action,
      detail: [a.entity, ...Object.entries(a.details ?? {}).map(([k, v]) => `${k} : ${String(v)}`)].join(
        " · ",
      ),
    })),

  badges: async (signal?: AbortSignal): Promise<Badges> => {
    const [bas, attente] = await Promise.all([
      sansDroit(get("/stock/alerts", dto.stockRows, signal), []),
      sansDroit(get("/inventory?pending=1", dto.countRows, signal), []),
    ]);
    return { commandes: 0, stockBas: bas.length, echeances: 0, validations: attente.length };
  },

  /** Livraisons du jour : le module de livraison n'a pas encore de contrat côté serveur (lot 3). */
  livraisons: async (): Promise<Livraison[]> => [],

  rapport: async (id: "clients" | "journal" | "x", signal?: AbortSignal): Promise<Rapport> => {
    if (id === "clients") return rapportClients(await get("/reports/customers", dto.customerStats, signal));
    if (id === "journal") return rapportJournal(await get("/reports/cash-journal", dto.cashJournal, signal));
    return rapportX(await get("/reports/x", dto.xReport, signal));
  },

  situationGaz: async (signal?: AbortSignal): Promise<Rapport> => {
    const s = await get("/reports/gas-situation", dto.gasSituation, signal);
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

export function rapportClients(s: z.infer<typeof dto.customerStats>): Rapport {
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

export function rapportJournal(j: z.infer<typeof dto.cashJournal>): Rapport {
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

export function rapportX(x: z.infer<typeof dto.xReport>): Rapport {
  return {
    colonnes: ["Caisse", "Type", "N° pièce", "Libellé", "Montant"],
    lignes: x.registers.flatMap((r) => [
      [r.label, "FDC", "", "Fond de caisse", r.opening],
      ...r.movements.map((m) => [r.label, m.type, m.number, m.label, m.amount]),
    ]),
    pied: ["Total général", "", "", "", x.grandTotal],
  };
}
