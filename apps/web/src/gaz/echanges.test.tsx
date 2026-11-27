import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { Echanges } from "./Echanges.js";

const ui = (profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <Echanges />
      </SessionProvider>
    </I18nProvider>,
  );

const envois: unknown[] = [];
function serveur(reponse: () => Response = () => new Response("{}", { status: 200 })) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      envois.push(JSON.parse(String(init.body)));
      return reponse();
    }
    return fakeApi(url.replace("/api/v1", ""), init);
  });
}

describe("écarts d'échange", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("pdg");
    envois.length = 0;
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("annonce les écarts à régulariser et les isole", async () => {
    ui();
    expect(await screen.findByText("Écarts à régulariser : 1")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    await userEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
  });

  it("le PDG solde : calcul par le serveur, refus expliqué, puis montant saisi", async () => {
    serveur(
      () =>
        new Response(
          JSON.stringify({ error: { code: "conflict", message: "Valeur d'emballage encore inconnue" } }),
          { status: 409 },
        ),
    );
    ui();
    await userEvent.click(await screen.findByRole("button", { name: "Solder Biyik Claire" }));
    const valider = screen.getByRole("button", { name: "Solder l'écart" });
    fireEvent.click(valider);
    fireEvent.click(valider);
    expect((await screen.findByRole("alert")).textContent).toBe("Valeur d'emballage encore inconnue");
    expect(envois).toEqual([{}]);
    const champ = screen.getByLabelText("Montant de l'écart (facultatif)");
    await userEvent.type(champ, "1,5");
    expect(screen.getByText(/Montant invalide/u)).toBeTruthy();
    await userEvent.clear(champ);
    await userEvent.type(champ, "-1200");
    serveur(() => new Response("{}", { status: 500 }));
    await userEvent.click(screen.getByRole("button", { name: "Solder l'écart" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("réessayez"));
    serveur();
    await userEvent.click(screen.getByRole("button", { name: "Solder l'écart" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Solder l'écart" })).toBeNull());
    expect(envois.at(-1)).toEqual({ packagingGap: -1200 });
  });

  it("le gérant voit les écarts sans pouvoir les solder", async () => {
    ui("gerant");
    expect(await screen.findByText("Biyik Claire")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Solder/u })).toBeNull();
  });
});
