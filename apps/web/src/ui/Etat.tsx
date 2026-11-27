import type { ReactNode } from "react";
import type { Probleme } from "../api/problemes.js";
import { useI18n } from "../i18n/index.js";
import { EtatVide, type GenreIllustration } from "../visuels/Illustration.js";
import { Button } from "./Button.js";
import { Squelette } from "./Squelette.js";

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
  /** Pourquoi c'est vide, et ce qui le remplira. */
  texteVide?: string;
  actionVide?: ReactNode;
  children: ReactNode;
}

/**
 * Tous les états d'une lecture au même endroit : chargement, erreur (hors ligne, serveur, droits, fonction absente,
 * réponse illisible), copie locale signalée, liste vide, et enfin le contenu.
 */
export function Etat({
  pret,
  charge,
  probleme,
  recharger,
  vide = false,
  messageVide,
  texteVide,
  actionVide,
  children,
}: Readonly<Props>) {
  const { t } = useI18n();
  const libelleCode = t("etat.code");
  const code = probleme?.code ? ` (${libelleCode} : ${probleme.code})` : "";

  if (probleme && !charge) {
    return (
      <EtatVide
        genre={DESSINS[probleme.genre]}
        titre={t(`etat.${probleme.genre}`)}
        texte={t(`etat.${probleme.genre}.texte`) + code}
        role={probleme.genre === "hors-ligne" ? "status" : "alert"}
      >
        <Button onClick={recharger}>{t("etat.reessayer")}</Button>
      </EtatVide>
    );
  }
  if (!pret && !charge) return <Squelette />;

  return (
    <>
      {probleme && (
        <output className="bandeau">
          <span>{[t("etat.donnees.locales"), t(`etat.${probleme.genre}`) + code].join(" · ")}</span>
          <Button variant="contour" onClick={recharger}>
            {t("etat.reessayer")}
          </Button>
        </output>
      )}
      {vide && messageVide ? (
        <EtatVide genre="vide" titre={messageVide} texte={texteVide}>
          {actionVide}
        </EtatVide>
      ) : (
        children
      )}
    </>
  );
}
