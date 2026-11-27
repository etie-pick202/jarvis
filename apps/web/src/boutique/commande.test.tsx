import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { fakeApi } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { Boutique } from "./Boutique.js";
import { type Coordonnees, expliquer, manque, referenceClient } from "./commande.js";
import { Suivi } from "./Suivi.js";

const ui = (chemin = "/boutique") =>
  render(
    <I18nProvider initial="fr">
      <MemoryRouter initialEntries={[chemin]}>
        <Routes>
          <Route path="boutique" element={<Boutique />} />
          <Route path="boutique/suivi/:jeton" element={<Suivi />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );

const envois: { url: string; corps: Record<string, unknown> }[] = [];
function serveur(refus?: () => Response | Promise<never>) {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") {
      envois.push({ url, corps: JSON.parse(String(init.body)) });
      if (refus) return Promise.resolve().then(refus);
    }
    return fakeApi(url.replace("/api/v1", ""), init);
  });
}

async function remplir() {
  await userEvent.click(await screen.findByRole("button", { name: "Une de plus : Gaz OLA 12,5 kg" }));
  await userEvent.type(screen.getByLabelText("Votre nom"), "Client Essai");
  await userEvent.type(screen.getByLabelText("Votre téléphone"), "690000033");
  await userEvent.type(screen.getByLabelText("Nom de votre quartier"), "Quartier Test");
}
const commander = () => screen.getByRole("button", { name: /^Commander pour/u }) as HTMLButtonElement;

describe("commande sans compte", () => {
  beforeEach(() => {
    localStorage.clear();
    envois.length = 0;
    serveur();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dit ce qui manque et classe les échecs", () => {
    const c: Coordonnees = {
      nom: "",
      telephone: "",
      mode: "delivery",
      quartierId: "",
      autreQuartier: "",
      repere: "",
      position: null,
      paiement: "momo",
      reference: "ab",
    };
    expect(manque(c)).toBe("commande.manque.nom");
    expect(manque({ ...c, nom: "A" })).toBe("commande.manque.telephone");
    expect(manque({ ...c, nom: "A", telephone: "690000000" })).toBe("commande.manque.quartier");
    expect(manque({ ...c, nom: "A", telephone: "690000000", mode: "pickup" })).toBe(
      "commande.manque.reference",
    );
    expect(manque({ ...c, nom: "A", telephone: "690000000", mode: "pickup", reference: "" })).toBeNull();
    expect(expliquer(new TypeError("x")).genre).toBe("reseau");
    expect(expliquer(new ApiError(503, "x")).genre).toBe("serveur");
    expect(expliquer(new ApiError(409, "Rupture : OLA", "out_of_stock")).genre).toBe("rupture");
    expect(referenceClient()).toBe(referenceClient());
  });

  it("commande une seule fois, vide le panier et ouvre le suivi", async () => {
    ui();
    await remplir();
    const bouton = commander();
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    expect(await screen.findByRole("heading", { name: "CMD0001" })).toBeTruthy();
    expect(envois).toHaveLength(1);
    expect(envois[0]?.corps).toMatchObject({
      mode: "delivery",
      neighbourhoodName: "Quartier Test",
      paymentMethod: "cash",
      lines: [{ kind: "gas", quantity: 1 }],
    });
    expect(screen.getByText("En attente de validation")).toBeTruthy();
    expect(localStorage.getItem("jarvis.boutique.panier")).toBe("{}");
    expect(localStorage.getItem("jarvis.boutique.suivi")).toBe("jeton-essai-0001");
  });

  it("garde la même référence après une panne réseau et explique les refus", async () => {
    serveur(() => Promise.reject(new TypeError("réseau")));
    ui();
    await remplir();
    await userEvent.click(commander());
    expect((await screen.findByRole("alert")).textContent).toContain("ne sera pas doublée");
    serveur(
      () =>
        new Response(JSON.stringify({ error: { code: "out_of_stock", message: "Rupture : OLA" } }), {
          status: 409,
        }),
    );
    await userEvent.click(commander());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Rupture : OLA"));
    expect(envois[1]?.corps.clientRef).toBe(envois[0]?.corps.clientRef);
  });

  it("envoie la référence mobile et la position, ou signale la position refusée", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: true, language: "fr", geolocation: undefined });
    ui();
    await remplir();
    await userEvent.click(screen.getByRole("button", { name: /Joindre ma position/u }));
    expect(screen.getByText(/Position indisponible/u)).toBeTruthy();
    Object.assign(navigator, {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 4.05, longitude: 9.7 } } as GeolocationPosition),
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /Joindre ma position/u }));
    expect(screen.getByText("Position jointe.")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "MoMo" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Référence du paiement mobile" }), "MOMO-123");
    await userEvent.click(commander());
    expect(await screen.findByText(/à confirmer par la boutique/u)).toBeTruthy();
    expect(envois[0]?.corps).toMatchObject({ latitude: 4.05, longitude: 9.7, paymentReference: "MOMO-123" });
    await userEvent.type(screen.getByRole("textbox", { name: "Référence du paiement mobile" }), "MOMO-456");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer la référence" }));
    expect(await screen.findByText(/Référence envoyée/u)).toBeTruthy();
  });

  it("un lien de suivi inconnu l'annonce sans casser la page", async () => {
    ui("/boutique/suivi/inconnu-00000");
    expect(await screen.findByText("Fonction pas encore disponible")).toBeTruthy();
  });
});
