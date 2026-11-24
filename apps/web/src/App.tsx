import { Navigate, Outlet, Route, Routes } from "react-router";
import { LoginPage } from "./auth/LoginPage.js";
import { useSession } from "./auth/SessionProvider.js";
import { useI18n } from "./i18n/index.js";
import { cheminVolet, voletsPour } from "./nav/volets.js";
import { SyncPage } from "./offline/SyncPage.js";
import { ErrorBoundary, NotFound } from "./pages/Errors.js";
import { Placeholder } from "./pages/Placeholder.js";
import { Plus } from "./shell/Plus.js";
import { Shell } from "./shell/Shell.js";

function RequireAuth() {
  const { session, loading } = useSession();
  const { t } = useI18n();
  if (loading) return <p role="status">{t("page.chargement")}</p>;
  return session ? <Outlet /> : <Navigate to="/connexion" replace />;
}

function Accueil() {
  const { profilsActifs } = useSession();
  const premier = voletsPour(profilsActifs)[0];
  return premier ? <Navigate to={cheminVolet(premier)} replace /> : <NotFound />;
}

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="connexion" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route index element={<Accueil />} />
            <Route path="plus" element={<Plus />} />
            <Route path="sync" element={<SyncPage />} />
            <Route path=":volet/:rubrique" element={<Placeholder />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
