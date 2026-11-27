import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Clients } from "./Clients.js";
import { Historique } from "./Historique.js";
import { annulables, totalVendu } from "./net.js";

const ui = (node: React.ReactNode, profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();

describe("historique et clients", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("neutralise les ventes annulées dans le total", () => {
    const v = [
      { id: "a", total: 100, reversalOf: null },
      { id: "b", total: 50, reversalOf: null },
      { id: "c", total: 100, reversalOf: "a" },
    ];
    expect([...annulables(v)]).toEqual(["b"]);
    expect(totalVendu(v)).toBe(50);
  });

  it("annule une vente avec un motif ; elle ne peut pas l'être deux fois", async () => {
    ui(<Historique />);
    await userEvent.click(await screen.findByRole("button", { name: "Annuler TK1993" }));
    await userEvent.type(screen.getByLabelText(/Motif/u), "erreur de saisie");
    await userEvent.click(screen.getByRole("button", { name: "Confirmer l'annulation" }));
    expect(await screen.findByText("Annulée")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Annuler TK1993" })).toBeNull();
    expect((await operations())[0]).toMatchObject({ body: { justification: "erreur de saisie" } });
    expect((await operations())[0]?.path).toMatch(/\/sales\/.+\/cancel$/u);
  });

  it("le caissier consulte sans annuler ; une date sans vente le dit", async () => {
    ui(<Historique />, "caissier");
    expect(await screen.findByRole("rowheader", { name: /TK1993/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Annuler/u })).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("[]"));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-02" } });
    expect(await screen.findByText("Aucune vente à cette date.")).toBeTruthy();
  });

  it("cherche un client et explique une panne", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("q=zzz")
        ? new Response("[]")
        : new Response(
            JSON.stringify([
              { id: "00000000-0000-4000-8000-000000000777", name: "Client Essai", phone: "+237690000044" },
            ]),
          ),
    );
    ui(<Clients />);
    await userEvent.type(screen.getByRole("searchbox"), "cli{Enter}");
    expect(await screen.findByRole("rowheader", { name: "Client Essai" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Envoyer par WhatsApp Client Essai" }).getAttribute("href"),
    ).toContain("wa.me/237690000044");
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz{Enter}");
    expect(await screen.findByText("Aucun client à ce nom.")).toBeTruthy();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    await userEvent.click(screen.getByRole("button", { name: "Chercher" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Vous êtes hors ligne"));
  });

  it("partage le reçu du serveur, compose un reçu local hors ligne, montre un refus", async () => {
    const partages: File[] = [];
    Object.assign(navigator, {
      canShare: () => true,
      share: async ({ files }: { files: File[] }) => void partages.push(...files),
    });
    ui(<Historique />);
    const recu = await screen.findByRole("button", { name: "Reçu TK1993" });
    const appels: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      return new Response("%PDF serveur");
    });
    await userEvent.click(recu);
    await waitFor(() => expect(partages).toHaveLength(1));
    expect(appels[0]).toMatch(/\/documents\/sales\/.+\/receipt\.pdf\?lang=fr$/u);
    expect(screen.queryByText(/composé sur cet appareil/u)).toBeNull();

    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    await userEvent.click(recu);
    expect(await screen.findByText(/composé sur cet appareil/u)).toBeTruthy();
    expect(partages[1]?.name).toBe("recu-TK1993.pdf");

    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { code: "forbidden", message: "Refus essai" } }), {
          status: 403,
        }),
    );
    await userEvent.click(recu);
    expect((await screen.findByRole("alert")).textContent).toBe("Refus essai");
    expect(partages).toHaveLength(2);

    Object.assign(navigator, {
      share: async () => {
        throw new DOMException("fermé", "AbortError");
      },
    });
    vi.stubGlobal("fetch", async () => new Response("%PDF serveur"));
    await userEvent.click(recu);
    await waitFor(() => expect((recu as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    Reflect.deleteProperty(navigator, "canShare");
    Reflect.deleteProperty(navigator, "share");
  });
});
