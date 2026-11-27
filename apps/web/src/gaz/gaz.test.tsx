import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Echanges } from "./Echanges.js";
import { Fournisseurs } from "./Fournisseurs.js";
import { StockGaz } from "./StockGaz.js";

const ui = (node: React.ReactNode) =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: ["gerant"], profilActif: "gerant" }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

/** Stock de l'exemple : pleines et vides par marque (OLA, TRADEX, BOCOM, TOTAL, STARGAS). */
const PLEINES = [30, 0, 18, 28, 22];
const VIDES = [10, 9, 4, 6, 4];
const MARQUES = ["OLA", "TRADEX", "BOCOM", "TOTAL", "STARGAS"];

async function compter(pleines: number[], vides: number[]) {
  for (const [i, marque] of MARQUES.entries()) {
    await userEvent.type(screen.getByLabelText(new RegExp(`^${marque} : Pleines`, "u")), String(pleines[i]));
    await userEvent.type(screen.getByLabelText(new RegExp(`^${marque} : Vides`, "u")), String(vides[i]));
  }
}

describe("CoCoGaz", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    // Lecture possible, envoi impossible : les écritures restent dans la file.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
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
    await compter([30, 0, 17, 28, 22], VIDES); // BOCOM : une pleine en moins
    expect(screen.getByRole("alert").textContent).toContain("Écart");
    expect(confirmer.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Justification de l'écart"), "Une bouteille prêtée");
    expect(confirmer.disabled).toBe(false);
    await userEvent.click(confirmer);
    expect(await screen.findByText("Confirmation enregistrée.")).toBeTruthy();
    const [op] = await db.outbox.toArray();
    expect(op).toMatchObject({ path: "/inventory/evening", syncType: "inventory_evening" });
    expect(op?.body).toMatchObject({ justification: "Une bouteille prêtée" });
    expect(op?.body).toMatchObject({ lines: [{}, {}, {}, {}, {}] });
  });

  it("la confirmation sans écart part sans justification", async () => {
    ui(<StockGaz />);
    await screen.findByText("Total général");
    await compter(PLEINES, VIDES);
    expect(screen.getAllByText("Conforme")).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Confirmer le stock" }));
    await vi.waitFor(async () => {
      const [op] = await db.outbox.toArray();
      expect(op?.body).not.toHaveProperty("justification");
    });
  });

  it("liste les échanges avec le gain ou la perte d'emballage", async () => {
    ui(
      <SessionProvider initial={{ userId: "u", nom: "x", profils: ["gerant"], profilActif: "gerant" }}>
        <Echanges />
      </SessionProvider>,
    );
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
    await userEvent.click(await screen.findByRole("checkbox", { name: "OLA" }));
    await userEvent.click(ajouter);
    expect(await screen.findByText("Gaz Express")).toBeTruthy();
    const [op] = await db.outbox.toArray();
    expect(op?.path).toBe("/suppliers");
    expect(op?.body).toMatchObject({ name: "Gaz Express", phone: "237600000099" });
  });
});
