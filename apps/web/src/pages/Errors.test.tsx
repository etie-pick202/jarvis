import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/index.js";
import { ErrorBoundary, Forbidden } from "./Errors.js";

function Boom(): never {
  throw new Error("panne d'affichage");
}

describe("pages d'erreur", () => {
  it("l'ErrorBoundary remplace l'écran cassé par un message avec un bouton de rechargement", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <I18nProvider initial="fr">
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </I18nProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Un problème est survenu");
    expect(screen.getByRole("button", { name: "Recharger" })).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("la page Accès non autorisé propose le retour", () => {
    render(
      <I18nProvider initial="en">
        <MemoryRouter>
          <Forbidden />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole("link", { name: "Back to home" })).toBeTruthy();
  });
});
