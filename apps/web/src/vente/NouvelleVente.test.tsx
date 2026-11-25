import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { NouvelleVente } from "./NouvelleVente.js";

function ui() {
  return render(
    <I18nProvider initial="fr">
      <NouvelleVente />
    </I18nProvider>,
  );
}

const suivant = () => userEvent.click(screen.getByRole("button", { name: "Suivant" }));

describe("nouvelle vente", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    // Lecture possible mais envoi impossible : la vente attend dans la file.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("enregistre une vente de gaz en trois écrans et propose le reçu", async () => {
    ui();
    await userEvent.click(await screen.findByRole("radio", { name: /OLA/u }));
    await userEvent.type(screen.getByLabelText(/Nom du client/u), "ndo");
    await userEvent.click(await screen.findByRole("button", { name: "Ndongo Berthe" }));
    await suivant();
    expect(screen.getByText("Étape 2 / 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Livraison" }));
    await suivant();
    expect(screen.getByText("Étape 3 / 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "MoMo" }));
    await userEvent.click(screen.getByRole("button", { name: "Encaisser 7 200 FCFA" }));

    expect(await screen.findByRole("heading", { name: "Reçu" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href")).toContain(
      "https://wa.me/237600000001?text=",
    );
    expect(screen.getByRole("button", { name: "Partager en PDF" })).toBeTruthy();
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ path: "/sales", syncType: "sale" });
    expect(ops[0]?.body).toEqual({
      customerName: "Ndongo Berthe",
      paymentMethod: "momo",
      deliveryFeePerBottle: 400,
      lines: [
        {
          kind: "gas",
          brandId: "00000000-0000-4000-8000-000000000101",
          formatId: "00000000-0000-4000-8000-000000000201",
          quantity: 1,
        },
      ],
    });
  });

  it("refuse un article à stock nul", async () => {
    ui();
    const tradex = await screen.findByRole("radio", { name: /TRADEX/u });
    expect((tradex as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText("Indisponible").length).toBeGreaterThan(0);
  });

  it("exige le nom du client pour le gaz mais pas pour les autres articles", async () => {
    ui();
    await userEvent.click(await screen.findByRole("radio", { name: /OLA/u }));
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: /Détendeur/u }));
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("annonce l'écart d'emballage d'un échange entre marques", async () => {
    ui();
    await userEvent.click(await screen.findByRole("radio", { name: /STARGAS/u }));
    await userEvent.type(screen.getByLabelText(/Nom du client/u), "Nouveau Client");
    await userEvent.click(screen.getByRole("checkbox", { name: "Échange de bouteille vide" }));
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText("Marque de la bouteille rapportée"), "TOTAL");
    expect(screen.getByRole("status").textContent).toContain("Perte d'emballage : 2 500 FCFA");
  });

  it("bloque la quantité au-delà du stock", async () => {
    ui();
    await userEvent.click(await screen.findByRole("radio", { name: /Détendeur/u }));
    await suivant();
    for (let i = 0; i < 6; i++) await userEvent.click(screen.getByRole("button", { name: "Une de plus" }));
    expect(screen.getByRole("alert").textContent).toContain("stock disponible 6");
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Une de moins" }));
    expect((screen.getByRole("button", { name: "Suivant" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("consomme le stock local pour refuser la vente suivante hors ligne", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    localStorage.setItem(
      "jarvis.catalogue",
      JSON.stringify([{ id: "d", nom: "Détendeur", genre: "autre", prix: 4500, stock: 1 }]),
    );
    ui();
    await userEvent.click(await screen.findByRole("radio", { name: /Détendeur/u }));
    await suivant();
    await suivant();
    await userEvent.click(screen.getByRole("button", { name: /Encaisser/u }));
    await userEvent.click(await screen.findByRole("button", { name: "Nouvelle vente" }));
    const radio = await screen.findByRole("radio", { name: /Détendeur/u });
    expect((radio as HTMLInputElement).disabled).toBe(true);
  });
});
