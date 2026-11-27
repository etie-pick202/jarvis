import { Link } from "react-router";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import type { Profil } from "../nav/volets.js";

/** Action proposée par un écran vide : un lien pour qui peut agir, sinon le nom de qui doit le faire. */
export function Suite({
  vers,
  libelle,
  profils = ["pdg"],
}: Readonly<{ vers: string; libelle: string; profils?: readonly Profil[] }>) {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  if (!profils.some((p) => profilsActifs.includes(p))) {
    return (
      <p className="etat-vide__texte">{t(profils.includes("gerant") ? "vide.direction" : "vide.pdg")}</p>
    );
  }
  return (
    <Link className="btn" to={vers}>
      {libelle}
    </Link>
  );
}
