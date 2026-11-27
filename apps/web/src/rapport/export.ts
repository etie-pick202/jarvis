import type { Rapport } from "../api/index.js";

const cellule = (v: string | number): string => {
  const texte = String(v);
  return /[;"\n]/u.test(texte) ? `"${texte.replace(/"/gu, '""')}"` : texte;
};

/** CSV pour Excel (séparateur « ; », BOM UTF-8) : repli prévu tant que le format Sage n'est pas confirmé. */
export function enCsv(rapport: Rapport): string {
  const lignes = [rapport.colonnes, ...rapport.lignes, ...(rapport.pied ? [rapport.pied] : [])];
  return `﻿${lignes.map((l) => l.map(cellule).join(";")).join("\r\n")}`;
}

/** Résumé texte pour un message WhatsApp ou un e-mail prérempli (sans API payante). */
export function enTexte(titre: string, rapport: Rapport): string {
  const lignes = [...rapport.lignes, ...(rapport.pied ? [rapport.pied] : [])];
  return [titre, ...lignes.map((l) => l.filter((c) => c !== "").join(" · "))].join("\n");
}

export const lienWhatsapp = (texte: string) => `https://wa.me/?text=${encodeURIComponent(texte)}`;
export const lienMail = (sujet: string, texte: string) =>
  `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`;

export function telecharger(nom: string, contenu: string | Blob, type: string): void {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([contenu], { type }));
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(lien.href);
}
