import { useState } from "react";
import { useI18n } from "../i18n/index.js";
import { Button } from "./Button.js";
import { Field } from "./Field.js";
import { useEnvoi } from "./useEnvoi.js";

/** Annulation d'une écriture : rien n'est effacé, un motif de 5 caractères au moins est exigé. */
export function Annulation({
  objet,
  onConfirmer,
  onAbandonner,
}: Readonly<{
  /** Ce qu'on annule (nom, référence), repris dans le libellé du champ. */
  objet: string;
  onConfirmer: (justification: string) => Promise<void>;
  onAbandonner: () => void;
}>) {
  const { t } = useI18n();
  const [motif, setMotif] = useState("");
  const [confirmer, occupe] = useEnvoi(() => onConfirmer(motif.trim()));
  const libelle = t("canal.motif");
  return (
    <div className="validation__refus">
      <Field label={`${libelle} (${objet})`} value={motif} onChange={(e) => setMotif(e.target.value)} />
      <Button disabled={motif.trim().length < 5 || occupe} onClick={() => void confirmer()}>
        {t("canal.confirmer.annulation")}
      </Button>
      <Button variant="contour" onClick={onAbandonner}>
        {t("vente.retour")}
      </Button>
    </div>
  );
}
