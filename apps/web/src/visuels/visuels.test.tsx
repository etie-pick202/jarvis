import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LogoCocosab } from "./LogoCocosab.js";
import { LogoJarvis, MarqueJarvis } from "./LogoJarvis.js";
import { fichierOfficiel, nomDeFichier } from "./officiels.js";

const publicDir = join(__dirname, "..", "..", "public");

describe("logo JARVIS", () => {
  it("est décoratif sans titre et nommé avec un titre", () => {
    const { container, rerender } = render(<LogoJarvis />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    rerender(<LogoJarvis titre="JARVIS, l'assistant de gestion" />);
    expect(screen.getByRole("img", { name: "JARVIS, l'assistant de gestion" })).toBeTruthy();
  });

  it("donne des dégradés distincts à chaque instance (pas de collision d'identifiants)", () => {
    const { container } = render(
      <>
        <LogoJarvis />
        <LogoJarvis />
      </>,
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("la variante noire n'utilise aucun dégradé, l'étincelle animée suit l'orbite", () => {
    const { container } = render(<LogoJarvis variante="noir" animee />);
    expect(container.querySelectorAll("linearGradient")).toHaveLength(0);
    expect(container.querySelector("animateMotion")).toBeTruthy();
  });

  it("coupe l'animation quand l'utilisateur réduit les mouvements", () => {
    const origine = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const { container } = render(<LogoJarvis animee />);
    expect(container.querySelector("animateMotion")).toBeNull();
    window.matchMedia = origine;
  });

  it("la marque écrit le nom JARVIS à côté du logo", () => {
    render(<MarqueJarvis variante="noir" />);
    expect(screen.getByText("JARVIS")).toBeTruthy();
  });
});

describe("logo COCOSAB et fichiers officiels", () => {
  it("affiche la pastille COCOSAB tant qu'aucun fichier officiel n'est déposé", () => {
    render(<LogoCocosab taille="lg" sur="sombre" />);
    expect(screen.getByText("COCOSAB").className).toContain("logo-cocosab--sombre");
    expect(fichierOfficiel("cocosab")).toBeNull();
  });

  it("transforme un nom de marque en nom de fichier", () => {
    expect(nomDeFichier("MON GAZ")).toBe("mon-gaz");
    expect(nomDeFichier("Étoile d'Or")).toBe("etoile-d-or");
  });
});

describe("icônes de l'application", () => {
  const largeur = (png: string) => readFileSync(join(publicDir, png)).readUInt32BE(16);
  const hauteur = (png: string) => readFileSync(join(publicDir, png)).readUInt32BE(20);

  it("fournit toutes les tailles annoncées dans le manifeste et dans la page", () => {
    const attendues: [string, number][] = [
      ["favicon-32.png", 32],
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["icon-maskable-512.png", 512],
      ["apple-touch-icon.png", 180],
    ];
    for (const [fichier, taille] of attendues) {
      expect([largeur(fichier), hauteur(fichier)]).toEqual([taille, taille]);
    }
    for (const svg of ["icon.svg", "icon-maskable.svg"]) expect(existsSync(join(publicDir, svg))).toBe(true);
  });

  it("les SVG ont un titre (texte alternatif) et restent légers", () => {
    for (const svg of ["icon.svg", "icon-maskable.svg"]) {
      const texte = readFileSync(join(publicDir, svg), "utf8");
      expect(texte).toContain("<title>JARVIS</title>");
      expect(texte.length).toBeLessThan(3000);
    }
  });
});
