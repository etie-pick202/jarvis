import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { Soldes } from "../caisse/Soldes.js";
import { I18nProvider } from "../i18n/index.js";
import { lireVariation } from "./CorrectionStock.js";
import { StockGaz } from "./StockGaz.js";

const ui = (node: React.ReactNode, profil: "pdg" | "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const bouton = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const faux = (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init);
const refus = (status: number, code: string, message = "Refus essai") =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

type Envoi = { url: string; corps: unknown; cle: string };

/** Laisse passer les lectures ; chaque correction reçoit la réponse suivante de la liste. */
function serveur(reponses: (Response | "coupure")[]) {
  const envois: Envoi[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method !== "POST") return faux(url, init);
    envois.push({
      url,
      corps: JSON.parse(String(init.body)),
      cle: new Headers(init.headers).get("Idempotency-Key") ?? "",
    });
    const r = reponses.shift() ?? new Response("{}", { status: 201 });
    if (r === "coupure") throw new TypeError("réseau");
    return r;
  });
  return envois;
}

const verifierPuisConfirmer = async () => {
  await userEvent.click(bouton("Vérifier la correction"));
  await userEvent.click(bouton("Confirmer la correction"));
};

describe("corrections", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    vi.stubGlobal("fetch", faux);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lit une variation signée, jamais nulle", () => {
    expect(lireVariation(" -3 ")).toBe(-3);
    expect(lireVariation("+4")).toBe(4);
    for (const faux of ["0", "", "1,5", "abc", "100000"]) expect(lireVariation(faux)).toBeNull();
  });

  it("corrige un stock après confirmation, sans double envoi après une coupure", async () => {
    const envois = serveur(["coupure"]);
    ui(<StockGaz />);
    await userEvent.click(await screen.findByRole("button", { name: /^Corriger OLA/u }));
    const variation = screen.getByLabelText(/^Variation/u);
    await userEvent.type(variation, "-999");
    expect(screen.getByRole("alert").textContent).toBe("Le stock ne peut pas devenir négatif.");
    await userEvent.clear(variation);
    await userEvent.type(variation, "0");
    expect(screen.getByRole("alert").textContent).toMatch(/Variation invalide/u);
    await userEvent.clear(variation);
    await userEvent.type(variation, "-2");
    await userEvent.type(screen.getByLabelText(/^Justification/u), "abc");
    expect(bouton("Vérifier la correction").disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/^Justification/u), " casse");
    await userEvent.click(bouton("Vérifier la correction"));
    expect(screen.getByText(/Pleines : \d+ → \d+\. Le PDG sera prévenu\./u)).toBeTruthy();
    expect(envois).toHaveLength(0);
    await userEvent.click(bouton("Confirmer la correction"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Serveur injoignable/u);
    await verifierPuisConfirmer();
    expect(await screen.findByText("Correction enregistrée.")).toBeTruthy();
    expect(envois[0]?.cle).toBe(envois[1]?.cle);
    expect(envois[1]?.url).toBe("/api/v1/control/corrections/stock");
    expect(envois[1]?.corps).toMatchObject({ state: "full", delta: -2, justification: "abc casse" });
  });

  it("explique chaque refus et change de clé après un refus", async () => {
    const envois = serveur([
      refus(409, "stock_conflict"),
      refus(403, "forbidden"),
      refus(422, "justification_required"),
      refus(404, "not_found"),
      refus(503, "internal_error"),
      refus(409, "conflict", "Solde insuffisant (essai)"),
    ]);
    ui(<StockGaz />, "pdg");
    await userEvent.click(await screen.findByRole("button", { name: /^Corriger OLA/u }));
    await userEvent.click(screen.getByRole("radio", { name: "Vides" }));
    await userEvent.type(screen.getByLabelText(/^Variation/u), "1");
    await userEvent.type(screen.getByLabelText(/^Justification/u), "recomptage");
    for (const attendu of [
      "Le stock ne peut pas devenir négatif.",
      "Votre profil ne permet pas cette correction.",
      "Une justification est obligatoire.",
      "Élément introuvable : actualisez la page.",
      "Le serveur n'a pas pu répondre. Réessayez.",
      "Solde insuffisant (essai)",
    ]) {
      await verifierPuisConfirmer();
      expect((await screen.findByRole("alert")).textContent).toBe(attendu);
    }
    expect(envois[0]?.cle).not.toBe(envois[1]?.cle);
    await userEvent.click(bouton("Vérifier la correction"));
    await userEvent.click(bouton("Modifier la saisie"));
    await userEvent.click(bouton("Retour"));
    expect(screen.queryByRole("form", { name: /^Correction du stock/u })).toBeNull();
  });

  it("corrige une dépense depuis son détail ; vente, inverse et écriture corrigée sont refusées", async () => {
    const envois = serveur([]);
    ui(<Soldes />);
    await userEvent.click(await screen.findByRole("button", { name: "Mouvements Ventes en espèces" }));
    const ouvrir = async (numero: string) =>
      userEvent.click(await screen.findByRole("button", { name: `Détail de l'écriture ${numero}` }));
    for (const [numero, raison] of [
      ["RG0044", /annulant la vente/u],
      ["RG0043", /déjà une correction/u],
      ["RG0042", /déjà été corrigée/u],
    ] as const) {
      await ouvrir(numero);
      const detail = within(screen.getByRole("region", { name: `Écriture ${numero}` }));
      expect(detail.getByText(raison)).toBeTruthy();
      expect(detail.queryByRole("button", { name: "Corriger l'écriture" })).toBeNull();
    }
    await ouvrir("RG0041");
    await userEvent.click(bouton("Corriger l'écriture"));
    await userEvent.type(screen.getByLabelText(/^Justification/u), "saisie en double");
    await verifierPuisConfirmer();
    expect(await screen.findByText("Correction enregistrée.")).toBeTruthy();
    expect(envois[0]?.url).toMatch(/\/control\/corrections\/cash\/[0-9a-f-]{36}$/u);
    expect(envois[0]?.corps).toEqual({ justification: "saisie en double" });
  });

  it("le caissier consulte le journal sans pouvoir corriger", async () => {
    setFakeUser("caissier");
    ui(<Soldes />, "caissier");
    await userEvent.click(await screen.findByRole("button", { name: "Mouvements Ventes en espèces" }));
    await userEvent.click(await screen.findByRole("button", { name: "Détail de l'écriture RG0041" }));
    expect(screen.queryByRole("button", { name: "Corriger l'écriture" })).toBeNull();
    await userEvent.click(bouton("Fermer"));
    ui(<StockGaz />, "caissier");
    await screen.findAllByRole("rowheader", { name: /OLA/u });
    expect(screen.queryByRole("button", { name: /^Corriger/u })).toBeNull();
  });
});
