import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, setFakeUser } from "../api/fake.js";
import { I18nProvider } from "../i18n/index.js";
import { RapportTable, SituationGaz } from "./Rapports.js";

describe("CSV des états affichés", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("pdg");
    URL.createObjectURL = vi.fn(() => "blob:essai");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("construit le fichier à partir de ce qui est à l'écran, sans nouvel appel", async () => {
    render(
      <I18nProvider initial="fr">
        <RapportTable id="x" titre="rub.rapport.x" />
        <SituationGaz />
      </I18nProvider>,
    );
    await screen.findAllByRole("table");
    for (const bouton of screen.getAllByRole("button", { name: "Exporter en CSV" })) {
      await userEvent.click(bouton);
    }
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
});
