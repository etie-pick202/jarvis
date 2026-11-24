import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/index.js";
import { db } from "./db.js";
import { enqueue, flush } from "./outbox.js";
import { StatusLight } from "./StatusLight.js";
import { SyncPage } from "./SyncPage.js";

function ui(node: React.ReactNode) {
  return render(
    <I18nProvider initial="fr">
      <MemoryRouter>{node}</MemoryRouter>
    </I18nProvider>,
  );
}

describe("voyant de connexion", () => {
  beforeEach(async () => {
    await db.outbox.clear();
  });

  it("indique l'état et le nombre d'opérations en attente", async () => {
    await enqueue({ method: "POST", path: "/ventes", body: {}, label: "Vente" });
    ui(<StatusLight />);
    expect(screen.getByRole("status").textContent).toContain("En ligne");
    expect(await screen.findByText("1 en attente")).toBeTruthy();
  });

  it("signale un conflit et le détaille sur la page de synchronisation", async () => {
    await enqueue({ method: "POST", path: "/ventes", body: {}, label: "Vente OLA" });
    await flush(async () => ({ kind: "conflict", detail: "Stock insuffisant" }));
    ui(
      <>
        <StatusLight />
        <SyncPage />
      </>,
    );
    expect(await screen.findByText("1 à vérifier")).toBeTruthy();
    expect(await screen.findByText("Stock insuffisant")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});
