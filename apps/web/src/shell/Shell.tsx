import { Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { LanguageSwitch } from "../i18n/LanguageSwitch.js";
import {
  cheminVolet,
  type Profil,
  type Rubrique,
  rubriquesPour,
  VOLETS,
  type Volet,
  voletsPour,
} from "../nav/volets.js";
import { StatusLight } from "../offline/StatusLight.js";
import { Button } from "../ui/Button.js";
import { IconeRubrique } from "../visuels/IconeRubrique.js";
import { MarqueJarvis } from "../visuels/LogoJarvis.js";
import { Icone } from "./icones.js";
import { LivreurMode } from "./LivreurMode.js";
import { badgeDuVolet, useBadges } from "./useBadges.js";

/** Volets de la barre du bas sur téléphone ; les autres se rangent sous « Plus ». */
const BAS = ["vente", "gaz", "caisse"];

export function voletCourant(pathname: string): Volet | undefined {
  const id = pathname.split("/")[1];
  return VOLETS.find((v) => v.id === id);
}

const classeVolet =
  (actif: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    `nav__lien${isActive || actif ? " active" : ""}`;

function Pastille({ n }: { n: number }) {
  return n > 0 ? <span className="pastille pastille--alerte nav__pastille">{n}</span> : null;
}

export function Shell() {
  const { t } = useI18n();
  const { session, mode, profilsActifs, setMode, logout } = useSession();
  const { pathname } = useLocation();
  const badges = useBadges();
  const visibles = voletsPour(profilsActifs);
  const courant = voletCourant(pathname);
  const peutLivrer = session?.profils.includes("livreur") && session.profils.length > 1;
  const bas = visibles.filter((v) => BAS.includes(v.id));

  return (
    <div className="coque">
      <a className="skip-link" href="#contenu">
        {t("app.principal")}
      </a>
      <header className="coque__haut">
        <div className="coque__marque">
          <MarqueJarvis size={30} />
        </div>
        <StatusLight />
        <span className="coque__espace" />
        {peutLivrer && (
          <Button variant="contour" onClick={() => setMode(mode === "livreur" ? "gestion" : "livreur")}>
            {mode === "livreur" ? t("mode.gestion") : t("mode.livreur")}
          </Button>
        )}
        <LanguageSwitch />
        <Button variant="contour" onClick={() => void logout()}>
          {t("login.sortir")}
        </Button>
      </header>

      {mode === "livreur" ? (
        <main id="contenu" className="coque__contenu">
          <LivreurMode />
        </main>
      ) : (
        <>
          <nav className="coque__volets" aria-label={t("nav.volets")}>
            {visibles.map((v) => (
              <NavLink key={v.id} to={cheminVolet(v)} className={classeVolet(courant?.id === v.id)}>
                <Icone id={v.id} />
                <span className="nav__texte">
                  <strong>{v.nom}</strong>
                  <small>{t(v.label)}</small>
                </span>
                <Pastille n={badgeDuVolet(v.id, badges)} />
              </NavLink>
            ))}
          </nav>
          <div className="coque__zone">
            {courant && <Rubriques volet={courant} profils={profilsActifs} />}
            <main id="contenu" className="coque__contenu">
              <Suspense fallback={<p role="status">{t("page.chargement")}</p>}>
                <Outlet />
              </Suspense>
            </main>
          </div>
          <nav className="coque__bas" aria-label={t("nav.volets")}>
            {bas.map((v) => (
              <NavLink key={v.id} to={cheminVolet(v)} className={classeVolet(courant?.id === v.id)}>
                <Icone id={v.id} />
                <span>{t(v.label)}</span>
                <Pastille n={badgeDuVolet(v.id, badges)} />
              </NavLink>
            ))}
            <NavLink to="/plus" className="nav__lien">
              <Icone id="plus" />
              <span>{t("nav.plus")}</span>
            </NavLink>
          </nav>
        </>
      )}
    </div>
  );
}

function Rubriques({ volet, profils }: { volet: Volet; profils: readonly Profil[] }) {
  const { t } = useI18n();
  return (
    <nav className="coque__rubriques" aria-label={`${volet.nom} : ${t("nav.rubriques")}`}>
      <h2 className="coque__titre">{volet.nom}</h2>
      {rubriquesPour(volet, profils).map((r: Rubrique) => (
        <NavLink key={r.id} to={cheminVolet(volet, r)} className="rubrique">
          <IconeRubrique volet={volet.id} rubrique={r.id} />
          {t(r.label)}
        </NavLink>
      ))}
    </nav>
  );
}
