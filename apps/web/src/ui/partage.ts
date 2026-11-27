import { telecharger } from "../rapport/export.js";

/** Feuille de partage du téléphone quand elle accepte les fichiers, téléchargement sinon. */
export async function partagerFichier(nom: string, contenu: BlobPart, titre: string): Promise<void> {
  const fichier = new File([contenu], nom, { type: "application/pdf" });
  if (!navigator.canShare?.({ files: [fichier] })) return telecharger(nom, fichier, fichier.type);
  try {
    await navigator.share({ files: [fichier], title: titre });
  } catch (e) {
    // Refermer la feuille de partage n'est pas une panne.
    if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
  }
}
