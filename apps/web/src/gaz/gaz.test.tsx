import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Echanges } from "./Echanges.js";
import { Fournisseurs } from "./Fournisseurs.js";
import { StockGaz } from "./StockGaz.js";

const ui = (node: React.ReactNode) => render(<I18nProvider initial="fr">{node}</I18nProvider>);

describe("CoCoGaz", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    // Lecture possible, envoi impossible : les écritures restent dans la file.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("affiche le stock par marque avec le total général (98 pleines, 33 vides) et les alertes", async () => {
    ui(<StockGaz />);
    const total = (await screen.findByText("Total général")).closest("tr") as HTMLElement;
    expect(
      within(total)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["98", "33", "131", ""]);
    expect(screen.getByText("Rupture")).toBeTruthy(); // TRADEX
  });

  it("la confirmation du soir exige une justification en cas d'écart", async () => {
    ui(<StockGaz />);
    await screen.findByText("Total général");
    const confirmer = screen.getByRole("button", { name: "Confirmer le stock" }) as HTMLButtonElement;
    expect(confirmer.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Bouteilles comptées"), "129");
    expect(screen.getByRole("alert").textContent).toContain("-2");
    expect(confirmer.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Justification de l'écart"), "Deux bouteilles prêtées");
    expect(confirmer.disabled).toBe(false);
    await userEvent.click(confirmer);
    expect(await screen.findByText("Confirmation enregistrée.")).toBeTruthy();
    const ops = await db.outbox.toArray();
    expect(ops[0]?.body).toMatchObject({
      compte: 129,
      theorique: 131,
      justification: "Deux bouteilles prêtées",
    });
  });

  it("la confirmation sans écart part sans justification", async () => {
    ui(<StockGaz />);
    await screen.findByText("Total général");
    await userEvent.type(screen.getByLabelText("Bouteilles comptées"), "131");
    await userEvent.click(screen.getByRole("button", { name: "Confirmer le stock" }));
    await vi.waitFor(async () =>
      expect((await db.outbox.toArray())[0]?.body).toMatchObject({ justification: null }),
    );
  });

  it("liste les échanges avec le gain ou la perte d'emballage", async () => {
    ui(<Echanges />);
    expect(await screen.findByText("Perte 2 500 FCFA")).toBeTruthy();
    expect(screen.getByText("Gain 1 600 FCFA")).toBeTruthy();
  });

  it("ajoute un fournisseur, visible tout de suite et rangé dans la file d'envoi", async () => {
    ui(<Fournisseurs />);
    await screen.findByText("Dépôt Central");
    const ajouter = screen.getByRole("button", { name: "Ajouter" }) as HTMLButtonElement;
    expect(ajouter.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Nom"), "Gaz Express");
    await userEvent.type(screen.getByLabelText("Téléphone"), "237600000099");
    await userEvent.click(screen.getByRole("checkbox", { name: "OLA" }));
    await userEvent.click(ajouter);
    expect(await screen.findByText("Gaz Express")).toBeTruthy();
    expect((await db.outbox.toArray())[0]?.path).toBe("/fournisseurs");
  });
});
