import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { LivreurMode } from "./LivreurMode.js";

const ui = () =>
  render(
    <I18nProvider initial="fr">
      <LivreurMode />
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const carte = (nom: RegExp) => within(screen.getByRole("article", { name: nom }));
const bouton = (zone: ReturnType<typeof within>, name: string) =>
  zone.getByRole("button", { name }) as HTMLButtonElement;

describe("mode livreur", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("livreur");
    await db.outbox.clear();
    // Lecture possible, envoi impossible : la tournée se travaille hors ligne.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("affiche client, adresse, montant, appel et position", async () => {
    ui();
    expect(await screen.findByRole("article", { name: /CMD0101/u })).toBeTruthy();
    const c = carte(/CMD0101/u);
    expect(c.getByRole("link", { name: /^Appeler/u }).getAttribute("href")).toBe("tel:237690000021");
    expect(c.getByRole("link", { name: "Voir sur la carte" }).getAttribute("href")).toContain("mlat=4.05");
    expect(bouton(c, "Livré").disabled).toBe(true);
  });

  it("parti puis livré : encaissement et vides confirmés, une seule opération par geste", async () => {
    ui();
    await screen.findByRole("article", { name: /CMD0101/u });
    const c = carte(/CMD0101/u);
    fireEvent.click(bouton(c, "Parti"));
    fireEvent.click(bouton(c, "Parti"));
    expect(await c.findByText("En route")).toBeTruthy();
    expect(await c.findByText("Action en attente d'envoi.")).toBeTruthy();
    await userEvent.click(bouton(c, "Livré"));
    const confirmer = () => bouton(c, "Confirmer la remise");
    expect(confirmer().disabled).toBe(true);
    await userEvent.click(c.getByRole("checkbox", { name: "J'ai encaissé le montant" }));
    expect(confirmer().disabled).toBe(true);
    await userEvent.click(c.getByRole("checkbox", { name: "Bouteilles vides récupérées" }));
    await userEvent.click(confirmer());
    await waitFor(async () => expect(await operations()).toHaveLength(2));
    const ops = await operations();
    expect(ops.map((o) => o.path.split("/").at(-1))).toEqual(["depart", "delivered"]);
    expect(ops[1]?.body).toEqual({ paymentMethod: "cash" });
    expect(c.getByText("Livré", { selector: ".chip, span" })).toBeTruthy();
  });

  it("un paiement mobile non confirmé se règle en espèces ; un problème demande une note", async () => {
    ui();
    await screen.findByRole("article", { name: /CMD0102/u });
    const c = carte(/CMD0102/u);
    expect(c.getByText(/à confirmer/u)).toBeTruthy();
    await userEvent.click(bouton(c, "Livré"));
    expect(c.getByText(/encaissez en espèces/u)).toBeTruthy();
    await userEvent.click(bouton(c, "Retour"));
    await userEvent.click(bouton(c, "Problème"));
    expect(bouton(c, "Signaler").disabled).toBe(true);
    await userEvent.type(c.getByLabelText("Que s'est-il passé ?"), "Client absent");
    await userEvent.click(bouton(c, "Signaler"));
    expect(await c.findByText("Client absent")).toBeTruthy();
    expect((await operations())[0]?.body).toEqual({ note: "Client absent" });
    expect(bouton(c, "Parti").disabled).toBe(false);
  });

  it("sans livraison, le dit", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]"));
    ui();
    expect(await screen.findByText("Aucune livraison aujourd'hui.")).toBeTruthy();
  });
});
