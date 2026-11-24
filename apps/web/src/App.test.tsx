import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import { I18nProvider } from "./i18n/index.js";

function renderAt(path: string) {
  return render(
    <I18nProvider initial="fr">
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("App", () => {
  beforeEach(() => localStorage.clear());

  it("redirige l'accueil vers la première rubrique", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "CoCoPilot" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Tableau de bord" })).toBeTruthy();
  });

  it("affiche une page introuvable pour une route inconnue", () => {
    renderAt("/inconnu/rien");
    expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeTruthy();
  });

  it("change de langue depuis l'écran et garde le choix", async () => {
    renderAt("/vente/nouvelle");
    await userEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 2, name: "New sale" })).toBeTruthy();
    expect(localStorage.getItem("jarvis.lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
