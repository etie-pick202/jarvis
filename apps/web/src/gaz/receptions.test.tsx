import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Inventaire } from "./Inventaire.js";
import { compresserPiece } from "./piece.js";
import { Receptions } from "./Receptions.js";

const ui = (node: React.ReactNode) => render(<I18nProvider initial="fr">{node}</I18nProvider>);

function reseauCoupe() {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Promise.reject(new TypeError("réseau"))
      : fakeApi(url.replace("/api/v1", ""), init),
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
    expect(op).toMatchObject({ syncType: "reception" });
    expect(op?.body).toMatchObject({
      supplierId: "00000000-0000-4000-8000-000000000801",
      lines: [
        { brandId: "00000000-0000-4000-8000-000000000101", fullReceived: 12, emptyReturned: 0, unitCost: 0 },
      ],
    });
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

  it("l'inventaire calcule l'écart, exige une justification et part pour validation du PDG", async () => {
    ui(<Inventaire />);
    await screen.findByLabelText(/^OLA : Pleines/u);
    const bouton = screen.getByRole("button", { name: "Envoyer pour validation" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    // Stock théorique de l'exemple : OLA 30/10, TRADEX 0/9, BOCOM 18/4, TOTAL 28/6, STARGAS 22/4.
    const pleines = [30, 0, 17, 28, 22];
    const vides = [10, 9, 4, 6, 4];
    for (const [i, marque] of ["OLA", "TRADEX", "BOCOM", "TOTAL", "STARGAS"].entries()) {
      await userEvent.type(
        screen.getByLabelText(new RegExp(`^${marque} : Pleines`, "u")),
        String(pleines[i]),
      );
      await userEvent.type(screen.getByLabelText(new RegExp(`^${marque} : Vides`, "u")), String(vides[i]));
    }
    expect(screen.getByText("-1 / 0")).toBeTruthy();
    expect(screen.getAllByText("Conforme")).toHaveLength(4);
    expect(bouton.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Justification de l'écart"), "Une bouteille prêtée");
    await userEvent.click(bouton);
    expect(await screen.findByText(/en attente de validation du PDG/u)).toBeTruthy();
    const [op] = await db.outbox.toArray();
    expect(op).toMatchObject({ path: "/inventory/weekly", syncType: "inventory_weekly" });
    expect(op?.body).toMatchObject({ justification: "Une bouteille prêtée" });
  });
});
