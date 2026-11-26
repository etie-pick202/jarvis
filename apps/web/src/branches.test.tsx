import "fake-indexeddb/auto";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { fakeApi, setFakeUser } from "./api/fake.js";
import { api } from "./api/index.js";
import { useCached } from "./api/useCached.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { Fournisseurs } from "./gaz/Fournisseurs.js";
import { I18nProvider, useI18n } from "./i18n/index.js";
import { useSuggestions } from "./vente/donnees.js";

const reseauFictif = () =>
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));

function appA(path: string, profils: ("pdg" | "caissier")[]) {
  localStorage.setItem(
    "jarvis.session",
    JSON.stringify({ userId: "u", nom: "x", profils, profilActif: profils[0] }),
  );
  setFakeUser(profils[0] ?? null);
  return render(
    <I18nProvider initial="fr">
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );
}

describe("écrans provisoires et droits", () => {
  beforeEach(() => {
    localStorage.clear();
    reseauFictif();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("une rubrique pas encore faite affiche l'écran provisoire de son volet", async () => {
    appA("/market/articles", ["pdg"]);
    expect(await screen.findByRole("heading", { level: 1, name: "CoCoMarket" })).toBeTruthy();
    expect(screen.getByText("Cet écran arrive bientôt.")).toBeTruthy();
  });

  it("une rubrique inconnue ou hors profil n'ouvre rien", async () => {
    appA("/market/inconnue", ["pdg"]);
    expect((await screen.findByRole("alert")).textContent).toContain("Page introuvable");
  });

  it("le caissier n'a pas accès au pilotage", async () => {
    appA("/pilot/tableau", ["caissier"]);
    expect((await screen.findByRole("alert")).textContent).toContain("Accès non autorisé");
  });
});

describe("langue", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prend l'anglais du navigateur à défaut de choix, puis garde le choix enregistré", () => {
    localStorage.clear();
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    const enveloppe = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider>{children}</I18nProvider>
    );
    expect(renderHook(() => useI18n().lang, { wrapper: enveloppe }).result.current).toBe("en");
    localStorage.setItem("jarvis.lang", "fr");
    expect(renderHook(() => useI18n().lang, { wrapper: enveloppe }).result.current).toBe("fr");
  });

  it("lève une erreur claire hors du fournisseur de langue", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useI18n())).toThrow(/I18nProvider/u);
  });
});

describe("lecture avec copie locale", () => {
  beforeEach(() => localStorage.clear());

  it("garde la copie locale quand la lecture échoue et signale le mode hors ligne", async () => {
    localStorage.setItem("jarvis.cache.v2.test", JSON.stringify(["copie"]));
    const { result } = renderHook(() =>
      useCached<string[]>("test", () => Promise.reject(new Error("hors ligne")), []),
    );
    await waitFor(() => expect(result.current.pret).toBe(true));
    expect(result.current).toMatchObject({ data: ["copie"], hors: true });
  });

  it("ignore une copie locale illisible", () => {
    localStorage.setItem("jarvis.cache.v2.test", "{pas du json");
    const { result } = renderHook(() =>
      useCached<string[]>("test", () => new Promise(() => undefined), ["défaut"]),
    );
    expect(result.current.data).toEqual(["défaut"]);
  });
});

describe("droits de lecture", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("une erreur autre qu'un refus de droit remonte à l'écran au lieu d'être masquée", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code: "internal_error", message: "x" } }), { status: 500 }),
    );
    await expect(api.alertes()).rejects.toMatchObject({ status: 500 });
  });

  it("un refus de droit donne une liste vide (le caissier ne lit pas les alertes)", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code: "forbidden", message: "non" } }), { status: 403 }),
    );
    expect(await api.alertes()).toEqual([]);
  });
});

describe("fournisseurs : cases des marques", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    reseauFictif();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("coche et décoche une marque", async () => {
    render(
      <I18nProvider initial="fr">
        <Fournisseurs />
      </I18nProvider>,
    );
    const ola = await screen.findByRole("checkbox", { name: "OLA" });
    await userEvent.click(ola);
    expect((ola as HTMLInputElement).checked).toBe(true);
    await userEvent.click(ola);
    expect((ola as HTMLInputElement).checked).toBe(false);
  });
});

describe("suggestions de clients hors ligne", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cherche dans les clients déjà vus quand le serveur est injoignable", async () => {
    localStorage.clear();
    localStorage.setItem(
      "jarvis.clients",
      JSON.stringify([
        { id: "1", nom: "Ndongo Berthe" },
        { id: "2", nom: "Kamga Paul" },
      ]),
    );
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("hors ligne");
    });
    const { result } = renderHook(() => useSuggestions("nd", true));
    await waitFor(() => expect(result.current.map((c) => c.nom)).toEqual(["Ndongo Berthe"]));
  });

  it("n'en propose pas sans saisie ou quand un client est déjà choisi", () => {
    const { result } = renderHook(() => useSuggestions("", true));
    expect(result.current).toEqual([]);
    const choisi = renderHook(() => useSuggestions("nd", false));
    expect(choisi.result.current).toEqual([]);
  });
});
