import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { enCsv, enTexte, lienMail, lienWhatsapp, telecharger } from "../rapport/export.js";
import { Exports, RapportTable, SituationGaz } from "../rapport/Rapports.js";
import { Alertes, Audit, TableauDeBord, Validations } from "./Pilot.js";

function ui(node: React.ReactNode, profil: "pdg" | "gerant" = "pdg") {
  return render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil] }}>{node}</SessionProvider>
    </I18nProvider>,
  );
}

describe("CoCoPilot", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("le tableau de bord réunit chiffre d'affaires, caisses, stock, livraisons et alertes", async () => {
    ui(<TableauDeBord />);
    expect(await screen.findByText("108 800 FCFA")).toBeTruthy();
    expect(await screen.findByText("469 512 FCFA")).toBeTruthy();
    expect(await screen.findByText("98 / 33")).toBeTruthy();
    expect(await screen.findByText(/TRADEX en rupture/u)).toBeTruthy();
  });

  it("la page des alertes distingue l'urgent du à surveiller", async () => {
    ui(<Alertes page />);
    expect(await screen.findByRole("heading", { level: 1, name: "Alertes" })).toBeTruthy();
    expect(await screen.findByText("Urgent")).toBeTruthy();
    expect(screen.getAllByText("À surveiller").length).toBe(2);
  });

  it("le PDG valide : la ligne disparaît et la décision attend dans la file", async () => {
    ui(<Validations />);
    await screen.findByText(/Inventaire hebdomadaire : BOCOM/u);
    await userEvent.click(screen.getAllByRole("button", { name: "Valider" })[0] as HTMLElement);
    await vi.waitFor(() => expect(screen.queryByText(/Inventaire hebdomadaire : BOCOM/u)).toBeNull());
    expect((await db.outbox.toArray())[0]?.body).toMatchObject({ id: "v1", decision: "valide", motif: null });
  });

  it("le refus exige un motif", async () => {
    ui(<Validations />);
    await screen.findByText(/Vente 1991 annulée/u);
    await userEvent.click(screen.getAllByRole("button", { name: "Refuser" })[1] as HTMLElement);
    const zone = (screen.getByLabelText("Motif du refus").closest(".validation__refus") ??
      document.body) as HTMLElement;
    const bouton = within(zone).getByRole("button", { name: "Refuser" }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Motif du refus"), "Justificatif manquant");
    await userEvent.click(bouton);
    await vi.waitFor(async () =>
      expect((await db.outbox.toArray())[0]?.body).toMatchObject({
        id: "v2",
        decision: "refuse",
        motif: "Justificatif manquant",
      }),
    );
  });

  it("le gérant consulte les validations sans pouvoir les décider", async () => {
    ui(<Validations />, "gerant");
    expect(await screen.findByText(/Consultation seule/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Valider" })).toBeNull();
  });

  it("le journal d'audit liste les actions sensibles", async () => {
    ui(<Audit />);
    expect(await screen.findByText("Annulation de vente")).toBeTruthy();
    expect(screen.getByText("Changement de prix")).toBeTruthy();
  });
});

describe("CoCoRapport", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("pdg");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("affiche les statistiques clients avec la marge et le total", async () => {
    ui(<RapportTable id="clients" titre="rub.rapport.clients" />);
    expect(await screen.findByText("Fotso Marc")).toBeTruthy();
    expect(screen.getByText("-1 770")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href")).toContain(
      "wa.me",
    );
    expect(screen.getByRole("link", { name: "Envoyer par e-mail" }).getAttribute("href")).toContain(
      "mailto:",
    );
  });

  it("affiche la situation gaz du soir avec le total général", async () => {
    ui(<SituationGaz />);
    expect(await screen.findByText("Total général")).toBeTruthy();
    expect(screen.getByText("131")).toBeTruthy();
  });

  it("propose un export CSV par état et le télécharge", async () => {
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }),
    );
    ui(<Exports />);
    const boutons = await screen.findAllByRole("button", { name: /Exporter en CSV/u });
    expect(boutons).toHaveLength(3);
    await userEvent.click(boutons[0] as HTMLElement);
    expect(clic).toHaveBeenCalled();
    clic.mockRestore();
  });

  it("construit un CSV pour Excel avec BOM, point-virgule et guillemets", () => {
    const csv = enCsv({
      colonnes: ["Client", "Montant"],
      lignes: [['Dupont; "Jo"', 6800]],
      pied: ["Total", 6800],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Dupont; ""Jo"""');
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(enTexte("Rapport", { colonnes: ["a"], lignes: [["x", 1]] })).toBe("Rapport\nx · 1");
    expect(lienWhatsapp("a b")).toBe("https://wa.me/?text=a%20b");
    expect(lienMail("S", "c")).toBe("mailto:?subject=S&body=c");
    expect(typeof telecharger).toBe("function");
  });
});
