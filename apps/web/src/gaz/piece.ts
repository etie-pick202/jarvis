const COTE_MAX = 1280;
const QUALITE = 0.7;

/**
 * Compresse une photo (côté le plus long : 1 280 px, JPEG qualité 0,7) pour tenir dans le stockage gratuit.
 * Les PDF et tout fichier que le navigateur ne sait pas décoder sont gardés tels quels.
 */
export async function compresserPiece(fichier: File): Promise<Blob> {
  if (!fichier.type.startsWith("image/") || typeof createImageBitmap !== "function") return fichier;
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const reduit = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALITE));
    return reduit && reduit.size < fichier.size ? reduit : fichier;
  } catch {
    return fichier;
  }
}
