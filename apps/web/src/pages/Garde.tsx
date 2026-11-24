import type { ReactNode } from "react";
import { useSession } from "../auth/SessionProvider.js";
import { VOLETS, voletsPour } from "../nav/volets.js";
import { Forbidden } from "./Errors.js";

/** N'affiche l'écran que si le profil actif voit le volet. */
export function Garde({ volet, children }: { volet: string; children: ReactNode }) {
  const { profilsActifs } = useSession();
  const v = VOLETS.find((x) => x.id === volet);
  return v && voletsPour(profilsActifs).includes(v) ? children : <Forbidden />;
}
