import type { RefObject } from "react";
import { allerA } from "./amener.js";
import { Button } from "./Button.js";

/** Titre d'une liste et, sur téléphone, le bouton qui conduit à sa fiche de saisie placée dessous. */
export function TitreFiche({
  titre,
  niveau = 1,
  bouton,
  fiche,
}: Readonly<{
  titre: string;
  niveau?: 1 | 2;
  /** Absent : la personne n'a pas le droit de saisir, le titre reste seul. */
  bouton: string | undefined;
  fiche: RefObject<HTMLElement | null>;
}>) {
  const H = niveau === 1 ? "h1" : "h2";
  return (
    <div className="titre-ligne">
      <H>{titre}</H>
      {bouton && (
        <Button variant="contour" className="vers-fiche" onClick={() => allerA(fiche.current)}>
          {bouton}
        </Button>
      )}
    </div>
  );
}
