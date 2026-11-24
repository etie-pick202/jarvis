import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { LoginPage } from "./auth/LoginPage.js";
import { useSession } from "./auth/SessionProvider.js";
import { Echanges } from "./gaz/Echanges.js";
import { Fournisseurs } from "./gaz/Fournisseurs.js";
import { StockGaz } from "./gaz/StockGaz.js";
import { useI18n } from "./i18n/index.js";
import { cheminVolet, voletsPour } from "./nav/volets.js";
import { SyncPage } from "./offline/SyncPage.js";
import { ErrorBoundary, NotFound } from "./pages/Errors.js";
import { Garde } from "./pages/Garde.js";
import { Placeholder } from "./pages/Placeholder.js";
import { Plus } from "./shell/Plus.js";
import { Shell } from "./shell/Shell.js";

// Chargé à la demande : la bibliothèque de validation de @jarvis/shared n'alourdit pas le premier affichage.
const NouvelleVente = lazy(() =>
  import("./vente/NouvelleVente.js").then((m) => ({ default: m.NouvelleVente })),
);

function Chargement() {
  const { t } = useI18n();
  return <p role="status">{t("page.chargement")}</p>;
}

function RequireAuth() {
  const { session, loading } = useSession();
  if (loading) return <Chargement />;
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
            <Route
              path="vente/nouvelle"
              element={
                <Garde volet="vente">
                  <Suspense fallback={<Chargement />}>
                    <NouvelleVente />
                  </Suspense>
                </Garde>
              }
            />
            <Route
              path="gaz/stock"
              element={
                <Garde volet="gaz">
                  <StockGaz />
                </Garde>
              }
            />
            <Route
              path="gaz/echanges"
              element={
                <Garde volet="gaz">
                  <Echanges />
                </Garde>
              }
            />
            <Route
              path="gaz/fournisseurs"
              element={
                <Garde volet="gaz">
                  <Fournisseurs />
                </Garde>
              }
            />
            <Route path=":volet/:rubrique" element={<Placeholder />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
