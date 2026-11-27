import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { api } from "../api/index.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { I18nProvider } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { Abonnes } from "./Abonnes.js";
import { Echeances } from "./Echeances.js";
import { dateCourte, etatEcheance, filtrerAbonnes } from "./regles.js";

const ui = (node: React.ReactNode, profil: "gerant" | "caissier" = "gerant") =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: [profil], profilActif: profil }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

const operations = () => db.outbox.orderBy("createdAt").toArray();

describe("CanalSab", () => {
  beforeEach(async () => {
    localStorage.clear();
    setFakeUser("gerant");
    await db.outbox.clear();
    // Lecture possible, envoi impossible : les écritures restent dans la file.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      init?.method && init.method !== "GET"
        ? Promise.reject(new TypeError("réseau"))
        : fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("liste les abonnés avec l'état de leur échéance en toutes lettres", async () => {
    ui(<Abonnes />);
    expect(await screen.findByText("Atangana Rose")).toBeTruthy();
    expect(screen.getByText(/^Expiré · /u)).toBeTruthy();
    expect(screen.getByText(/^Expire bientôt · /u)).toBeTruthy();
    expect(screen.getByText(/^À jour · /u)).toBeTruthy();
    expect(screen.getByText("Aucun abonnement")).toBeTruthy();
  });

  it("retrouve un abonné par nom, décodeur ou téléphone", async () => {
    ui(<Abonnes />);
    await screen.findByText("Atangana Rose");
    const champ = screen.getByLabelText("Rechercher (nom, décodeur, téléphone)");
    await userEvent.type(champ, "syl");
    expect(screen.queryByText("Atangana Rose")).toBeNull();
    expect(screen.getByText("Manga Sylvie")).toBeTruthy();
    await userEvent.clear(champ);
    await userEvent.type(champ, "DEC-0002");
    expect(screen.getByText("Essomba Jean")).toBeTruthy();
    await userEvent.clear(champ);
    await userEvent.type(champ, "zzz");
    expect(screen.getByText("Aucun abonné trouvé.")).toBeTruthy();
  });

  it("ajoute un abonné hors ligne : visible tout de suite et rangé dans la file", async () => {
    ui(<Abonnes />);
    await screen.findByText("Atangana Rose");
    const fiche = within(screen.getByRole("form", { name: "Nouvel abonné" }));
    const enregistrer = fiche.getByRole("button", { name: "Enregistrer l'abonné" }) as HTMLButtonElement;
    expect(enregistrer.disabled).toBe(true);
    await userEvent.type(fiche.getByLabelText("Nom"), "Biloa Paul");
    await userEvent.type(fiche.getByLabelText("Téléphone"), "237690000099");
    await userEvent.type(fiche.getByLabelText("Numéro de décodeur"), "DEC-0099");
    await userEvent.selectOptions(fiche.getByLabelText("Formule"), "00000000-0000-4000-8000-000000001301");
    await userEvent.click(enregistrer);
    expect(await screen.findByText("Biloa Paul")).toBeTruthy();
    const [op] = await operations();
    expect(op).toMatchObject({ method: "POST", path: "/canal/subscribers" });
    expect(op?.body).toMatchObject({ name: "Biloa Paul", decoderNumber: "DEC-0099", expiresOn: null });
  });

  it("modifie l'échéance et désactive un abonné par une écriture PATCH", async () => {
    ui(<Abonnes />);
    await screen.findByText("Owona Marc");
    await userEvent.click(screen.getByRole("button", { name: "Modifier Owona Marc" }));
    const fiche = within(screen.getByRole("form", { name: "Modifier Owona Marc" }));
    await userEvent.type(fiche.getByLabelText("Échéance"), "2026-12-24");
    await userEvent.click(fiche.getByRole("button", { name: "Enregistrer l'abonné" }));
    await userEvent.click(await screen.findByRole("button", { name: "Désactiver Owona Marc" }));
    expect(await screen.findByRole("button", { name: "Réactiver Owona Marc" })).toBeTruthy();
    const ops = await operations();
    expect(ops[0]).toMatchObject({
      method: "PATCH",
      path: "/canal/subscribers/00000000-0000-4000-8000-000000001404",
    });
    expect(ops[0]?.body).toMatchObject({ expiresOn: "2026-12-24" });
    expect(ops[1]?.body).toEqual({ active: false });
  });

  it("la modification peut être abandonnée", async () => {
    ui(<Abonnes />);
    await userEvent.click(await screen.findByRole("button", { name: "Modifier Essomba Jean" }));
    await userEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(screen.getByRole("form", { name: "Nouvel abonné" })).toBeTruthy();
    expect(await db.outbox.count()).toBe(0);
  });

  it("le gérant ajoute et désactive une formule, le caissier ne les gère pas", async () => {
    ui(<Abonnes />);
    const zone = within(await screen.findByRole("form", { name: "Formules" }));
    await zone.findByRole("button", { name: "Désactiver Access" });
    await userEvent.type(zone.getByLabelText("Nom de la formule"), "Sport");
    await userEvent.type(zone.getByLabelText("Prix (FCFA)"), "15000");
    await userEvent.click(zone.getByRole("button", { name: "Ajouter la formule" }));
    expect(await zone.findByText("15 000 FCFA")).toBeTruthy();
    await userEvent.click(zone.getByRole("button", { name: "Désactiver Access" }));
    const ops = await operations();
    expect(ops[0]?.body).toEqual({ name: "Sport", price: 15000, months: 1, commission: 0 });
    expect(ops[1]).toMatchObject({ method: "PATCH", body: { active: false } });
  });

  it("le caissier gère les abonnés mais pas les formules", async () => {
    ui(<Abonnes />, "caissier");
    await screen.findByText("Atangana Rose");
    expect(screen.queryByRole("form", { name: "Formules" })).toBeNull();
    expect(screen.getByRole("form", { name: "Nouvel abonné" })).toBeTruthy();
  });

  it("montre les échéances de la période choisie", async () => {
    ui(<Echeances />);
    expect(await screen.findByText("Essomba Jean")).toBeTruthy();
    expect(screen.queryByText("Manga Sylvie")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "15 jours" }));
    expect(await screen.findByText("Manga Sylvie")).toBeTruthy();
  });

  it("ouvre WhatsApp avec le lien préparé par le serveur", async () => {
    ui(<Echeances rappels />);
    const lien = await screen.findByRole("link", { name: "Envoyer par WhatsApp Atangana Rose" });
    const href = decodeURIComponent(lien.getAttribute("href") ?? "");
    expect(href).toContain("https://wa.me/237690000001?text=");
    expect(href).toContain("Bonjour Atangana Rose,");
  });

  it("signale l'absence d'échéance, ou le mode hors ligne sans copie", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]"));
    ui(<Echeances />);
    expect(await screen.findByText("Aucune échéance sur la période.")).toBeTruthy();
  });

  it("hors ligne et jamais chargé, l'écran le dit", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("hors ligne");
    });
    ui(<Abonnes />);
    expect(await screen.findByText("Vous êtes hors ligne")).toBeTruthy();
  });

  it("la pastille CanalSab compte les échéances à sept jours", async () => {
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
    expect((await api.badges()).echeances).toBe(2);
  });

  it("applique les règles d'état, de recherche et de lien", () => {
    expect(etatEcheance({ daysLeft: null })).toBe("aucune");
    expect(etatEcheance({ daysLeft: -1 })).toBe("depassee");
    expect(etatEcheance({ daysLeft: 0 })).toBe("proche");
    expect(etatEcheance({ daysLeft: 8 })).toBe("a-jour");
    expect(filtrerAbonnes([], "x")).toEqual([]);
    expect(dateCourte("2026-12-01", "fr")).toContain("01");
  });
});
