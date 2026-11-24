import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/vente.css";
import "./styles/ecrans.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.js";
import { SessionProvider } from "./auth/SessionProvider.js";
import { I18nProvider } from "./i18n/index.js";
import { startSync } from "./offline/sync.js";

async function demarrer() {
  // Travail sans serveur : `VITE_API_MOCK=1` branche des données d'exemple fictives (absentes de la production).
  if (import.meta.env.VITE_API_MOCK === "1") (await import("./api/fake.js")).installFakeApi();

  const root = document.getElementById("root");
  if (!root) throw new Error("Élément #root introuvable");
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <SessionProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SessionProvider>
      </I18nProvider>
    </StrictMode>,
  );

  startSync();
  if ("serviceWorker" in navigator)
    void import("virtual:pwa-register").then((m) => m.registerSW({ immediate: true }));
}

void demarrer();
