import type { CreateCanalFormulaInput } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import type { CanalFormula } from "../api/index.js";
import { lireMontant } from "../caisse/donnees.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { useGarde } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";

/** Formules Canal+ : prix, durée couverte et commission éventuelle. Réservé au PDG et au gérant. */
export function Formules({
  formules,
  modifier,
}: {
  formules: readonly CanalFormula[];
  modifier: (f: (l: CanalFormula[]) => CanalFormula[]) => void;
}) {
  const garde = useGarde();
  const { t } = useI18n();
  const [nom, setNom] = useState("");
  const [prix, setPrix] = useState("");
  const [mois, setMois] = useState("1");
  const [commission, setCommission] = useState("0");
  const montant = lireMontant(prix);
  const duree = lireMontant(mois);
  const com = /^\d+$/u.test(commission.trim()) ? Number(commission) : null;
  const valide = nom.trim() !== "" && montant !== null && duree !== null && duree <= 24 && com !== null;

  async function ajouter(event: FormEvent) {
    event.preventDefault();
    if (montant === null || duree === null || com === null) return;
    const body: CreateCanalFormulaInput = {
      name: nom.trim(),
      price: montant,
      months: duree,
      commission: com,
    };
    await ecrire({
      method: "POST",
      path: "/canal/formulas",
      label: `${t("canal.formule.nouvelle")} : ${body.name}`,
      body,
    });
    modifier((l) => [...l, { ...body, id: crypto.randomUUID(), active: true }]);
    setNom("");
    setPrix("");
  }

  async function basculer(f: CanalFormula) {
    await ecrire({
      method: "PATCH",
      path: `/canal/formulas/${f.id}`,
      label: `${f.active ? t("canal.desactiver") : t("canal.reactiver")} : ${f.name}`,
      body: { active: !f.active },
    });
    modifier((l) => l.map((x) => (x.id === f.id ? { ...x, active: !x.active } : x)));
  }

  return (
    <form className="carte" onSubmit={garde(ajouter)} aria-label={t("canal.formules")}>
      <h2>{t("canal.formules")}</h2>
      <Table
        cartes
        caption={t("canal.formules")}
        colonnes={[
          t("canal.formule"),
          t("canal.prix"),
          t("canal.mois"),
          t("canal.commission"),
          t("canal.actions"),
        ]}
      >
        {formules.map((f) => (
          <tr key={f.id}>
            <th scope="row">{f.name}</th>
            <td>{formatFcfa(f.price)}</td>
            <td>{f.months}</td>
            <td>{formatFcfa(f.commission)}</td>
            <td>
              <Button
                variant="contour"
                aria-label={`${f.active ? t("canal.desactiver") : t("canal.reactiver")} ${f.name}`}
                onClick={() => void basculer(f)}
              >
                {f.active ? t("canal.desactiver") : t("canal.reactiver")}
              </Button>
            </td>
          </tr>
        ))}
      </Table>
      <h3>{t("canal.formule.nouvelle")}</h3>
      <Field label={t("canal.formule.nom")} value={nom} onChange={(e) => setNom(e.target.value)} />
      <Field
        label={t("canal.prix")}
        inputMode="numeric"
        value={prix}
        onChange={(e) => setPrix(e.target.value)}
      />
      <Field
        label={t("canal.mois")}
        inputMode="numeric"
        value={mois}
        onChange={(e) => setMois(e.target.value)}
      />
      <Field
        label={t("canal.commission")}
        inputMode="numeric"
        value={commission}
        onChange={(e) => setCommission(e.target.value)}
      />
      <Button type="submit" disabled={!valide}>
        {t("canal.formule.ajouter")}
      </Button>
    </form>
  );
}
