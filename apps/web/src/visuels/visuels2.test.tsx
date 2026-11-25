import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VOLETS } from "../nav/volets.js";
import { FormatBouteille, poidsDuFormat } from "./FormatBouteille.js";
import { IconeRubrique, rubriquesAvecIcone } from "./IconeRubrique.js";
import { EtatVide, type GenreIllustration, Illustration } from "./Illustration.js";
import { couleurDeMarque, MarqueGaz } from "./MarqueGaz.js";

/** Luminance relative WCAG d'une couleur #rrggbb. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a: string, b: string) => {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair ?? 0) + 0.05) / ((sombre ?? 0) + 0.05);
};

describe("pastilles des marques de gaz", () => {
  it("choisit toujours la même couleur pour une marque, quelle que soit la casse", () => {
    expect(couleurDeMarque("OLA")).toEqual(couleurDeMarque("ola"));
  });

  it("toutes les couleurs possibles respectent le contraste 4,5:1 du texte", () => {
    const vues = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { fond, texte } = couleurDeMarque(`MARQUE${i}`);
      vues.add(fond);
      expect(contraste(fond, texte)).toBeGreaterThanOrEqual(4.5);
    }
    expect(vues.size).toBeGreaterThan(4);
  });

  it("écrit le nom de la marque (accessible) à côté d'une flamme décorative", () => {
    const { container } = render(<MarqueGaz nom="TOTAL" compacte />);
    expect(screen.getByText("TOTAL").className).toContain("marque-gaz--compacte");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("utilise le fichier officiel déposé pour la marque, avec le nom écrit à côté", async () => {
    vi.resetModules();
    vi.doMock("./officiels.js", () => ({
      fichierOfficiel: (nom: string) => (nom === "marque-ola" ? "/officiels/ola.svg" : null),
      nomDeFichier: (t: string) => t.toLowerCase(),
    }));
    const { MarqueGaz: Remplacee } = await import("./MarqueGaz.js");
    const { container } = render(<Remplacee nom="OLA" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/officiels/ola.svg");
    expect(screen.getByText("OLA")).toBeTruthy();
    vi.doUnmock("./officiels.js");
  });
});

describe("formats de bouteille", () => {
  it("lit le poids du libellé, 12,5 kg par défaut", () => {
    expect(poidsDuFormat("6 kg")).toBe(6);
    expect(poidsDuFormat("12,5 kg")).toBe(12.5);
    expect(poidsDuFormat("grande")).toBe(12.5);
  });

  it("dessine une bouteille plus haute pour un format plus lourd", () => {
    const hauteur = (libelle: string) => {
      const { container } = render(<FormatBouteille libelle={libelle} />);
      return Number(container.querySelector("svg")?.getAttribute("height"));
    };
    expect(hauteur("35 kg")).toBeGreaterThan(hauteur("12,5 kg"));
    expect(hauteur("12,5 kg")).toBeGreaterThan(hauteur("6 kg"));
  });
});

describe("icônes des rubriques", () => {
  it("chaque rubrique de chaque volet a son icône", () => {
    const attendues = VOLETS.flatMap((v) => v.rubriques.map((r) => `${v.id}.${r.id}`));
    expect(attendues.filter((cle) => !rubriquesAvecIcone.includes(cle))).toEqual([]);
  });

  it("est décorative et retombe sur un point pour une rubrique inconnue", () => {
    const { container } = render(<IconeRubrique volet="x" rubrique="y" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M12 12h.01");
  });
});

describe("illustrations et états vides", () => {
  const genres: GenreIllustration[] = [
    "vide",
    "hors-ligne",
    "erreur",
    "introuvable",
    "interdit",
    "session",
    "conflit",
    "marque",
  ];

  it("dessine chaque état, de façon décorative", () => {
    for (const genre of genres) {
      const { container, unmount } = render(<Illustration genre={genre} />);
      expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      expect(container.querySelectorAll("g path, g ellipse").length).toBeGreaterThan(2);
      unmount();
    }
  });

  it("annonce l'état avec un titre, une explication et une action", () => {
    render(
      <EtatVide
        genre="hors-ligne"
        titre="Vous êtes hors ligne"
        texte="Reconnectez-vous."
        niveau={1}
        role="status"
      >
        <button type="button">Réessayer</button>
      </EtatVide>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Vous êtes hors ligne" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Reconnectez-vous.");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
});
