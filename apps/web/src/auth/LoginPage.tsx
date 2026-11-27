import { type FormEvent, useState } from "react";
import { Link, Navigate } from "react-router";
import { ApiError } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { LanguageSwitch } from "../i18n/LanguageSwitch.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { EtatVide } from "../visuels/Illustration.js";
import { LogoJarvis } from "../visuels/LogoJarvis.js";
import { CLE_EXPIREE, useSession } from "./SessionProvider.js";

export function LoginPage() {
  const { t } = useI18n();
  const { session, login } = useSession();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [expiree] = useState(() => sessionStorage.getItem(CLE_EXPIREE) === "1");

  if (session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await login({ identifiant, motDePasse });
      sessionStorage.removeItem(CLE_EXPIREE);
    } catch (e) {
      setErreur(e instanceof ApiError && e.status === 401 ? t("login.refuse") : t("login.reseau"));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="connexion">
      <form className="carte connexion__carte" onSubmit={submit}>
        <div className="connexion__marque">
          <LogoJarvis size={96} animee titre={t("visuel.jarvis")} />
          <h1 className="marque-jarvis__nom connexion__nom">{t("app.nom")}</h1>
          <p>{t("app.slogan")}</p>
        </div>
        {expiree && (
          <EtatVide
            genre="session"
            titre={t("session.expiree.titre")}
            texte={t("session.expiree.texte")}
            role="status"
          />
        )}
        <Field
          label={t("login.identifiant")}
          autoComplete="username"
          required
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
        />
        <Field
          label={t("login.mdp")}
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        {erreur && (
          <p role="alert" className="connexion__erreur">
            {erreur}
          </p>
        )}
        <Button type="submit" block disabled={envoi}>
          {t("login.valider")}
        </Button>
        <LanguageSwitch />
        <Link to="/boutique">{t("boutique.titre")}</Link>
      </form>
    </main>
  );
}
