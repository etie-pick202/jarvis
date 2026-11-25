import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { rubriquesPour, VOLETS } from "../nav/volets.js";
import { db } from "../offline/db.js";
import { Cloture } from "./Cloture.js";
import { deltasEnAttente, lireMontant } from "./donnees.js";
import { Depenses, Transferts } from "./Mouvements.js";
import { Soldes } from "./Soldes.js";

const ui = (node: React.ReactNode) => render(<I18nProvider initial="fr">{node}</I18nProvider>);

describe("CoCoCaisse", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("affiche les six caisses, le total et la part en espèces", async () => {
    ui(<Soldes />);
    expect(await screen.findByText("Ventes en espèces")).toBeTruthy();
    expect(screen.getAllByText("En veille")).toHaveLength(2);
    // 215 300 + 96 500 + 42 000 + 115 712 = 469 512 ; espèces : 215 300 + 42 000 = 257 300
    expect(screen.getByText("Total : 469 512 FCFA")).toBeTruthy();
    expect(screen.getByText(/dont 257 300 FCFA en espèces/u)).toBeTruthy();
  });

  it("une dépense baisse le solde tout de suite, même hors ligne", async () => {
    ui(
      <>
        <Depenses />
        <Soldes />
      </>,
    );
    await screen.findByText("Total : 469 512 FCFA");
    await userEvent.selectOptions(screen.getByLabelText("Depuis la caisse"), "Ventes en espèces");
    await userEvent.type(screen.getByLabelText("Montant (FCFA)"), "5000");
    await userEvent.type(screen.getByLabelText("Libellé"), "Transport");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("Total : 464 512 FCFA")).toBeTruthy();
    expect((await db.outbox.toArray())[0]?.body).toMatchObject({ registerId: "sales_cash", amount: 5000 });
  });

  it("refuse une dépense supérieure au solde", async () => {
    ui(<Depenses />);
    await screen.findByRole("option", { name: "Canal+ en espèces" });
    await userEvent.selectOptions(screen.getByLabelText("Depuis la caisse"), "Canal+ en espèces");
    await userEvent.type(screen.getByLabelText("Montant (FCFA)"), "50000");
    await userEvent.type(screen.getByLabelText("Libellé"), "Trop");
    expect(screen.getByRole("alert").textContent).toContain("42 000 FCFA");
    expect((screen.getByRole("button", { name: "Enregistrer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un transfert déplace l'argent d'une caisse à l'autre sans changer le total", async () => {
    ui(
      <>
        <Transferts />
        <Soldes />
      </>,
    );
    await screen.findByText("Total : 469 512 FCFA");
    await userEvent.selectOptions(screen.getByLabelText("Depuis la caisse"), "Ventes en espèces");
    await userEvent.selectOptions(screen.getByLabelText("Vers la caisse"), "Canal+ en espèces");
    await userEvent.type(screen.getByLabelText("Montant (FCFA)"), "10000");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText("205 300 FCFA")).toBeTruthy();
    expect(screen.getByText("52 000 FCFA")).toBeTruthy();
    expect(screen.getByText("Total : 469 512 FCFA")).toBeTruthy();
  });

  it("la clôture demande une justification dès qu'il y a un écart, une écriture par caisse", async () => {
    ui(<Cloture />);
    await screen.findByText("Ventes en espèces");
    const bouton = screen.getByRole("button", { name: "Clôturer la journée" }) as HTMLButtonElement;
    const soldes = ["215300", "96500", "42000", "115712"];
    for (const [i, nom] of [
      "Ventes en espèces",
      "Canal+ Orange Money",
      "Canal+ en espèces",
      "Règlement OM et MoMo",
    ].entries()) {
      // L'espèce « Canal+ en espèces » est comptée avec 1 000 FCFA de moins que le théorique.
      await userEvent.type(
        screen.getByLabelText(`${nom} : Comptage`),
        i === 2 ? "41000" : (soldes[i] as string),
      );
    }
    expect(bouton.disabled).toBe(true);
    await userEvent.type(
      screen.getByLabelText("Canal+ en espèces : Justification de l'écart"),
      "Monnaie rendue",
    );
    expect(bouton.disabled).toBe(false);
    await userEvent.click(bouton);
    expect(await screen.findByText("Clôture enregistrée.")).toBeTruthy();
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(4);
    const corps = (id: string) =>
      ops.find((o) => (o.body as { registerId: string }).registerId === id)?.body as Record<string, unknown>;
    expect(ops[0]).toMatchObject({ path: "/cash/closures" });
    expect(corps("canal_cash")).toMatchObject({ countedAmount: 41000, justification: "Monnaie rendue" });
    expect(corps("sales_cash")).not.toHaveProperty("justification");
  });

  it("calcule l'effet des mouvements en attente et lit les montants entiers", () => {
    expect(lireMontant("5000")).toBe(5000);
    expect(lireMontant("50.5")).toBeNull();
    expect(lireMontant("0")).toBeNull();
    const base = { id: "1", idempotencyKey: "k", createdAt: 1, attempts: 0, label: "x" } as const;
    expect(
      deltasEnAttente([
        {
          ...base,
          method: "POST",
          path: "/cash/expenses",
          body: { registerId: "a", amount: 100 },
          status: "pending",
        },
        {
          ...base,
          method: "POST",
          path: "/cash/transfers",
          body: { fromRegisterId: "a", toRegisterId: "b", amount: 40 },
          status: "pending",
        },
        {
          ...base,
          method: "POST",
          path: "/cash/expenses",
          body: { registerId: "a", amount: 999 },
          status: "conflict",
        },
      ]),
    ).toEqual({ a: -140, b: 40 });
  });

  it("le caissier ne voit pas la clôture ni les rubriques de gestion du gaz", () => {
    const caisse = VOLETS.find((v) => v.id === "caisse");
    const gaz = VOLETS.find((v) => v.id === "gaz");
    expect(rubriquesPour(caisse ?? (VOLETS[0] as never), ["caissier"]).map((r) => r.id)).toEqual([
      "soldes",
      "depenses",
      "transferts",
    ]);
    expect(rubriquesPour(gaz ?? (VOLETS[0] as never), ["caissier"]).map((r) => r.id)).toEqual(["stock"]);
    expect(rubriquesPour(caisse ?? (VOLETS[0] as never), ["gerant"]).map((r) => r.id)).toContain("cloture");
  });
});
