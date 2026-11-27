import { type FormEvent, useState } from "react";
import { api, type Caisse } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { LanguageSwitch } from "../i18n/LanguageSwitch.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";

function Ligne({
  caisse,
  peutGerer,
  onBascule,
}: Readonly<{ caisse: Caisse; peutGerer: boolean; onBascule: () => void }>) {
  const { t } = useI18n();
  const action = t(caisse.actif ? "canal.desactiver" : "money.activer");
  const [basculer, occupe] = useEnvoi(async () => {
    await ecrire({
      method: "PATCH",
      path: `/cash/registers/${caisse.id}`,
      label: `${action} : ${caisse.nom}`,
      body: { active: !caisse.actif },
    });
    onBascule();
  });
  return (
    <li className="validation">
      <div>
        <strong>{caisse.nom}</strong>{" "}
        <Chip tone={caisse.actif ? "ok" : "neutre"}>
          {t(caisse.actif ? "money.active" : "caisse.veille")}
        </Chip>
      </div>
      {peutGerer && (
        <Button
          variant="contour"
          disabled={occupe}
          aria-label={`${action} ${caisse.nom}`}
          onClick={() => void basculer()}
        >
          {action}
        </Button>
      )}
    </li>
  );
}

/** Un seuil entier (FCFA ou bouteilles) réglé par le PDG. */
function Seuil({
  libelle,
  actuel,
  peutModifier,
  envoyer,
}: Readonly<{
  libelle: string;
  actuel: number;
  peutModifier: boolean;
  envoyer: (valeur: number) => Promise<void>;
}>) {
  const { t } = useI18n();
  // Tant que rien n'est tapé, le champ suit la valeur lue (copie locale puis serveur).
  const [tape, setTape] = useState<string | null>(null);
  const saisie = tape ?? String(actuel);
  const [ok, setOk] = useState(false);
  const valeur = /^\d{1,9}$/u.test(saisie.trim()) ? Number(saisie) : null;
  const [enregistrer, occupe] = useEnvoi(async () => {
    if (valeur === null) return;
    await envoyer(valeur);
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (valeur !== null) void enregistrer();
  }

  return (
    <form onSubmit={soumettre} aria-label={libelle}>
      <Field
        label={libelle}
        inputMode="numeric"
        readOnly={!peutModifier}
        value={saisie}
        onChange={(e) => {
          setTape(e.target.value);
          setOk(false);
        }}
      />
      {valeur === null && (
        <p role="alert" className="connexion__erreur">
          {t("config.montant.invalide")}
        </p>
      )}
      {peutModifier && (
        <Button type="submit" disabled={valeur === null || occupe}>
          {t("config.enregistrer")}
        </Button>
      )}
      {ok && <output className="bloc">{t("config.enregistre")}</output>}
    </form>
  );
}

/** Caisses actives ou en veille, écart toléré à la clôture et seuil de stock bas. */
export function ConfigCaisses() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const pdg = profilsActifs.includes("pdg");
  const caisses = useCached("caisses", api.caisses, []);
  const cloture = useCached("seuil-cloture", api.seuilCloture, 0);
  const stock = useCached("seuil-stock", api.seuilStock, 0);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.config.caisses")}</h1>
        {!pdg && <p>{t("config.reserve.pdg")}</p>}
        <Etat {...caisses} vide={caisses.data.length === 0} messageVide={t("caisse.vide")}>
          <ul className="liste">
            {caisses.data.map((c) => (
              <Ligne
                key={c.id}
                caisse={c}
                peutGerer={pdg}
                onBascule={() =>
                  caisses.modifier((l) => l.map((x) => (x.id === c.id ? { ...x, actif: !x.actif } : x)))
                }
              />
            ))}
          </ul>
        </Etat>
      </section>
      <section className="carte">
        <h2>{t("config.seuils")}</h2>
        <Etat {...cloture}>
          <Seuil
            libelle={t("config.seuil.cloture")}
            actuel={cloture.data}
            peutModifier={pdg}
            envoyer={async (threshold) => {
              await ecrire({
                method: "PUT",
                path: "/cash/closure-threshold",
                label: t("config.seuil.cloture"),
                body: { threshold },
              });
              cloture.modifier(() => threshold);
            }}
          />
        </Etat>
        <Etat {...stock}>
          <Seuil
            libelle={t("config.seuil.stock")}
            actuel={stock.data}
            peutModifier={pdg}
            envoyer={async (threshold) => {
              await ecrire({
                method: "PUT",
                path: "/stock/thresholds",
                label: t("config.seuil.stock"),
                body: { threshold },
              });
              stock.modifier(() => threshold);
            }}
          />
        </Etat>
      </section>
    </div>
  );
}

export function ConfigLangue() {
  const { t } = useI18n();
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.config.langue")}</h1>
        <p>{t("config.langue.aide")}</p>
        <LanguageSwitch />
      </section>
    </div>
  );
}
