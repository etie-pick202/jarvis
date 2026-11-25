const fichiers = import.meta.glob("./officiels/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Adresse du fichier officiel déposé dans `officiels/` (ex. `cocosab`, `marque-ola`), ou null s'il n'y en a pas. */
export function fichierOfficiel(nom: string): string | null {
  for (const [chemin, url] of Object.entries(fichiers)) {
    const fichier = chemin.split("/").pop() ?? "";
    if (fichier.slice(0, fichier.lastIndexOf(".")) === nom) return url;
  }
  return null;
}

/** « MON GAZ » devient `mon-gaz` : nom de fichier attendu après `marque-`. */
export function nomDeFichier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
