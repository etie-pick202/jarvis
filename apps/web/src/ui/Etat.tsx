import type { ReactNode } from "react";
import type { Probleme } from "../api/problemes.js";
import { useI18n } from "../i18n/index.js";
import { EtatVide, type GenreIllustration } from "../visuels/Illustration.js";
import { Button } from "./Button.js";

const DESSINS: Record<Probleme["genre"], GenreIllustration> = {
  "hors-ligne": "hors-ligne",
  serveur: "erreur",
  interdit: "interdit",
  indisponible: "vide",
  contrat: "erreur",
};

interface Props {
  /** La lecture : voir `useCached`. */
  pret: boolean;
  charge: boolean;
  probleme: Probleme | null;
  recharger: () => void;
  /** La liste lue est vide. */
  vide?: boolean;
  messageVide?: string;
  children: ReactNode;
}

/**
 * Tous les états d'une lecture au même endroit : chargement, erreur (hors ligne, serveur, droits, fonction absente,
 * réponse illisible), copie locale signalée, liste vide, et enfin le contenu.
 */
export function Etat({ pret, charge, probleme, recharger, vide = false, messageVide, children }: Props) {
  const { t } = useI18n();
  const code = probleme?.code ? ` (${t("etat.code")} : ${probleme.code})` : "";

  if (probleme && !charge) {
    return (
      <EtatVide
        genre={DESSINS[probleme.genre]}
        titre={t(`etat.${probleme.genre}`)}
        texte={`${t(`etat.${probleme.genre}.texte`)}${code}`}
        role={probleme.genre === "hors-ligne" ? "status" : "alert"}
      >
        <Button onClick={recharger}>{t("etat.reessayer")}</Button>
      </EtatVide>
    );
  }
  if (!pret && !charge) return <p role="status">{t("page.chargement")}</p>;

  return (
    <>
      {probleme && (
        <div className="bandeau" role="status">
          <span>{`${t("etat.donnees.locales")} · ${t(`etat.${probleme.genre}`)}${code}`}</span>
          <Button variant="contour" onClick={recharger}>
            {t("etat.reessayer")}
          </Button>
        </div>
      )}
      {vide && messageVide ? <EtatVide genre="vide" titre={messageVide} /> : children}
    </>
  );
}
