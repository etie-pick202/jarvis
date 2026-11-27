import { type FormEvent, useId, useState } from "react";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { useGarde } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { lireMontant, useCaisses } from "./donnees.js";

function ChoixCaisse({
  label,
  valeur,
  onChange,
  caisses,
}: {
  label: string;
  valeur: string;
  onChange: (id: string) => void;
  caisses: readonly { id: string; nom: string }[];
}) {
  const id = useId();
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="champ__saisie" value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {caisses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Dépense : une sortie d'argent d'une caisse, avec son libellé. */
export function Depenses() {
  const garde = useGarde();
  const { t } = useI18n();
  const { actives } = useCaisses();
  const [caisse, setCaisse] = useState("");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [ok, setOk] = useState(false);
  const somme = lireMontant(montant);
  const source = actives.find((c) => c.id === caisse);
  const insuffisant = source !== undefined && somme !== null && somme > source.solde;
  const valide = source !== undefined && somme !== null && !insuffisant && libelle.trim() !== "";

  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (!source || somme === null) return;
    await ecrire({
      method: "POST",
      path: "/cash/expenses",
      syncType: "expense",
      label: `${t("caisse.depense")} : ${libelle.trim()} (${formatFcfa(somme)})`,
      body: { registerId: source.id, amount: somme, label: libelle.trim() },
    });
    setMontant("");
    setLibelle("");
    setOk(true);
  }

  return (
    <form className="carte page page--etroite" onSubmit={garde(enregistrer)}>
      <h1>{t("caisse.depenses.titre")}</h1>
      <ChoixCaisse label={t("caisse.depuis")} valeur={caisse} onChange={setCaisse} caisses={actives} />
      <Field
        label={t("caisse.montant")}
        inputMode="numeric"
        value={montant}
        onChange={(e) => {
          setMontant(e.target.value);
          setOk(false);
        }}
      />
      <Field label={t("caisse.libelle")} value={libelle} onChange={(e) => setLibelle(e.target.value)} />
      {insuffisant && (
        <p role="alert" className="connexion__erreur">
          {`${t("caisse.insuffisant")} ${formatFcfa(source?.solde ?? 0)}`}
        </p>
      )}
      <Button type="submit" disabled={!valide}>
        {t("caisse.enregistrer")}
      </Button>
      {ok && <p role="status">{t("caisse.ok")}</p>}
    </form>
  );
}

/** Transfert entre deux caisses : le solde de chacune se met à jour. */
export function Transferts() {
  const garde = useGarde();
  const { t } = useI18n();
  const { actives } = useCaisses();
  const [de, setDe] = useState("");
  const [vers, setVers] = useState("");
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [ok, setOk] = useState(false);
  const somme = lireMontant(montant);
  const source = actives.find((c) => c.id === de);
  const insuffisant = source !== undefined && somme !== null && somme > source.solde;
  const valide = source !== undefined && vers !== "" && vers !== de && somme !== null && !insuffisant;

  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (!source || somme === null) return;
    await ecrire({
      method: "POST",
      path: "/cash/transfers",
      syncType: "transfer",
      label: `${t("caisse.transfert")} (${formatFcfa(somme)})`,
      body: {
        fromRegisterId: de,
        toRegisterId: vers,
        amount: somme,
        label: libelle.trim() || t("caisse.transfert"),
      },
    });
    setMontant("");
    setOk(true);
  }

  return (
    <form className="carte page page--etroite" onSubmit={garde(enregistrer)}>
      <h1>{t("caisse.transferts.titre")}</h1>
      <ChoixCaisse label={t("caisse.depuis")} valeur={de} onChange={setDe} caisses={actives} />
      <ChoixCaisse
        label={t("caisse.vers")}
        valeur={vers}
        onChange={setVers}
        caisses={actives.filter((c) => c.id !== de)}
      />
      <Field
        label={t("caisse.montant")}
        inputMode="numeric"
        value={montant}
        onChange={(e) => {
          setMontant(e.target.value);
          setOk(false);
        }}
      />
      <Field label={t("caisse.libelle")} value={libelle} onChange={(e) => setLibelle(e.target.value)} />
      {insuffisant && (
        <p role="alert" className="connexion__erreur">
          {`${t("caisse.insuffisant")} ${formatFcfa(source?.solde ?? 0)}`}
        </p>
      )}
      <Button type="submit" disabled={!valide}>
        {t("caisse.enregistrer")}
      </Button>
      {ok && <p role="status">{t("caisse.ok")}</p>}
    </form>
  );
}
