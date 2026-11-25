import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Livraison } from "../api/index.js";
import { I18nProvider } from "../i18n/index.js";
import { LivreurMode } from "./LivreurMode.js";

const liste: Livraison[] = [
  {
    id: "CMD-1",
    client: "Mme Ndongo",
    quartier: "Bastos",
    article: "Gaz OLA",
    montant: 7200,
    etat: "a_livrer",
  },
  {
    id: "CMD-2",
    client: "Mme Mbarga",
    quartier: "Melen",
    article: "Gaz TOTAL",
    montant: 7200,
    etat: "a_livrer",
  },
];

describe("mode livreur", () => {
  it("affiche la liste du jour avec trois boutons : Parti, Livré, Problème", async () => {
    render(
      <I18nProvider initial="fr">
        <LivreurMode source={async () => liste} />
      </I18nProvider>,
    );
    expect((await screen.findAllByRole("button", { name: "Parti" })).length).toBe(2);
    await userEvent.click((await screen.findAllByRole("button", { name: "Livré" }))[0] as HTMLElement);
    await userEvent.click((await screen.findAllByRole("button", { name: "Parti" }))[1] as HTMLElement);
    await userEvent.click((await screen.findAllByRole("button", { name: "Problème" }))[0] as HTMLElement);
    expect(screen.getByText("En route")).toBeTruthy();
    expect(screen.getByText("Problème signalé")).toBeTruthy();
  });

  it("indique qu'il n'y a pas de livraison quand la liste est vide ou indisponible", async () => {
    render(
      <I18nProvider initial="fr">
        <LivreurMode
          source={async () => {
            throw new Error("hors ligne");
          }}
        />
      </I18nProvider>,
    );
    expect(await screen.findByText("Aucune livraison aujourd'hui.")).toBeTruthy();
  });
});
