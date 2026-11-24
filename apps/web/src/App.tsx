import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { LoginPage } from "./auth/LoginPage.js";
import { useSession } from "./auth/SessionProvider.js";
import { Cloture } from "./caisse/Cloture.js";
import { Depenses, Transferts } from "./caisse/Mouvements.js";
import { Soldes } from "./caisse/Soldes.js";
import { Echanges } from "./gaz/Echanges.js";
import { Fournisseurs } from "./gaz/Fournisseurs.js";
import { Inventaire } from "./gaz/Inventaire.js";
import { Receptions } from "./gaz/Receptions.js";
import { StockGaz } from "./gaz/StockGaz.js";
import { useI18n } from "./i18n/index.js";
import { cheminVolet, voletsPour } from "./nav/volets.js";
import { SyncPage } from "./offline/SyncPage.js";
import { ErrorBoundary, NotFound } from "./pages/Errors.js";
import { Garde } from "./pages/Garde.js";
import { Placeholder } from "./pages/Placeholder.js";
import { Alertes, Audit, TableauDeBord, Validations } from "./pilot/Pilot.js";
import { Exports, RapportTable, SituationGaz } from "./rapport/Rapports.js";
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
            <Route
              path="gaz/receptions"
              element={
                <Garde volet="gaz">
                  <Receptions />
                </Garde>
              }
            />
            <Route
              path="gaz/inventaire"
              element={
                <Garde volet="gaz">
                  <Inventaire />
                </Garde>
              }
            />
            <Route
              path="caisse/soldes"
              element={
                <Garde volet="caisse">
                  <Soldes />
                </Garde>
              }
            />
            <Route
              path="caisse/depenses"
              element={
                <Garde volet="caisse">
                  <Depenses />
                </Garde>
              }
            />
            <Route
              path="caisse/transferts"
              element={
                <Garde volet="caisse">
                  <Transferts />
                </Garde>
              }
            />
            <Route
              path="caisse/cloture"
              element={
                <Garde volet="caisse" rubrique="cloture">
                  <Cloture />
                </Garde>
              }
            />
            <Route
              path="pilot/tableau"
              element={
                <Garde volet="pilot">
                  <TableauDeBord />
                </Garde>
              }
            />
            <Route
              path="pilot/alertes"
              element={
                <Garde volet="pilot">
                  <Alertes page />
                </Garde>
              }
            />
            <Route
              path="pilot/validations"
              element={
                <Garde volet="pilot">
                  <Validations />
                </Garde>
              }
            />
            <Route
              path="pilot/audit"
              element={
                <Garde volet="pilot">
                  <Audit />
                </Garde>
              }
            />
            <Route
              path="rapport/clients"
              element={
                <Garde volet="rapport">
                  <RapportTable id="clients" titre="rub.rapport.clients" />
                </Garde>
              }
            />
            <Route
              path="rapport/journal"
              element={
                <Garde volet="rapport">
                  <RapportTable id="journal" titre="rub.rapport.journal" />
                </Garde>
              }
            />
            <Route
              path="rapport/x"
              element={
                <Garde volet="rapport">
                  <RapportTable id="x" titre="rub.rapport.x" />
                </Garde>
              }
            />
            <Route
              path="rapport/gaz"
              element={
                <Garde volet="rapport">
                  <SituationGaz />
                </Garde>
              }
            />
            <Route
              path="rapport/exports"
              element={
                <Garde volet="rapport">
                  <Exports />
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
