import type { CommissionSettings, FloatState, MobileOperator } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { CAISSE_FLOAT, lireTaux, OPERATEURS } from "./regles.js";

function CarteFloat({
  etat,
  peutGerer,
  onBascule,
}: Readonly<{ etat: FloatState; peutGerer: boolean; onBascule: (active: boolean) => void }>) {
  const { t } = useI18n();
  const nom = t(`money.operateur.${etat.operator}`);
  const [basculer, occupe] = useEnvoi(async () => {
    await ecrire({
      method: "PATCH",
      path: `/cash/registers/${CAISSE_FLOAT[etat.operator]}`,
      label: `${t(etat.active ? "canal.desactiver" : "money.activer")} : ${nom}`,
      body: { active: !etat.active },
    });
    onBascule(!etat.active);
  });
  return (
    <li className={`caisses__carte${etat.active ? "" : " caisses__carte--veille"}`}>
      <h2>{nom}</h2>
      <p className="caisses__solde">{formatFcfa(etat.float)}</p>
      <Chip tone={etat.active ? "ok" : "neutre"}>{t(etat.active ? "money.active" : "caisse.veille")}</Chip>
      {peutGerer && (
        <Button
          variant="contour"
          disabled={occupe}
          aria-label={`${t(etat.active ? "canal.desactiver" : "money.activer")} ${nom}`}
          onClick={() => void basculer()}
        >
          {t(etat.active ? "canal.desactiver" : "money.activer")}
        </Button>
      )}
    </li>
  );
}

/** Float de chaque opérateur ; le PDG active les caisses de transaction (en stand-by par défaut). */
export function Float() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("money-float", api.floats, []);
  const peutGerer = profilsActifs.includes("pdg");
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.money.float")}</h1>
        <p>{t("money.float.aide")}</p>
        <Etat {...lecture}>
          <ul className="caisses">
            {lecture.data.map((f) => (
              <CarteFloat
                key={f.operator}
                etat={f}
                peutGerer={peutGerer}
                onBascule={(active) =>
                  lecture.modifier((l) => l.map((x) => (x.operator === f.operator ? { ...x, active } : x)))
                }
              />
            ))}
          </ul>
        </Etat>
        {!peutGerer && <p>{t("money.activation.pdg")}</p>}
        <Link className="btn btn--contour" to="/caisse/transferts">
          {t("money.approvisionner")}
        </Link>
      </section>
    </div>
  );
}

const SENS = ["deposit", "withdrawal"] as const;
const enPourcent = (points: number) => String(points / 100);

function Grille({
  taux,
  peutModifier,
  onEnregistrer,
  onSaisie,
}: Readonly<{
  taux: CommissionSettings;
  peutModifier: boolean;
  onEnregistrer: (t: CommissionSettings) => void;
  onSaisie: () => void;
}>) {
  const { t } = useI18n();
  const initial = (o: MobileOperator) => ({
    deposit: enPourcent(taux[o].deposit),
    withdrawal: enPourcent(taux[o].withdrawal),
  });
  const [saisies, setSaisies] = useState(() => ({
    orange_money: initial("orange_money"),
    momo: initial("momo"),
  }));
  const lus = OPERATEURS.flatMap((o) => SENS.map((s) => lireTaux(saisies[o][s])));
  const valide = lus.every((v) => v !== null);

  const [enregistrer, occupe] = useEnvoi(async () => {
    const lire = (o: MobileOperator) => ({
      deposit: lireTaux(saisies[o].deposit) ?? 0,
      withdrawal: lireTaux(saisies[o].withdrawal) ?? 0,
    });
    const body: CommissionSettings = { orange_money: lire("orange_money"), momo: lire("momo") };
    await ecrire({ method: "PUT", path: "/money/commissions", label: t("rub.money.commissions"), body });
    onEnregistrer(body);
  });

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (valide) void enregistrer();
  }

  return (
    <form onSubmit={envoyer} aria-label={t("rub.money.commissions")}>
      {OPERATEURS.map((o) => (
        <fieldset key={o} className="reception__ligne">
          <legend className="champ__label">{t(`money.operateur.${o}`)}</legend>
          {SENS.map((s) => (
            <Field
              key={s}
              label={`${t(`money.operateur.${o}`)} : ${t(`money.sens.${s}`)} (%)`}
              inputMode="decimal"
              readOnly={!peutModifier}
              value={saisies[o][s]}
              onChange={(e) => {
                setSaisies((x) => ({ ...x, [o]: { ...x[o], [s]: e.target.value } }));
                onSaisie();
              }}
            />
          ))}
        </fieldset>
      ))}
      {!valide && (
        <p role="alert" className="connexion__erreur">
          {t("money.taux.invalide")}
        </p>
      )}
      {peutModifier ? (
        <Button type="submit" disabled={!valide || occupe}>
          {t("money.taux.enregistrer")}
        </Button>
      ) : (
        <p>{t("money.taux.pdg")}</p>
      )}
    </form>
  );
}

const SANS_TAUX: CommissionSettings = {
  orange_money: { deposit: 0, withdrawal: 0 },
  momo: { deposit: 0, withdrawal: 0 },
};

/** Commissions par opérateur et par sens : réglées par le PDG, consultées par le gérant. */
export function Commissions() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("money-commissions", api.commissions, SANS_TAUX);
  // Tenu ici : la grille repart de zéro quand les taux changent.
  const [ok, setOk] = useState(false);
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.money.commissions")}</h1>
        <p>{t("money.taux.aide")}</p>
        <Etat {...lecture}>
          {/* La clé repart des taux reçus quand ils changent. */}
          <Grille
            key={JSON.stringify(lecture.data)}
            taux={lecture.data}
            peutModifier={profilsActifs.includes("pdg")}
            onEnregistrer={(x) => {
              lecture.modifier(() => x);
              setOk(true);
            }}
            onSaisie={() => setOk(false)}
          />
          {ok && <p role="status">{t("money.taux.ok")}</p>}
        </Etat>
      </section>
    </div>
  );
}
