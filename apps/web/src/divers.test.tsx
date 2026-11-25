import "fake-indexeddb/auto";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { SessionProvider, useSession } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";
import { db } from "./offline/db.js";
import { SyncPage } from "./offline/SyncPage.js";
import { Exports } from "./rapport/Rapports.js";
import { Recu, type RecuVente } from "./vente/Recu.js";

const enFrancais = (node: React.ReactNode) => render(<I18nProvider initial="fr">{node}</I18nProvider>);

const recu: RecuVente = {
  numero: "L-ABC123",
  date: new Date("2026-11-24T09:00:00Z"),
  client: "Mme Ndongo",
  telephone: "+237 600 000 001",
  paiement: "momo",
  panier: {
    article: { id: "a", nom: "Gaz 12,5 kg OLA", genre: "gaz", prix: 6800, stock: 3 },
    quantite: 1,
    reception: "livraison",
    echange: "TOTAL",
  },
};

describe("reçu partageable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("partage le PDF par la feuille de partage du téléphone quand elle existe", async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { canShare: () => true, share }));
    enFrancais(<Recu recu={recu} onNouvelle={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Partager en PDF" }));
    expect(share).toHaveBeenCalledOnce();
  });

  it("télécharge le PDF sinon, et le lien WhatsApp contient le reçu", async () => {
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }),
    );
    const nouvelle = vi.fn();
    enFrancais(<Recu recu={recu} onNouvelle={nouvelle} />);
    await userEvent.click(screen.getByRole("button", { name: "Partager en PDF" }));
    expect(clic).toHaveBeenCalled();
    const lien = screen.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href") ?? "";
    expect(lien).toContain("https://wa.me/237600000001?text=");
    expect(decodeURIComponent(lien)).toContain("Échange : bouteille TOTAL rapportée");
    await userEvent.click(screen.getByRole("button", { name: "Nouvelle vente" }));
    expect(nouvelle).toHaveBeenCalledOnce();
  });
});

describe("synchronisation", () => {
  beforeEach(async () => {
    await db.outbox.clear();
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
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("réessaie une opération en conflit sans l'effacer, ou l'écarte sur choix explicite", async () => {
    enFrancais(
      <MemoryRouter>
        <SyncPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Stock insuffisant")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await vi.waitFor(async () => expect((await db.outbox.get("o1"))?.status).toBe("pending"));
    await db.outbox.update("o1", { status: "rejected" });
    await userEvent.click(await screen.findByRole("button", { name: "Écarter" }));
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
  });
});

describe("exports du serveur", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("pdg");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("télécharge le CSV du serveur", async () => {
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }),
    );
    enFrancais(<Exports />);
    await userEvent.click(screen.getByRole("button", { name: /ventes\.csv/u }));
    await vi.waitFor(() => expect(clic).toHaveBeenCalled());
  });

  it("signale un export impossible (droits ou réseau)", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));
    enFrancais(<Exports />);
    await userEvent.click(screen.getByRole("button", { name: /stock-gaz\.csv/u }));
    expect((await screen.findByRole("alert")).textContent).toContain("Export impossible");
  });
});

function Bascule() {
  const { mode, setMode, session } = useSession();
  return (
    <>
      <p>{`${mode}:${session?.profilActif}`}</p>
      <button type="button" onClick={() => setMode("livreur")}>
        livreur
      </button>
      <button type="button" onClick={() => setMode("gestion")}>
        gestion
      </button>
    </>
  );
}

describe("bascule de profil", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("demande au serveur de changer le profil actif, sans reconnexion", async () => {
    render(
      <SessionProvider
        initial={{ userId: "u", nom: "Gérant", profils: ["gerant", "livreur"], profilActif: "gerant" }}
      >
        <Bascule />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "livreur" }));
    await vi.waitFor(() => expect(screen.getByText("livreur:livreur")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "gestion" }));
    await vi.waitFor(() => expect(screen.getByText("gestion:gerant")).toBeTruthy());
  });

  it("hors ligne, seul l'affichage change", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(
      <SessionProvider
        initial={{ userId: "u", nom: "Gérant", profils: ["gerant", "livreur"], profilActif: "gerant" }}
      >
        <Bascule />
      </SessionProvider>,
    );
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "livreur" }));
    });
    expect(screen.getByText("livreur:gerant")).toBeTruthy();
  });
});
