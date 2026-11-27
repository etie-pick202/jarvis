import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/index.js";
import { Exports } from "./Exports.js";
import { erreurPeriode } from "./periode.js";

const appels: string[] = [];
const ui = () =>
  render(
    <I18nProvider initial="fr">
      <Exports />
    </I18nProvider>,
  );

describe("exports", () => {
  beforeEach(() => {
    appels.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:essai");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      return new Response("contenu");
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("limite la période", () => {
    expect(erreurPeriode("2026-01-01", "2026-04-02")).toBeNull();
    expect(erreurPeriode("2026-01-01", "2026-04-03")).toBe("exports.trop.long");
    expect(erreurPeriode("2026-02-01", "2026-01-01")).toBe("exports.ordre");
    expect(erreurPeriode("", "2026-01-01")).toBe("exports.ordre");
  });

  it("demande Excel sur la période et le PDF du dernier jour", async () => {
    ui();
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-20" } });
    const boutons = screen.getAllByRole("button", { name: /\.xlsx\)$/u });
    await userEvent.click(boutons[0] as HTMLElement);
    await userEvent.click(screen.getAllByRole("button", { name: /\.pdf\)$/u })[3] as HTMLElement);
    await waitFor(() => expect(appels).toHaveLength(2));
    expect(appels[0]).toBe("/api/v1/reports/export/sales.xlsx?from=2026-11-01&to=2026-11-20");
    expect(appels[1]).toBe("/api/v1/documents/reports/x.pdf?date=2026-11-20");
    await userEvent.click(screen.getAllByRole("button", { name: /\.csv\)$/u })[2] as HTMLElement);
    await waitFor(() => expect(appels[2]).toBe("/api/v1/reports/export/stock.csv"));
  });

  it("bloque une période inversée et explique un refus ou une panne", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code: "forbidden", message: "Refus essai" } }), {
          status: 403,
        }),
    );
    ui();
    await userEvent.click(screen.getAllByRole("button", { name: /\.pdf\)$/u })[0] as HTMLElement);
    expect((await screen.findByRole("alert")).textContent).toBe("Refus essai");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    await userEvent.click(screen.getAllByRole("button", { name: /\.pdf\)$/u })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByRole("alert").textContent).not.toBe("Refus essai"));
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2020-01-01" } });
    expect((screen.getAllByRole("button", { name: /\.xlsx\)$/u })[0] as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
