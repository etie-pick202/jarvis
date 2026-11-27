import type { EmailReportsInput, EmailReportsStatus } from "@jarvis/shared";
import { type FormEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError, newIdempotencyKey } from "../api/client.js";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { jourActivite } from "../canal/regles.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";
import { useEnvoi } from "../ui/useEnvoi.js";

type Rapport = EmailReportsInput["reports"][number];
type Format = EmailReportsInput["format"];

const RAPPORTS = [
  ["sales", "rub.rapport.clients"],
  ["cash", "rub.rapport.journal"],
  ["stock", "rub.rapport.gaz"],
  ["x", "rub.rapport.x"],
] as const;
const FERME: EmailReportsStatus = { configured: false, recipients: [] };

function Formulaire({ destinataires }: Readonly<{ destinataires: readonly string[] }>) {
  const { t } = useI18n();
  const [choisis, setChoisis] = useState<Rapport[]>(["sales", "cash"]);
  const [format, setFormat] = useState<Format>("pdf");
  const [jour, setJour] = useState(() => jourActivite(new Date()));
  const [avis, setAvis] = useState<{ texte: string; erreur: boolean } | null>(null);
  // Même clé tant que la demande est la même : réessayer après une coupure n'envoie pas deux fois.
  const ref = useRef<string | null>(null);
  const disponible = (r: Rapport) => format === "pdf" || r !== "x";
  const rapports = choisis.filter(disponible);

  function changer(action: () => void) {
    action();
    ref.current = null;
    setAvis(null);
  }

  const [envoyer, occupe] = useEnvoi(async () => {
    setAvis(null);
    ref.current ??= newIdempotencyKey();
    try {
      const r = await api.envoyerRapports({ reports: rapports, format, date: jour }, ref.current);
      ref.current = null;
      setAvis({ texte: `${t("envoi.ok")} ${r.recipients.join(", ")}`, erreur: false });
    } catch (e) {
      setAvis({ texte: e instanceof ApiError ? e.message : t("config.reseau"), erreur: true });
    }
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (rapports.length > 0 && jour) void envoyer();
  }

  return (
    <form onSubmit={soumettre} aria-label={t("envoi.titre")}>
      <p>{`${t("envoi.destinataires")} : ${destinataires.join(", ")}`}</p>
      <fieldset>
        <legend>{t("envoi.rapports")}</legend>
        {RAPPORTS.map(([r, libelle]) => (
          <label key={r} className="vente__bascule">
            <input
              type="checkbox"
              disabled={!disponible(r)}
              checked={disponible(r) && choisis.includes(r)}
              onChange={(e) => {
                const coche = e.target.checked;
                changer(() => setChoisis((l) => (coche ? [...l, r] : l.filter((x) => x !== r))));
              }}
            />
            {t(libelle)}
          </label>
        ))}
      </fieldset>
      {format !== "pdf" && <p>{t("envoi.x.pdf")}</p>}
      <Segmented<Format>
        legend={t("envoi.format")}
        value={format}
        onChange={(f) => changer(() => setFormat(f))}
        options={[
          { value: "pdf", label: "PDF" },
          { value: "xlsx", label: "XLSX" },
          { value: "csv", label: "CSV" },
        ]}
      />
      <Field
        label={t("envoi.jour")}
        type="date"
        value={jour}
        onChange={(e) => changer(() => setJour(e.target.value))}
      />
      {avis &&
        (avis.erreur ? (
          <p role="alert" className="connexion__erreur">
            {avis.texte}
          </p>
        ) : (
          <output className="bloc">{avis.texte}</output>
        ))}
      <div className="vente__actions">
        <Button type="submit" disabled={rapports.length === 0 || !jour || occupe}>
          {t("envoi.envoyer")}
        </Button>
      </div>
    </form>
  );
}

/** Rapports d'un jour envoyés aux seules adresses réglées par le PDG. */
export function EnvoiMail() {
  const { t } = useI18n();
  const lecture = useCached("envoi-rapports", api.etatEnvoi, FERME);
  const { configured, recipients } = lecture.data;

  return (
    <section className="carte">
      <h2>{t("envoi.titre")}</h2>
      <Etat {...lecture}>
        {!configured && <p>{t("envoi.non.configure")}</p>}
        {configured && recipients.length === 0 && (
          <p>
            {t("envoi.aucune.adresse")}{" "}
            <Link to="/config/notifications">{t("rub.config.notifications")}</Link>
          </p>
        )}
        {configured && recipients.length > 0 && <Formulaire destinataires={recipients} />}
      </Etat>
    </section>
  );
}
