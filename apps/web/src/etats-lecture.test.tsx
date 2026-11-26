import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, EVENEMENT_SESSION, garderJeton, request } from "./api/client.js";
import { classerProbleme } from "./api/problemes.js";
import { useCached } from "./api/useCached.js";
import { I18nProvider } from "./i18n/index.js";
import { Etat } from "./ui/Etat.js";
import { usePagination, VoirPlus } from "./ui/listes.js";

const lire = () => "ok";
const reponse = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });

function Ecran({ charger }: { charger: () => Promise<string[]> }) {
  const lecture = useCached("essai", charger, [] as string[]);
  return (
    <Etat {...lecture} vide={lecture.data.length === 0} messageVide="Rien ici">
      <p>{lecture.data.join(",")}</p>
    </Etat>
  );
}

const afficher = (charger: () => Promise<string[]>) =>
  render(
    <I18nProvider initial="fr">
      <Ecran charger={charger} />
    </I18nProvider>,
  );

describe("états d'une lecture", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("classe chaque échec avec son code", () => {
    expect(classerProbleme(new ApiError(403, "non", "forbidden"))).toEqual({
      genre: "interdit",
      code: "forbidden",
    });
    expect(classerProbleme(new ApiError(401, "non"))).toEqual({ genre: "interdit", code: "401" });
    expect(classerProbleme(new ApiError(404, "non"))).toEqual({ genre: "indisponible", code: "404" });
    expect(classerProbleme(new ApiError(503, "non", "db_down"))).toEqual({
      genre: "serveur",
      code: "db_down",
    });
    expect(classerProbleme(new SyntaxError("json"))).toEqual({ genre: "contrat" });
    expect(classerProbleme(new TypeError("réseau"))).toEqual({ genre: "hors-ligne" });
    expect(classerProbleme("?")).toEqual({ genre: "hors-ligne" });
  });

  it("montre le chargement puis le message de liste vide", async () => {
    afficher(async () => []);
    expect(screen.getByRole("status").textContent).toContain("Chargement");
    expect(await screen.findByText("Rien ici")).toBeTruthy();
  });

  it("erreur serveur sans copie : alerte avec le code, puis « Réessayer » recharge", async () => {
    let panne = true;
    const charger = async () => {
      if (panne) throw new ApiError(500, "boum", "internal_error");
      return ["OLA"];
    };
    afficher(charger);
    expect((await screen.findByRole("alert")).textContent).toContain("internal_error");
    panne = false;
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("OLA")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("avec une copie sur l'appareil, garde les données et signale pourquoi elles datent", async () => {
    localStorage.setItem("jarvis.cache.v2.essai", JSON.stringify(["TRADEX"]));
    afficher(async () => {
      throw new ApiError(403, "non", "forbidden");
    });
    expect(await screen.findByText(/Données gardées sur l'appareil/u)).toBeTruthy();
    expect(screen.getByText("TRADEX")).toBeTruthy();
  });

  it("retente toute seule au retour du réseau", async () => {
    let hors = true;
    const charger = async () => {
      if (hors) throw new TypeError("réseau");
      return ["BOCOM"];
    };
    afficher(charger);
    expect(await screen.findByText("Vous êtes hors ligne")).toBeTruthy();
    hors = false;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(await screen.findByText("BOCOM")).toBeTruthy();
  });

  it("signale la session expirée sur un 401, sauf à la connexion et à la déconnexion", async () => {
    const ecoute = vi.fn();
    window.addEventListener(EVENEMENT_SESSION, ecoute);
    vi.stubGlobal("fetch", async () => reponse(401, { error: { code: "unauthorized", message: "jeton" } }));
    garderJeton("jeton-test");
    await expect(
      request("/auth/login", { method: "POST", idempotencyKey: "k", parse: lire }),
    ).rejects.toThrow();
    await expect(
      request("/auth/logout", { method: "POST", idempotencyKey: "k", parse: lire }),
    ).rejects.toThrow();
    expect(ecoute).not.toHaveBeenCalled();
    await expect(request("/stock", { parse: lire })).rejects.toThrow("jeton");
    expect(ecoute).toHaveBeenCalledTimes(1);
    localStorage.clear();
    await expect(request("/stock", { parse: lire })).rejects.toThrow();
    expect(ecoute).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENEMENT_SESSION, ecoute);
  });
});

describe("très longues listes", () => {
  it("n'affiche que la première page puis le reste à la demande", async () => {
    const elements = Array.from({ length: 5 }, (_, i) => i);
    const { result } = renderHook(() => usePagination(elements, 2));
    expect(result.current.visibles).toEqual([0, 1]);
    expect(result.current.restants).toBe(3);
    act(() => result.current.plus());
    act(() => result.current.plus());
    await waitFor(() => expect(result.current.restants).toBe(0));
    expect(result.current.visibles).toHaveLength(5);
  });

  it("le bouton disparaît quand tout est affiché", () => {
    const { container } = render(
      <I18nProvider initial="fr">
        <VoirPlus restants={0} plus={() => undefined} />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("");
  });
});
