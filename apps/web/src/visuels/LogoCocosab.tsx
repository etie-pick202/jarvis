import { fichierOfficiel } from "./officiels.js";

/**
 * Logo COCOSAB côté client (vitrine, reçus) : pastille noire et nom en jaune, comme dans la maquette.
 * Si COCOSAB fournit son fichier officiel (`src/visuels/officiels/cocosab.svg`), il le remplace automatiquement.
 */
export function LogoCocosab({
  taille = "md",
  sur = "clair",
}: {
  taille?: "sm" | "md" | "lg";
  sur?: "clair" | "sombre";
}) {
  const officiel = fichierOfficiel("cocosab");
  if (officiel)
    return <img className={`logo-cocosab-img logo-cocosab-img--${taille}`} src={officiel} alt="COCOSAB" />;
  return <span className={`logo-cocosab logo-cocosab--${taille} logo-cocosab--${sur}`}>COCOSAB</span>;
}
