import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { selonDestinataires } from "../shell/useBadges.js";
import { Notifications } from "./Notifications.js";

const ui = (profil: "pdg" | "gerant" = "pdg") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        <Notifications />
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.toArray();
const groupe = (name: string) => within(screen.getByRole("group", { name }));
const bouton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("destinataires des notifications", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("pdg");
    await db.outbox.clear();
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("le PDG change les profils et les adresses, puis enregistre", async () => {
    ui();
    await screen.findByText("direction@exemple.test");
    await userEvent.click(
      groupe("Rappels de réabonnement Canal+").getByRole("checkbox", { name: "Caissier" }),
    );
    await userEvent.click(groupe("Rapports journaliers").getByRole("checkbox", { name: "PDG" }));
    expect(screen.getByText("Personne ne sera prévenu.")).toBeTruthy();
    const champ = screen.getByLabelText("Nouvelle adresse e-mail");
    await userEvent.type(champ, "pas une adresse");
    expect(screen.getByRole("alert").textContent).toBe("Adresse e-mail invalide.");
    expect(bouton("Enregistrer").disabled).toBe(true);
    await userEvent.clear(champ);
    await userEvent.type(champ, "Direction@exemple.test");
    expect(screen.getByRole("alert").textContent).toBe("Cette adresse est déjà dans la liste.");
    await userEvent.clear(champ);
    await userEvent.type(champ, "compta@exemple.test{Enter}");
    expect(await operations()).toEqual([]);
    await userEvent.click(bouton("Retirer direction@exemple.test"));
    await userEvent.click(bouton("Enregistrer"));
    expect(await screen.findByText("Réglage enregistré.")).toBeTruthy();
    await waitFor(async () => expect(await operations()).toHaveLength(1));
    expect((await operations())[0]?.body).toEqual({
      reminders: ["pdg", "gerant", "caissier"],
      stockAlerts: ["pdg", "gerant"],
      reports: [],
      reportEmails: ["compta@exemple.test"],
    });
  });

  it("limite la liste à 10 adresses", async () => {
    ui();
    await screen.findByText("direction@exemple.test");
    for (let i = 0; i < 9; i++) {
      await userEvent.type(screen.getByLabelText("Nouvelle adresse e-mail"), `a${i}@exemple.test{Enter}`);
    }
    expect(screen.getByText("10 adresses au plus.")).toBeTruthy();
    expect(screen.queryByLabelText("Nouvelle adresse e-mail")).toBeNull();
  });

  it("le gérant consulte sans pouvoir modifier", async () => {
    setFakeUser("gerant");
    ui("gerant");
    await screen.findByText("direction@exemple.test");
    expect(screen.getByRole("group", { name: "Alertes de stock bas" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Seul le PDG peut modifier ces réglages.")).toBeTruthy();
  });

  it("réserve les pastilles aux profils choisis", () => {
    const badges = { commandes: 1, stockBas: 2, echeances: 3, validations: 4 };
    const reglage = { reminders: ["gerant" as const], stockAlerts: [], reports: [], reportEmails: [] };
    expect(selonDestinataires(badges, reglage, ["pdg"])).toEqual({ ...badges, stockBas: 0, echeances: 0 });
    expect(selonDestinataires(badges, reglage, ["gerant", "livreur"])).toEqual({ ...badges, stockBas: 0 });
    expect(selonDestinataires(badges, null, ["caissier"])).toEqual(badges);
  });
});
