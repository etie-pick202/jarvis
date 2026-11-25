/**
 * Génère les icônes de l'application (favicon, installation PWA, maskable, Apple touch) à partir du logo JARVIS.
 *   pnpm --filter @jarvis/web icones
 * Les SVG sont écrits tels quels ; les PNG sont rendus avec Playwright (Chromium, ou PW_CHANNEL=msedge en local).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(publicDir, { recursive: true });

const defs = `<defs>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF1A8"/><stop offset=".5" stop-color="#FFC20E"/><stop offset="1" stop-color="#A86F00"/></linearGradient>
<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="32" y1="24" x2="64" y2="80"><stop offset="0" stop-color="#FFE27A"/><stop offset=".5" stop-color="#FFC20E"/><stop offset="1" stop-color="#E69500"/></linearGradient>
<linearGradient id="o" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFC20E" stop-opacity=".25"/><stop offset=".5" stop-color="#FFF1A8"/><stop offset="1" stop-color="#FFC20E"/></linearGradient>
</defs>`;

const orbite = (angle, bas, largeur, opacite) =>
  `<g transform="rotate(${angle} 50 50)"><path d="M6 50 A45 15.5 0 0 ${bas} 94 50" fill="none" stroke="url(#o)" stroke-width="${largeur}" stroke-linecap="round" opacity="${opacite}"/></g>`;

/** Le logo au centre d'une grille de 100 x 100, réduit à `echelle` (marge de sécurité pour les icônes masquables). */
const logo = (echelle) =>
  `<g transform="translate(50 50) scale(${echelle}) translate(-50 -50)">${orbite(-30, 1, 2, 0.55)}${orbite(30, 1, 2, 0.55)}<path d="M34 25 H68 M59 25 V57 Q59 77 43 77 Q31 77 27 66" fill="none" stroke="url(#f)" stroke-width="13" stroke-linejoin="round"/>${orbite(-30, 0, 2.6, 1)}<circle cx="94" cy="50" r="3.4" fill="#fff" transform="rotate(-30 50 50)"/>${orbite(30, 0, 2.6, 0.8)}</g>`;

const svg = (corps, titre) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${titre}"><title>${titre}</title>${defs}${corps}</svg>`;

/** Carré noir au liseré doré, coins arrondis : onglet du navigateur et icône « any ». */
const rond = svg(
  `<rect x="2" y="2" width="96" height="96" rx="24" fill="#0E0E0E" stroke="url(#r)" stroke-width="2.4"/>${logo(0.78)}`,
  "JARVIS",
);
/** Plein cadre : l'appareil applique son propre masque, le logo reste dans les 80 % centraux. */
const pleinCadre = svg(`<rect width="100" height="100" fill="#0E0E0E"/>${logo(0.62)}`, "JARVIS");

const sorties = [
  ["icon.svg", rond],
  ["icon-maskable.svg", pleinCadre],
];
for (const [nom, contenu] of sorties) writeFileSync(join(publicDir, nom), contenu);

const pngs = [
  ["favicon-32.png", rond, 32, true],
  ["icon-192.png", rond, 192, true],
  ["icon-512.png", rond, 512, true],
  ["icon-maskable-512.png", pleinCadre, 512, false],
  ["apple-touch-icon.png", pleinCadre, 180, false],
];

const navigateur = await chromium.launch({ channel: process.env.PW_CHANNEL });
const page = await navigateur.newPage();
for (const [nom, contenu, taille, transparent] of pngs) {
  await page.setViewportSize({ width: taille, height: taille });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${taille}px;height:${taille}px}</style>${contenu}`,
  );
  await page.screenshot({ path: join(publicDir, nom), omitBackground: transparent });
}
await navigateur.close();
console.log(`${sorties.length + pngs.length} icônes écrites dans ${publicDir}`);
