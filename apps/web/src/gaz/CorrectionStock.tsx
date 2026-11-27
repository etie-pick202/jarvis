import type { BottleState } from "@jarvis/shared";
import { useState } from "react";
import type { GazStock } from "../api/contracts.js";
import { api } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { Correction } from "../ui/Correction.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";

/** Variation signée, jamais nulle. */
export function lireVariation(saisie: string): number | null {
  const t = saisie.trim();
  if (!/^[+-]?\d{1,5}$/u.test(t)) return null;
  return Number(t) || null;
}

export function CorrectionStock({
  ligne,
  onFait,
  onAbandonner,
}: Readonly<{ ligne: GazStock; onFait: () => void; onAbandonner: () => void }>) {
  const { t } = useI18n();
  const [etat, setEtat] = useState<BottleState>("full");
  const [saisie, setSaisie] = useState("");
  const delta = lireVariation(saisie);
  const actuel = etat === "full" ? ligne.pleines : ligne.vides;
  const negatif = delta !== null && actuel + delta < 0;
  const libelle = t(etat === "full" ? "gaz.pleines" : "gaz.vides");
  const juste = delta !== null && !negatif;

  return (
    <Correction
      titre={`${t("corr.stock")} : ${ligne.marque} ${ligne.formatLabel}`}
      resume={
        juste ? `${ligne.marque} ${ligne.formatLabel}, ${libelle} : ${actuel} → ${actuel + delta}.` : null
      }
      corps={`${ligne.brandId}|${ligne.formatId}|${etat}|${delta}`}
      envoyer={(justification, ref) =>
        api.corrigerStock(
          { brandId: ligne.brandId, formatId: ligne.formatId, state: etat, delta: delta ?? 0, justification },
          ref,
        )
      }
      onFait={onFait}
      onAbandonner={onAbandonner}
    >
      <Segmented<BottleState>
        legend={t("corr.etat")}
        value={etat}
        onChange={setEtat}
        options={[
          { value: "full", label: t("gaz.pleines") },
          { value: "empty", label: t("gaz.vides") },
        ]}
      />
      <Field label={t("corr.variation")} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
      {saisie.trim() !== "" && delta === null && (
        <p role="alert" className="connexion__erreur">
          {t("corr.variation.invalide")}
        </p>
      )}
      {negatif && (
        <p role="alert" className="connexion__erreur">
          {t("corr.erreur.stock")}
        </p>
      )}
    </Correction>
  );
}
