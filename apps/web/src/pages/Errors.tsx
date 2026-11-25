import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { EtatVide } from "../visuels/Illustration.js";

export function NotFound() {
  const { t } = useI18n();
  return (
    <section className="carte">
      <EtatVide
        genre="introuvable"
        titre={t("page.introuvable")}
        texte={t("page.introuvable.texte")}
        niveau={1}
        role="alert"
      >
        <Link className="btn" to="/">
          {t("page.retour")}
        </Link>
      </EtatVide>
    </section>
  );
}

export function Forbidden() {
  const { t } = useI18n();
  return (
    <section className="carte">
      <EtatVide
        genre="interdit"
        titre={t("page.interdit")}
        texte={t("page.interdit.texte")}
        niveau={1}
        role="alert"
      >
        <Link className="btn" to="/">
          {t("page.retour")}
        </Link>
      </EtatVide>
    </section>
  );
}

function Panne() {
  const { t } = useI18n();
  return (
    <section className="carte">
      <EtatVide genre="erreur" titre={t("page.panne")} texte={t("page.panne.texte")} niveau={1} role="alert">
        <Button onClick={() => window.location.reload()}>{t("page.recharger")}</Button>
      </EtatVide>
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
