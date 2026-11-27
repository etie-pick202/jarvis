import * as contrat from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";

type Comptes = contrat.SageAccounts;
type Caisse = keyof Comptes["registers"];
type Autre = Exclude<keyof Comptes, "registers">;

const CAISSES = Object.keys(contrat.DEFAULT_SAGE_ACCOUNTS.registers) as Caisse[];
const AUTRES = (Object.keys(contrat.DEFAULT_SAGE_ACCOUNTS) as (keyof Comptes)[]).filter(
  (c): c is Autre => c !== "registers",
);
const valide = (compte: string) => contrat.sageAccounts.shape.goods.safeParse(compte).success;

function Formulaire({
  actuel,
  onEnregistre,
}: Readonly<{ actuel: Comptes; onEnregistre: (c: Comptes) => void }>) {
  const { t } = useI18n();
  const [saisi, setSaisi] = useState<Comptes | null>(null);
  const [ok, setOk] = useState(false);
  const comptes = saisi ?? actuel;
  const juste = contrat.sageAccounts.safeParse(comptes).success;

  function changer(suite: Comptes) {
    setSaisi(suite);
    setOk(false);
  }

  const [enregistrer, occupe] = useEnvoi(async () => {
    await ecrire({ method: "PUT", path: "/reports/sage-accounts", label: t("sage.comptes"), body: comptes });
    onEnregistre(comptes);
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (juste) void enregistrer();
  }

  const champ = (cle: string, valeur: string, appliquer: (v: string) => Comptes) => (
    <Field
      key={cle}
      label={t(`sage.${cle}` as MessageKey)}
      maxLength={13}
      aria-invalid={!valide(valeur)}
      value={valeur}
      onChange={(e) => changer(appliquer(e.target.value.trim().toUpperCase()))}
    />
  );

  return (
    <form onSubmit={soumettre} aria-label={t("sage.comptes")}>
      {CAISSES.map((c) =>
        champ(c, comptes.registers[c], (v) => ({ ...comptes, registers: { ...comptes.registers, [c]: v } })),
      )}
      {AUTRES.map((c) => champ(c, comptes[c], (v) => ({ ...comptes, [c]: v })))}
      {!juste && (
        <p role="alert" className="connexion__erreur">
          {t("sage.invalide")}
        </p>
      )}
      <div className="vente__actions">
        <Button type="submit" disabled={!juste || occupe}>
          {t("config.enregistrer")}
        </Button>
      </div>
      {ok && <output className="bloc">{t("config.enregistre")}</output>}
    </form>
  );
}

/** Numéros de compte employés par l'export Sage ; réglage réservé au PDG. */
export function ComptesSage() {
  const { t } = useI18n();
  const lecture = useCached("comptes-sage", api.comptesSage, contrat.DEFAULT_SAGE_ACCOUNTS);
  return (
    <section className="carte">
      <h2>{t("sage.comptes")}</h2>
      <p>{t("sage.aide")}</p>
      <Etat {...lecture}>
        <Formulaire actuel={lecture.data} onEnregistre={(c) => lecture.modifier(() => c)} />
      </Etat>
    </section>
  );
}
