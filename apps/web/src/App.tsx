import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { LoginPage } from "./auth/LoginPage.js";
import { useSession } from "./auth/SessionProvider.js";
import { useI18n } from "./i18n/index.js";
import { cheminVolet, voletsPour } from "./nav/volets.js";
import { SyncPage } from "./offline/SyncPage.js";
import { ErrorBoundary, NotFound } from "./pages/Errors.js";
import { Garde } from "./pages/Garde.js";
import { Placeholder } from "./pages/Placeholder.js";
import { LivreurMode } from "./shell/LivreurMode.js";
import { Plus } from "./shell/Plus.js";
import { Shell } from "./shell/Shell.js";

// Écrans chargés à la demande : le premier affichage ne télécharge que la coque et la connexion.
const Historique = lazy(() => import("./vente/Historique.js").then((m) => ({ default: m.Historique })));
const Clients = lazy(() => import("./vente/Clients.js").then((m) => ({ default: m.Clients })));
const Marques = lazy(() => import("./config/Marques.js").then((m) => ({ default: m.Marques })));
const Prix = lazy(() => import("./config/Prix.js").then((m) => ({ default: m.Prix })));
const Utilisateurs = lazy(() =>
  import("./config/Utilisateurs.js").then((m) => ({ default: m.Utilisateurs })),
);
const ConfigCaisses = lazy(() => import("./config/Caisses.js").then((m) => ({ default: m.ConfigCaisses })));
const ConfigLangue = lazy(() => import("./config/Caisses.js").then((m) => ({ default: m.ConfigLangue })));
const Articles = lazy(() => import("./market/Articles.js").then((m) => ({ default: m.Articles })));
const StockArticles = lazy(() => import("./market/Articles.js").then((m) => ({ default: m.StockArticles })));
const Abonnes = lazy(() => import("./canal/Abonnes.js").then((m) => ({ default: m.Abonnes })));
const Suivi = lazy(() => import("./boutique/Suivi.js").then((m) => ({ default: m.Suivi })));
const Boutique = lazy(() => import("./boutique/Boutique.js").then((m) => ({ default: m.Boutique })));
const Encaissements = lazy(() =>
  import("./canal/Encaissements.js").then((m) => ({ default: m.Encaissements })),
);
const Operations = lazy(() => import("./money/Operations.js").then((m) => ({ default: m.Operations })));
const Float = lazy(() => import("./money/Reglages.js").then((m) => ({ default: m.Float })));
const Commissions = lazy(() => import("./money/Reglages.js").then((m) => ({ default: m.Commissions })));
const MouvementsArticles = lazy(() =>
  import("./market/Mouvements.js").then((m) => ({ default: m.MouvementsArticles })),
);
const Commandes = lazy(() => import("./commandes/Commandes.js").then((m) => ({ default: m.Commandes })));
const HistoriqueCommandes = lazy(() =>
  import("./commandes/Commandes.js").then((m) => ({ default: m.HistoriqueCommandes })),
);
const Echeances = lazy(() => import("./canal/Echeances.js").then((m) => ({ default: m.Echeances })));
const Cloture = lazy(() => import("./caisse/Cloture.js").then((m) => ({ default: m.Cloture })));
const Depenses = lazy(() => import("./caisse/Mouvements.js").then((m) => ({ default: m.Depenses })));
const Transferts = lazy(() => import("./caisse/Mouvements.js").then((m) => ({ default: m.Transferts })));
const Soldes = lazy(() => import("./caisse/Soldes.js").then((m) => ({ default: m.Soldes })));
const Echanges = lazy(() => import("./gaz/Echanges.js").then((m) => ({ default: m.Echanges })));
const Fournisseurs = lazy(() => import("./gaz/Fournisseurs.js").then((m) => ({ default: m.Fournisseurs })));
const Inventaire = lazy(() => import("./gaz/Inventaire.js").then((m) => ({ default: m.Inventaire })));
const Receptions = lazy(() => import("./gaz/Receptions.js").then((m) => ({ default: m.Receptions })));
const StockGaz = lazy(() => import("./gaz/StockGaz.js").then((m) => ({ default: m.StockGaz })));
const Alertes = lazy(() => import("./pilot/Pilot.js").then((m) => ({ default: m.Alertes })));
const Audit = lazy(() => import("./pilot/Pilot.js").then((m) => ({ default: m.Audit })));
const TableauDeBord = lazy(() => import("./pilot/Pilot.js").then((m) => ({ default: m.TableauDeBord })));
const Validations = lazy(() => import("./pilot/Pilot.js").then((m) => ({ default: m.Validations })));
const Exports = lazy(() => import("./rapport/Rapports.js").then((m) => ({ default: m.Exports })));
const RapportTable = lazy(() => import("./rapport/Rapports.js").then((m) => ({ default: m.RapportTable })));
const SituationGaz = lazy(() => import("./rapport/Rapports.js").then((m) => ({ default: m.SituationGaz })));

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
        {/* Vitrine publique et suivi de commande : sans compte. */}
        <Route
          path="boutique/suivi/:jeton"
          element={
            <Suspense fallback={<Chargement />}>
              <Suivi />
            </Suspense>
          }
        />
        <Route
          path="boutique"
          element={
            <Suspense fallback={<Chargement />}>
              <Boutique />
            </Suspense>
          }
        />
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
            <Route
              path="canal/abonnes"
              element={
                <Garde volet="canal">
                  <Abonnes />
                </Garde>
              }
            />
            <Route
              path="canal/echeances"
              element={
                <Garde volet="canal">
                  <Echeances />
                </Garde>
              }
            />
            <Route
              path="canal/encaissements"
              element={
                <Garde volet="canal">
                  <Encaissements />
                </Garde>
              }
            />
            <Route
              path="canal/rappels"
              element={
                <Garde volet="canal">
                  <Echeances rappels />
                </Garde>
              }
            />
            <Route
              path="money/operations"
              element={
                <Garde volet="money">
                  <Operations />
                </Garde>
              }
            />
            <Route
              path="money/float"
              element={
                <Garde volet="money">
                  <Float />
                </Garde>
              }
            />
            <Route
              path="money/commissions"
              element={
                <Garde volet="money">
                  <Commissions />
                </Garde>
              }
            />
            <Route
              path="market/articles"
              element={
                <Garde volet="market">
                  <Articles />
                </Garde>
              }
            />
            <Route
              path="market/stock"
              element={
                <Garde volet="market">
                  <StockArticles />
                </Garde>
              }
            />
            <Route
              path="livre/tournee"
              element={
                <Garde volet="livre">
                  <LivreurMode />
                </Garde>
              }
            />
            <Route
              path="vente/commandes"
              element={
                <Garde volet="vente">
                  <Commandes />
                </Garde>
              }
            />
            <Route
              path="livre/file"
              element={
                <Garde volet="livre">
                  <Commandes />
                </Garde>
              }
            />
            <Route
              path="livre/historique"
              element={
                <Garde volet="livre">
                  <HistoriqueCommandes />
                </Garde>
              }
            />
            <Route
              path="config/utilisateurs"
              element={
                <Garde volet="config">
                  <Utilisateurs />
                </Garde>
              }
            />
            <Route
              path="config/caisses"
              element={
                <Garde volet="config">
                  <ConfigCaisses />
                </Garde>
              }
            />
            <Route
              path="config/langue"
              element={
                <Garde volet="config">
                  <ConfigLangue />
                </Garde>
              }
            />
            <Route
              path="config/marques"
              element={
                <Garde volet="config">
                  <Marques />
                </Garde>
              }
            />
            <Route
              path="config/prix"
              element={
                <Garde volet="config">
                  <Prix />
                </Garde>
              }
            />
            <Route
              path="vente/historique"
              element={
                <Garde volet="vente">
                  <Historique />
                </Garde>
              }
            />
            <Route
              path="vente/clients"
              element={
                <Garde volet="vente">
                  <Clients />
                </Garde>
              }
            />
            <Route
              path="market/mouvements"
              element={
                <Garde volet="market">
                  <MouvementsArticles />
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
