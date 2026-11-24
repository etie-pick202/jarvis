import { Navigate, Outlet, Route, Routes } from "react-router";
import { useI18n } from "./i18n/index.js";
import { LanguageSwitch } from "./i18n/LanguageSwitch.js";
import { cheminVolet, VOLETS } from "./nav/volets.js";
import { StatusLight } from "./offline/StatusLight.js";
import { SyncPage } from "./offline/SyncPage.js";
import { NotFound, Placeholder } from "./pages/Placeholder.js";
import { Logo } from "./ui/Logo.js";

/** Coque provisoire : la barre de volets et de rubriques arrive à l'étape 3. */
function Layout() {
  const { t } = useI18n();
  return (
    <>
      <a className="skip-link" href="#contenu">
        {t("app.principal")}
      </a>
      <header
        style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--noir)" }}
      >
        <Logo />
        <strong style={{ color: "var(--jaune)", fontFamily: "var(--police-titre)", letterSpacing: ".14em" }}>
          {t("app.nom")}
        </strong>
        <span style={{ flex: 1 }} />
        <StatusLight />
        <LanguageSwitch />
      </header>
      <main id="contenu" style={{ padding: 16 }}>
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  const premier = VOLETS[0];
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={premier ? <Navigate to={cheminVolet(premier)} replace /> : <NotFound />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path=":volet/:rubrique" element={<Placeholder />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
