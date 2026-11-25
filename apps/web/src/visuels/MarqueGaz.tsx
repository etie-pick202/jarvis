import { fichierOfficiel, nomDeFichier } from "./officiels.js";

/**
 * Pastilles de remplacement des marques de gaz : une couleur et le nom, choisis de façon stable d'après le nom.
 * Toutes les paires respectent le contraste 4,5:1. Quand COCOSAB fournit le fichier officiel d'une marque
 * (`src/visuels/officiels/marque-<nom>.svg`), il remplace automatiquement la pastille colorée.
 */
const PALETTE = [
  { fond: "#111111", texte: "#ffc20e" },
  { fond: "#ffc20e", texte: "#111111" },
  { fond: "#17703f", texte: "#ffffff" },
  { fond: "#1d4e89", texte: "#ffffff" },
  { fond: "#a8201a", texte: "#ffffff" },
  { fond: "#9a4a00", texte: "#ffffff" },
  { fond: "#5f3b8c", texte: "#ffffff" },
  { fond: "#0f6b73", texte: "#ffffff" },
] as const;

export function couleurDeMarque(nom: string): (typeof PALETTE)[number] {
  let somme = 0;
  for (const c of nom.toUpperCase()) somme = (somme * 31 + c.charCodeAt(0)) % 997;
  return PALETTE[somme % PALETTE.length] ?? PALETTE[0];
}

const FLAMME = "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z";

export function MarqueGaz({ nom, compacte = false }: { nom: string; compacte?: boolean }) {
  const officiel = fichierOfficiel(`marque-${nomDeFichier(nom)}`);
  const classe = `marque-gaz${compacte ? " marque-gaz--compacte" : ""}`;
  if (officiel) {
    return (
      <span className={`${classe} marque-gaz--officiel`}>
        <img src={officiel} alt="" width={22} height={22} />
        {nom}
      </span>
    );
  }
  const { fond, texte } = couleurDeMarque(nom);
  return (
    <span className={classe} style={{ background: fond, color: texte }}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d={FLAMME} />
      </svg>
      {nom}
    </span>
  );
}
