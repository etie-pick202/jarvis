import { useSession } from "../auth/SessionProvider.js";
import { ComptesSage } from "./ComptesSage.js";
import { EnvoiMail } from "./EnvoiMail.js";
import { Exports } from "./Exports.js";

export function PageExports() {
  const { profilsActifs } = useSession();
  return (
    <div className="page page--deux">
      <Exports />
      <EnvoiMail />
      {profilsActifs.includes("pdg") && <ComptesSage />}
    </div>
  );
}
