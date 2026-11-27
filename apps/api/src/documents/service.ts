import { schema } from "@jarvis/db";
import type { Language, SaleReceipt } from "@jarvis/shared";
import { asc, eq } from "drizzle-orm";
import { requireRow } from "../db-errors.js";
import type { Deps } from "../http.js";
import { whatsappLink } from "../notifications/whatsapp.js";
import { gasLabel } from "../reports/compute.js";
import { cashTable, salesTable, stockTable, type Table, xReport } from "../reports/service.js";
import { fcfaText, shopDateTime, textTable } from "./text.js";

const { sales, saleLines, brands, formats, articles, customers } = schema;

/** Nom provisoire : la raison sociale reste à fixer (cahier des charges, « Raison sociale »). */
const SHOP = "COCOSAB";

const WORDS = {
  fr: {
    receipt: "Reçu",
    cancel: "Annulation",
    client: "Client",
    total: "TOTAL",
    paid: "Réglé en",
    notice: "Reçu simple, ne vaut pas facture normalisée. Merci !",
    methods: { cash: "espèces", orange_money: "Orange Money", momo: "MoMo" },
  },
  en: {
    receipt: "Receipt",
    cancel: "Cancellation",
    client: "Customer",
    total: "TOTAL",
    paid: "Paid by",
    notice: "Simple receipt, not a tax invoice. Thank you!",
    methods: { cash: "cash", orange_money: "Orange Money", momo: "MoMo" },
  },
} as const;

/** Reçu d'une vente : lignes de texte, message à partager et lien WhatsApp prérempli. */
export async function saleReceipt(deps: Deps, saleId: string, language: Language): Promise<SaleReceipt> {
  const sale = requireRow(
    await deps.db.select().from(sales).where(eq(sales.id, saleId)),
    "Vente introuvable",
  );
  const rows = await deps.db
    .select({ line: saleLines, format: formats.label, article: articles.name })
    .from(saleLines)
    .leftJoin(formats, eq(formats.id, saleLines.formatId))
    .leftJoin(articles, eq(articles.id, saleLines.articleId))
    .where(eq(saleLines.saleId, saleId))
    .orderBy(asc(saleLines.id));
  const allBrands = await deps.db.select().from(brands);
  const brandName = (id: string | null) => allBrands.find((b) => b.id === id)?.name ?? null;
  const [customer] = sale.customerId
    ? await deps.db.select().from(customers).where(eq(customers.id, sale.customerId))
    : [];
  const words = WORDS[language];
  const lines = [
    SHOP,
    `${sale.reversalOf ? words.cancel : words.receipt} ${sale.number} - ${shopDateTime(sale.createdAt)}`,
    `${words.client} : ${sale.customerName}`,
    "",
    ...rows.map(({ line, format, article }) => {
      const item =
        line.kind === "gas"
          ? gasLabel(brandName(line.brandId) ?? "", brandName(line.returnedBrandId), format ?? "")
          : (article ?? "");
      return `${line.quantity} x ${item} : ${fcfaText(line.total)}`;
    }),
    "",
    `${words.total} : ${fcfaText(sale.total)}`,
    `${words.paid} ${words.methods[sale.paymentMethod as keyof typeof words.methods]}`,
    words.notice,
  ];
  const message = lines.join("\n");
  // Sans numéro connu, WhatsApp laisse choisir le contact.
  const whatsappUrl = customer?.phone
    ? whatsappLink(customer.phone, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  return { number: sale.number, lines, message, whatsappUrl };
}

export type ReportName = "sales" | "cash" | "stock" | "x";

const TITLES: Record<ReportName, string> = {
  sales: "Statistiques clients",
  cash: "Journal de caisse",
  stock: "Situation gaz",
  x: "X de caisse",
};

async function xTable(deps: Deps, day: string): Promise<Table> {
  const report = await xReport(deps, day);
  return {
    headers: ["Caisse", "Pièce", "Type", "Libellé", "Montant"],
    rows: [
      ...report.registers.flatMap((r) => [
        [r.label, "", "FDC", "Fond de caisse", r.opening],
        ...r.movements.map((m) => [r.label, m.number, m.type, m.label, m.amount]),
        [r.label, "", "", "Total de la caisse", r.closing],
      ]),
      ["TOTAL GÉNÉRAL", "", "", "", report.grandTotal],
    ],
  };
}

/** Rapport d'un jour en lignes de texte, prêt pour le PDF. */
export async function reportLines(deps: Deps, name: ReportName, day: string): Promise<string[]> {
  const table = {
    sales: () => salesTable(deps, [day]),
    cash: () => cashTable(deps, [day]),
    stock: () => stockTable(deps),
    x: () => xTable(deps, day),
  }[name];
  const { headers, rows } = await table();
  // La situation gaz est celle de l'instant : elle porte sa date d'édition.
  const date = name === "stock" ? shopDateTime(deps.now()) : day.split("-").reverse().join("/");
  return [`${SHOP} - ${TITLES[name]} - ${date}`, "", ...textTable(headers, rows)];
}
