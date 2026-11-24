import type { ReactNode } from "react";
import { useSession } from "../auth/SessionProvider.js";
import { rubriquesPour, VOLETS, voletsPour } from "../nav/volets.js";
import { Forbidden } from "./Errors.js";

/** N'affiche l'écran que si le profil actif voit le volet. */
export function Garde({
  volet,
  rubrique,
  children,
}: {
  volet: string;
  rubrique?: string;
  children: ReactNode;
}) {
  const { profilsActifs } = useSession();
  const v = VOLETS.find((x) => x.id === volet);
  const autorisee =
    v &&
    voletsPour(profilsActifs).includes(v) &&
    (!rubrique || rubriquesPour(v, profilsActifs).some((r) => r.id === rubrique));
  return autorisee ? children : <Forbidden />;
}
