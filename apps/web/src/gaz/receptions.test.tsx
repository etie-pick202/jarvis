import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { sendOperation } from "../offline/sync.js";
import { Inventaire } from "./Inventaire.js";
import { compresserPiece } from "./piece.js";
import { Receptions } from "./Receptions.js";

const ui = (node: React.ReactNode) => render(<I18nProvider initial="fr">{node}</I18nProvider>);

function reseauCoupe() {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Promise.reject(new TypeError("réseau"))
      : fakeApi(url.replace("/api", ""), init),
  );
}

describe("réceptions et inventaire", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    await db.pieces.clear();
    reseauCoupe();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuse l'enregistrement sans pièce justificative", async () => {
    ui(<Receptions />);
    await screen.findByRole("option", { name: "Dépôt Central" });
    await userEvent.selectOptions(screen.getByLabelText("Fournisseur"), "Dépôt Central");
    await userEvent.type(screen.getAllByLabelText("Pleines reçues")[0] as HTMLElement, "12");
    const bouton = screen.getByRole("button", { name: "Enregistrer la réception" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(screen.getByText(/Sans pièce/u)).toBeTruthy();
    await userEvent.upload(
      screen.getByLabelText("Pièce justificative (photo ou PDF)"),
      new File(["%PDF"], "bon.pdf", { type: "application/pdf" }),
    );
    expect(bouton.disabled).toBe(false);
  });

  it("garde la pièce sur l'appareil hors ligne et la réception reste en attente d'envoi de la pièce", async () => {
    ui(<Receptions />);
    await screen.findByRole("option", { name: "Dépôt Central" });
    await userEvent.selectOptions(screen.getByLabelText("Fournisseur"), "Dépôt Central");
    await userEvent.type(screen.getAllByLabelText("Pleines reçues")[0] as HTMLElement, "12");
    await userEvent.upload(
      screen.getByLabelText("Pièce justificative (photo ou PDF)"),
      new File(["%PDF"], "bon.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer la réception" }));

    expect(await screen.findByText("En attente d'envoi de la pièce")).toBeTruthy();
    const [op] = await db.outbox.toArray();
    expect(op?.path).toBe("/receptions");
    expect(op?.pieceId).toBeTruthy();
    expect((await db.pieces.toArray())[0]?.nom).toBe("bon.pdf");
    expect(op?.body).toMatchObject({ lignes: [{ marque: "OLA", pleines: 12, vides: 0, prixAchat: 0 }] });
  });

  it("envoie les données et la pièce en un seul envoi, puis libère la pièce", async () => {
    await db.pieces.add({ id: "p1", nom: "bon.pdf", blob: new Blob(["%PDF"]) });
    const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    // jsdom et fake-indexeddb ne partagent pas la même classe Blob : on neutralise seulement l'ajout du fichier.
    vi.spyOn(FormData.prototype, "append").mockImplementation(() => undefined);
    const resultat = await sendOperation({
      id: "o1",
      method: "POST",
      path: "/receptions",
      body: { a: 1 },
      idempotencyKey: "cle-9",
      label: "Réception",
      createdAt: 1,
      status: "pending",
      attempts: 0,
      pieceId: "p1",
    });
    expect(resultat.kind).toBe("ok");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("cle-9");
    expect(await db.pieces.get("p1")).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("refuse l'envoi si la pièce a disparu de l'appareil (jamais d'enregistrement sans justificatif)", async () => {
    const resultat = await sendOperation({
      id: "o2",
      method: "POST",
      path: "/receptions",
      body: {},
      idempotencyKey: "k",
      label: "Réception",
      createdAt: 1,
      status: "pending",
      attempts: 0,
      pieceId: "absente",
    });
    expect(resultat.kind).toBe("rejected");
  });

  it("garde tel quel un PDF ou un fichier illisible", async () => {
    const pdf = new File(["%PDF"], "bon.pdf", { type: "application/pdf" });
    expect(await compresserPiece(pdf)).toBe(pdf);
    const image = new File(["pas une image"], "photo.jpg", { type: "image/jpeg" });
    expect(await compresserPiece(image)).toBe(image);
  });

  it("compresse une photo trop grande", async () => {
    const gros = new File([new Uint8Array(4000)], "photo.jpg", { type: "image/jpeg" });
    const reduit = new Blob([new Uint8Array(500)]);
    vi.stubGlobal("createImageBitmap", async () => ({ width: 4000, height: 3000, close: () => undefined }));
    const contexte = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(contexte as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(reduit));
    expect(await compresserPiece(gros)).toBe(reduit);
    vi.restoreAllMocks();
  });

  it("l'inventaire calcule l'écart et part pour validation du PDG", async () => {
    ui(<Inventaire />);
    const champs = await screen.findAllByRole("textbox");
    expect(champs.length).toBe(10);
    const bouton = screen.getByRole("button", { name: "Envoyer pour validation" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    // Stock théorique de l'exemple : OLA 30/10, TRADEX 0/9, BOCOM 18/4, TOTAL 28/6, STARGAS 22/4.
    const comptes = ["30", "10", "0", "9", "17", "4", "28", "6", "22", "4"];
    for (const [i, valeur] of comptes.entries()) await userEvent.type(champs[i] as HTMLElement, valeur);
    expect(screen.getByText("-1 / 0")).toBeTruthy();
    expect(screen.getAllByText("Conforme").length).toBe(4);
    await userEvent.click(bouton);
    expect(await screen.findByText(/en attente de validation du PDG/u)).toBeTruthy();
    expect((await db.outbox.toArray())[0]?.path).toBe("/gaz/inventaires");
  });
});
