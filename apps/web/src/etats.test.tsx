import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi } from "./api/fake.js";
import { LoginPage } from "./auth/LoginPage.js";
import { CLE_EXPIREE, SessionProvider } from "./auth/SessionProvider.js";
import { StockGaz } from "./gaz/StockGaz.js";
import { I18nProvider } from "./i18n/index.js";
import { db } from "./offline/db.js";
import { SyncPage } from "./offline/SyncPage.js";

const fr = (node: React.ReactNode) =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={null}>
        <MemoryRouter>{node}</MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );

describe("états illustrés", () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await db.outbox.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("la connexion explique une session expirée, puis n'en parle plus après une connexion réussie", async () => {
    sessionStorage.setItem(CLE_EXPIREE, "1");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
    fr(<LoginPage />);
    expect(screen.getByRole("status").textContent).toContain("Votre session a expiré");
    await userEvent.type(screen.getByLabelText("Identifiant"), "gerant");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "demo-jarvis");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));
    await vi.waitFor(() => expect(sessionStorage.getItem(CLE_EXPIREE)).toBeNull());
  });

  it("le stock hors ligne et jamais chargé affiche l'état « hors ligne », pas un tableau vide", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("hors ligne");
    });
    fr(<StockGaz />);
    expect(await screen.findByText("Vous êtes hors ligne")).toBeTruthy();
  });

  it("la synchronisation explique un conflit de stock sans rien effacer", async () => {
    await db.outbox.add({
      id: "o1",
      method: "POST",
      path: "/sales",
      syncType: "sale",
      body: {},
      idempotencyKey: "cle-12345",
      label: "Vente OLA",
      createdAt: 1,
      status: "conflict",
      attempts: 1,
      detail: "Stock insuffisant",
    });
    fr(<SyncPage />);
    expect(await screen.findByText("Un stock a changé pendant la coupure")).toBeTruthy();
    expect(screen.getByText("Stock insuffisant")).toBeTruthy();
  });
});
