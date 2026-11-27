import { useState } from "react";
import { ApiError } from "../api/client.js";
import { api } from "../api/index.js";
import { jourActivite } from "../canal/regles.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { telecharger } from "./export.js";
import { erreurPeriode, FICHIERS, type Format } from "./periode.js";

const TYPES: Record<Format, string> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** Exports du serveur : Excel et CSV sur une période, PDF d'un jour (en attendant le format Sage 100 i7). */
export function Exports() {
  const { t } = useI18n();
  const [du, setDu] = useState(() => jourActivite(new Date()));
  const [au, setAu] = useState(() => jourActivite(new Date()));
  const [erreur, setErreur] = useState<string | null>(null);
  const probleme = erreurPeriode(du, au);
  const [enCours, setEnCours] = useState<string | null>(null);

  async function telechargerFichier(nom: string, chemin: string, format: Format) {
    if (enCours) return;
    setEnCours(nom);
    setErreur(null);
    try {
      telecharger(nom, await api.fichier(chemin), TYPES[format]);
    } catch (e) {
      setErreur(
        e instanceof ApiError && e.status < 500 && e.code !== "unknown"
          ? e.message
          : t("rapport.export.erreur"),
      );
    } finally {
      setEnCours(null);
    }
  }

  return (
    <section className="carte">
      <h1>{t("rub.rapport.exports")}</h1>
      <p>{t("rapport.sage")}</p>
      <Field label={t("exports.du")} type="date" value={du} onChange={(e) => setDu(e.target.value)} />
      <Field label={t("exports.au")} type="date" value={au} onChange={(e) => setAu(e.target.value)} />
      {probleme && (
        <p role="alert" className="connexion__erreur">
          {t(probleme)}
        </p>
      )}
      {erreur && (
        <p role="alert" className="connexion__erreur">
          {erreur}
        </p>
      )}
      <ul className="liste">
        {FICHIERS.map((f) => (
          <li key={f.nom} className="validation">
            <strong>{t(f.libelle as MessageKey)}</strong>
            <div className="vente__actions">
              {f.formats.map((format) => {
                const fichier = `${f.nom}.${format}`;
                return (
                  <Button
                    key={format}
                    variant={format === "pdf" ? "contour" : "noir"}
                    disabled={probleme !== null || enCours !== null}
                    aria-label={[
                      format === "csv" ? t("rapport.csv") : format.toUpperCase(),
                      `(${fichier})`,
                    ].join(" ")}
                    onClick={() => void telechargerFichier(fichier, f.chemin(format, du, au), format)}
                  >
                    {format.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
