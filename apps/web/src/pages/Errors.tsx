import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";

export function NotFound() {
  const { t } = useI18n();
  return (
    <section className="carte" role="alert">
      <h1>{t("page.introuvable")}</h1>
      <Link to="/">{t("page.retour")}</Link>
    </section>
  );
}

export function Forbidden() {
  const { t } = useI18n();
  return (
    <section className="carte" role="alert">
      <h1>{t("page.interdit")}</h1>
      <p>{t("page.interdit.texte")}</p>
      <Link to="/">{t("page.retour")}</Link>
    </section>
  );
}

function Panne() {
  const { t } = useI18n();
  return (
    <section className="carte" role="alert">
      <h1>{t("page.panne")}</h1>
      <p>{t("page.panne.texte")}</p>
      <Button onClick={() => window.location.reload()}>{t("page.recharger")}</Button>
    </section>
  );
}

/** Rattrape une erreur d'affichage : l'utilisateur garde la main au lieu d'un écran blanc. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <Panne /> : this.props.children;
  }
}
