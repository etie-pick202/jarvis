import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { SessionProvider } from "../auth/SessionProvider.js";
import { Abonnes } from "../canal/Abonnes.js";
import { Fournisseurs } from "../gaz/Fournisseurs.js";
import { I18nProvider } from "../i18n/index.js";
import { Articles } from "../market/Articles.js";
import { ChampFichier } from "./ChampFichier.js";

const ui = (node: React.ReactNode) =>
  render(
    <I18nProvider initial="fr">
      <SessionProvider initial={{ userId: "u", nom: "x", profils: ["gerant"], profilActif: "gerant" }}>
        {node}
      </SessionProvider>
    </I18nProvider>,
  );

function Essai() {
  const [fichier, setFichier] = useState<File | null>(null);
  return (
    <>
      <ChampFichier label="Bon" accept="application/pdf" fichier={fichier} onChoisir={setFichier} />
      <button type="button" onClick={() => setFichier(null)}>
        vider
      </button>
    </>
  );
}

describe("choix d'un fichier et fiche à côté de la liste", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("gerant");
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      fakeApi(url.replace("/api/v1", ""), init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("montre le bouton traduit et le nom du fichier, puis vide le champ", async () => {
    ui(<Essai />);
    expect(screen.getByText("Choisir un fichier")).toBeTruthy();
    expect(screen.getByText("Aucun fichier choisi")).toBeTruthy();
    const champ = screen.getByLabelText("Bon") as HTMLInputElement;
    await userEvent.upload(champ, new File(["x"], "bon.pdf", { type: "application/pdf" }));
    expect(screen.getByText("bon.pdf")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "vider" }));
    expect(screen.getByText("Aucun fichier choisi")).toBeTruthy();
    expect(champ.value).toBe("");
  });

  it("conduit à la fiche fournisseur depuis le titre", async () => {
    ui(<Fournisseurs />);
    await userEvent.click(screen.getByRole("button", { name: "Nouveau fournisseur" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Nom"));
  });

  it("conduit à la fiche abonné depuis le titre", async () => {
    ui(<Abonnes />);
    await userEvent.click(screen.getByRole("button", { name: "Nouvel abonné" }));
    const [nom] = screen.getAllByLabelText("Nom");
    expect(document.activeElement).toBe(nom);
  });

  it("conduit à la fiche article depuis le titre et depuis « Modifier »", async () => {
    ui(<Articles />);
    await userEvent.click(screen.getByRole("button", { name: "Nouvel article" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Article"));
    const [modifier] = await screen.findAllByRole("button", { name: /^Modifier /u });
    if (!modifier) throw new Error("aucun article");
    await userEvent.click(modifier);
    const champ = screen.getByLabelText("Article") as HTMLInputElement;
    expect(champ.value).not.toBe("");
    expect(document.activeElement).toBe(champ);
  });
});
