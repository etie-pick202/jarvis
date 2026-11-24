import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./styles/tokens.css";
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App.js";
import { I18nProvider } from "./i18n/index.js";
import { startSync } from "./offline/sync.js";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);

startSync();
if ("serviceWorker" in navigator)
  void import("virtual:pwa-register").then((m) => m.registerSW({ immediate: true }));
