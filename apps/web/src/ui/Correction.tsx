import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { ApiError, newIdempotencyKey } from "../api/client.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "./Button.js";
import { Field } from "./Field.js";
import { useEnvoi } from "./useEnvoi.js";

const CODES: Record<string, MessageKey> = {
  stock_conflict: "corr.erreur.stock",
  justification_required: "corr.erreur.motif",
  not_found: "corr.erreur.introuvable",
  forbidden: "corr.erreur.droit",
};

/**
 * Correction justifiée, en deux temps : saisir, puis confirmer un résumé. Rien n'est modifié ni effacé : le serveur
 * ajoute une écriture et prévient le PDG. En direct seulement.
 */
export function Correction({
  titre,
  resume,
  corps,
  envoyer,
  onFait,
  onAbandonner,
  children,
}: Readonly<{
  titre: string;
  /** Ce qui sera enregistré ; null tant que la saisie propre à la correction est incomplète ou fausse. */
  resume: string | null;
  /** Identifie la demande : la même demande renvoyée après une coupure garde la même clé. */
  corps: string;
  envoyer: (justification: string, ref: string) => Promise<unknown>;
  onFait: () => void;
  onAbandonner: () => void;
  children?: ReactNode;
}>) {
  const { t } = useI18n();
  const [motif, setMotif] = useState("");
  const [verifie, setVerifie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const dernier = useRef<{ demande: string; ref: string } | null>(null);
  const justification = motif.trim();
  const pret = resume !== null && justification.length >= 5;

  const [confirmer, occupe] = useEnvoi(async () => {
    setErreur(null);
    const demande = `${corps}|${justification}`;
    if (dernier.current?.demande !== demande) dernier.current = { demande, ref: newIdempotencyKey() };
    try {
      await envoyer(justification, dernier.current.ref);
      onFait();
    } catch (e) {
      setVerifie(false);
      if (!(e instanceof ApiError)) return setErreur(t("corr.erreur.reseau"));
      if (e.status >= 500) return setErreur(t("corr.erreur.serveur"));
      // Un refus est définitif : une nouvelle tentative est une nouvelle demande.
      dernier.current = null;
      const cle = CODES[e.code];
      setErreur(cle ? t(cle) : e.message);
    }
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) setVerifie(true);
  }

  return (
    <form className="carte" aria-label={titre} onSubmit={soumettre}>
      <h2>{titre}</h2>
      <fieldset disabled={verifie} className="correction__saisie">
        {children}
        <Field
          label={t("corr.motif")}
          maxLength={500}
          value={motif}
          onChange={(e) => {
            setMotif(e.target.value);
            setErreur(null);
          }}
        />
      </fieldset>
      {erreur && (
        <p role="alert" className="connexion__erreur">
          {erreur}
        </p>
      )}
      {verifie && <output className="bloc">{`${resume} ${t("corr.prevenu")}`}</output>}
      <div className="vente__actions">
        {verifie ? (
          <>
            <Button disabled={occupe} onClick={() => void confirmer()}>
              {t("corr.confirmer")}
            </Button>
            <Button variant="contour" disabled={occupe} onClick={() => setVerifie(false)}>
              {t("corr.modifier")}
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" disabled={!pret}>
              {t("corr.verifier")}
            </Button>
            <Button variant="contour" onClick={onAbandonner}>
              {t("vente.retour")}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
