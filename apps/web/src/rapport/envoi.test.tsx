import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { PageExports } from "./PageExports.js";

const ui = (profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <MemoryRouter>
          <PageExports />
        </MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );

const bouton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const faux = (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init);

describe("envoi des rapports et comptes Sage", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    await db.outbox.clear();
    vi.stubGlobal("fetch", faux);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envoie les rapports choisis et réutilise la même clé après une coupure", async () => {
    const envois: { corps: unknown; cle: string }[] = [];
    let coupe = true;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return faux(url, init);
      envois.push({
        corps: JSON.parse(String(init.body)),
        cle: new Headers(init.headers).get("Idempotency-Key") ?? "",
      });
      if (coupe) throw new TypeError("réseau");
      return faux(url, init);
    });
    ui();
    await screen.findByText("Destinataires : direction@exemple.test");
    await userEvent.click(screen.getByRole("checkbox", { name: "X de caisse" }));
    await userEvent.click(bouton("Envoyer les rapports"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/connexion/u);
    coupe = false;
    await userEvent.click(bouton("Envoyer les rapports"));
    expect(await screen.findByText("Rapports envoyés à direction@exemple.test")).toBeTruthy();
    expect(envois[0]?.cle).toBe(envois[1]?.cle);
    expect(envois[1]?.corps).toMatchObject({ reports: ["sales", "cash", "x"], format: "pdf" });

    await userEvent.click(screen.getByRole("radio", { name: "CSV" }));
    expect((screen.getByRole("checkbox", { name: "X de caisse" }) as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(bouton("Envoyer les rapports"));
    await waitFor(() => expect(envois).toHaveLength(3));
    expect(envois[2]?.corps).toMatchObject({ reports: ["sales", "cash"], format: "csv" });
    expect(envois[2]?.cle).not.toBe(envois[1]?.cle);

    await userEvent.click(screen.getByRole("checkbox", { name: "Statistiques clients" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Journal de caisse" }));
    expect(bouton("Envoyer les rapports").disabled).toBe(true);
  });

  it("explique pourquoi l'envoi est impossible", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      url.endsWith("/documents/reports/email")
        ? new Response(JSON.stringify({ configured: true, recipients: [] }))
        : faux(url, init),
    );
    const vue = ui();
    expect(await screen.findByRole("link", { name: "Notifications" })).toBeTruthy();
    vue.unmount();
    localStorage.clear();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      url.endsWith("/documents/reports/email")
        ? new Response(JSON.stringify({ configured: false, recipients: [] }))
        : faux(url, init),
    );
    ui("gerant");
    expect(await screen.findByText(/n'est pas configuré/u)).toBeTruthy();
    expect(screen.queryByText("Comptes de l'export Sage")).toBeNull();
  });

  it("le PDG corrige un compte comptable", async () => {
    // Écriture sans réseau : le réglage attend dans la file d'envoi.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "PUT" ? Promise.reject(new TypeError("réseau")) : faux(url, init),
    );
    ui();
    const champ = await screen.findByLabelText("Dépenses");
    await userEvent.clear(champ);
    await userEvent.type(champ, "6");
    expect(screen.getByRole("alert").textContent).toBe("Numéro de compte invalide.");
    expect(bouton("Enregistrer").disabled).toBe(true);
    await userEvent.type(champ, "05100");
    const caisse = screen.getByLabelText("Canal+ espèces");
    await userEvent.clear(caisse);
    await userEvent.type(caisse, "571999");
    await userEvent.click(bouton("Enregistrer"));
    expect(await screen.findByText("Réglage enregistré.")).toBeTruthy();
    await waitFor(async () =>
      expect((await db.outbox.toArray())[0]?.body).toMatchObject({
        expenses: "605100",
        registers: { canal_cash: "571999" },
      }),
    );
  });
});
