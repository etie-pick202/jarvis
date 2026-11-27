import * as contrat from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";

type Reglage = contrat.NotificationSettings;

const SUJETS = [
  ["reminders", "notif.rappels"],
  ["stockAlerts", "notif.stock"],
  ["reports", "notif.rapports"],
] as const;
const PROFILS = ["pdg", "gerant", "caissier"] as const;
const ADRESSES_MAX = 10;
const adresseValide = (a: string) =>
  contrat.notificationSettings.shape.reportEmails.element.safeParse(a).success;

function Formulaire({
  actuel,
  peutModifier,
  onEnregistre,
}: Readonly<{ actuel: Reglage; peutModifier: boolean; onEnregistre: (r: Reglage) => void }>) {
  const { t } = useI18n();
  // Tant que rien n'est touché, le formulaire suit la valeur lue (copie locale puis serveur).
  const [saisi, setSaisi] = useState<Reglage | null>(null);
  const [adresse, setAdresse] = useState("");
  const [ok, setOk] = useState(false);
  const reglage = saisi ?? actuel;
  const nouvelle = adresse.trim().toLowerCase();
  const doublon = reglage.reportEmails.some((a) => a.toLowerCase() === nouvelle);
  const fausse = nouvelle !== "" && !adresseValide(nouvelle);
  const pleine = reglage.reportEmails.length >= ADRESSES_MAX;

  function changer(suite: Partial<Reglage>) {
    setSaisi({ ...reglage, ...suite });
    setOk(false);
  }

  function ajouter() {
    if (!nouvelle || fausse || doublon || pleine) return;
    changer({ reportEmails: [...reglage.reportEmails, nouvelle] });
    setAdresse("");
  }

  const [enregistrer, occupe] = useEnvoi(async () => {
    await ecrire({
      method: "PUT",
      path: "/control/notification-settings",
      label: t("rub.config.notifications"),
      body: reglage,
    });
    onEnregistre(reglage);
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    // Une adresse tapée mais pas ajoutée serait perdue sans le dire.
    if (nouvelle === "") void enregistrer();
  }

  return (
    <form onSubmit={soumettre} aria-label={t("rub.config.notifications")}>
      {SUJETS.map(([cle, libelle]) => (
        <fieldset key={cle} disabled={!peutModifier}>
          <legend>{t(libelle)}</legend>
          {PROFILS.map((p) => (
            <label key={p} className="vente__bascule">
              <input
                type="checkbox"
                checked={reglage[cle].includes(p)}
                onChange={(e) =>
                  changer({
                    [cle]: PROFILS.filter((x) => (x === p ? e.target.checked : reglage[cle].includes(x))),
                  })
                }
              />
              {t(`config.profil.${p}`)}
            </label>
          ))}
          {reglage[cle].length === 0 && <output className="bloc">{t("notif.personne")}</output>}
        </fieldset>
      ))}

      <h2>{t("notif.adresses")}</h2>
      {reglage.reportEmails.length === 0 && <p>{t("notif.aucune.adresse")}</p>}
      <ul className="liste">
        {reglage.reportEmails.map((a) => (
          <li key={a} className="validation">
            <span>{a}</span>
            {peutModifier && (
              <Button
                variant="contour"
                aria-label={`${t("notif.retirer")} ${a}`}
                onClick={() => changer({ reportEmails: reglage.reportEmails.filter((x) => x !== a) })}
              >
                {t("notif.retirer")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {peutModifier && (
        <>
          {pleine ? (
            <output className="bloc">{t("notif.adresses.max")}</output>
          ) : (
            <>
              <Field
                label={t("notif.adresse")}
                type="email"
                autoComplete="off"
                maxLength={200}
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  ajouter();
                }}
              />
              {(fausse || doublon) && (
                <p role="alert" className="connexion__erreur">
                  {t(doublon ? "notif.adresse.deja" : "notif.adresse.invalide")}
                </p>
              )}
              <Button variant="contour" disabled={!nouvelle || fausse || doublon} onClick={ajouter}>
                {t("notif.ajouter")}
              </Button>
            </>
          )}
          {nouvelle !== "" && <p>{t("notif.ajouter.avant")}</p>}
          <div className="vente__actions">
            <Button type="submit" disabled={occupe || nouvelle !== ""}>
              {t("config.enregistrer")}
            </Button>
          </div>
        </>
      )}
      {ok && <output className="bloc">{t("config.enregistre")}</output>}
    </form>
  );
}

/** Qui reçoit les rappels, alertes et rapports ; les corrections et annulations vont toujours au PDG. */
export function Notifications() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const pdg = profilsActifs.includes("pdg");
  const lecture = useCached("destinataires", api.destinataires, contrat.DEFAULT_NOTIFICATION_SETTINGS);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.config.notifications")}</h1>
        <p>{t("notif.corrections")}</p>
        {!pdg && <p>{t("config.reserve.pdg")}</p>}
        <Etat {...lecture}>
          <Formulaire
            actuel={lecture.data}
            peutModifier={pdg}
            onEnregistre={(r) => lecture.modifier(() => r)}
          />
        </Etat>
      </section>
    </div>
  );
}
