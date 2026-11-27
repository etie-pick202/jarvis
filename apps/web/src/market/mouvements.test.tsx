import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { MouvementsArticles } from "./Mouvements.js";

const ui = (profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <MouvementsArticles />
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();
const fiche = (nom: string) => within(screen.getByRole("form", { name: nom }));

describe("mouvements des articles", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    await db.pieces.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("montre le journal et ajuste avec justification, sans stock négatif", async () => {
    ui();
    expect(await screen.findByRole("rowheader", { name: /Réception d'exemple/u })).toBeTruthy();
    const a = fiche("Ajuster le stock");
    const valider = a.getByRole("button", { name: "Enregistrer l'ajustement" }) as HTMLButtonElement;
    await userEvent.type(a.getByLabelText(/^Variation/u), "-999");
    expect(a.getByText("Le stock ne peut pas devenir négatif.")).toBeTruthy();
    await userEvent.clear(a.getByLabelText(/^Variation/u));
    await userEvent.type(a.getByLabelText(/^Variation/u), "-2");
    expect(valider.disabled).toBe(true);
    await userEvent.type(a.getByLabelText("Justification de l'ajustement"), "casse au comptoir");
    fireEvent.click(valider);
    fireEvent.click(valider);
    expect(await a.findByText("Mouvement enregistré.")).toBeTruthy();
    expect(await operations()).toHaveLength(1);
    expect((await operations())[0]?.body).toEqual({ delta: -2, justification: "casse au comptoir" });
  });

  it("réapprovisionne seulement avec la pièce, gardée jusqu'à l'envoi", async () => {
    ui();
    await screen.findByRole("form", { name: "Réapprovisionner" });
    const r = fiche("Réapprovisionner");
    const valider = () =>
      r.getByRole("button", { name: "Enregistrer la réception de l'article" }) as HTMLButtonElement;
    await userEvent.type(r.getByLabelText("Quantité reçue"), "5");
    await userEvent.type(r.getByLabelText("Coût unitaire (facultatif)"), "3000");
    expect(valider().disabled).toBe(true);
    await userEvent.upload(
      r.getByLabelText(/Pièce justificative/u),
      new File(["%PDF-1.4"], "bon.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(valider());
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    const op = (await operations())[0];
    expect(op?.body).toEqual({ quantity: 5, unitCost: 3000 });
    expect(op?.pieceId).toBeTruthy();
    expect(await db.pieces.count()).toBe(1);
  });

  it("le caissier consulte le journal sans agir", async () => {
    ui("caissier");
    expect(await screen.findByRole("rowheader", { name: /TK1993/u })).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
