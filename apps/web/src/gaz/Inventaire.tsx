import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";

interface Comptage {
  pleines: string;
  vides: string;
}

const ecart = (compte: string, theorique: number): number | null =>
  compte.trim() === "" || !Number.isInteger(Number(compte)) ? null : Number(compte) - theorique;

/** Inventaire physique hebdomadaire : le gérant compte, l'écart se calcule seul, le PDG valide. */
export function Inventaire() {
  const { t } = useI18n();
  const { data: stock } = useCached("gaz-stock", api.gazStock, []);
  const [comptes, setComptes] = useState<Record<string, Comptage>>({});
  const [envoye, setEnvoye] = useState(false);
  const lignes = stock.map((s) => ({
    ...s,
    c: comptes[s.marque] ?? { pleines: "", vides: "" },
    ep: ecart((comptes[s.marque] ?? { pleines: "", vides: "" }).pleines, s.pleines),
    ev: ecart((comptes[s.marque] ?? { pleines: "", vides: "" }).vides, s.vides),
  }));
  const complet = lignes.length > 0 && lignes.every((l) => l.ep !== null && l.ev !== null);

  function maj(marque: string, champ: keyof Comptage, valeur: string) {
    setComptes((c) => ({
      ...c,
      [marque]: { ...(c[marque] ?? { pleines: "", vides: "" }), [champ]: valeur },
    }));
    setEnvoye(false);
  }

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    await ecrire({
      method: "POST",
      path: "/gaz/inventaires",
      label: t("gaz.inventaire.titre"),
      body: {
        lignes: lignes.map((l) => ({
          marque: l.marque,
          pleines: Number(l.c.pleines),
          vides: Number(l.c.vides),
          theoriquePleines: l.pleines,
          theoriqueVides: l.vides,
        })),
      },
    });
    setComptes({});
    setEnvoye(true);
  }

  return (
    <form className="carte" onSubmit={envoyer}>
      <h1>{t("gaz.inventaire.titre")}</h1>
      <p>{t("gaz.inventaire.aide")}</p>
      <Table
        caption={t("gaz.inventaire.titre")}
        colonnes={[t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.ecart.stock")]}
      >
        {lignes.map((l) => (
          <tr key={l.marque}>
            <th scope="row">{l.marque}</th>
            <td>
              <Field
                label={`${l.marque} : ${t("gaz.pleines")} (${l.pleines})`}
                inputMode="numeric"
                value={l.c.pleines}
                onChange={(e) => maj(l.marque, "pleines", e.target.value)}
              />
            </td>
            <td>
              <Field
                label={`${l.marque} : ${t("gaz.vides")} (${l.vides})`}
                inputMode="numeric"
                value={l.c.vides}
                onChange={(e) => maj(l.marque, "vides", e.target.value)}
              />
            </td>
            <td>
              {l.ep === null || l.ev === null ? null : (
                <Chip tone={l.ep === 0 && l.ev === 0 ? "ok" : "danger"}>
                  {l.ep === 0 && l.ev === 0 ? t("gaz.conforme") : `${fmt(l.ep)} / ${fmt(l.ev)}`}
                </Chip>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Button type="submit" disabled={!complet}>
        {t("gaz.inventaire.envoyer")}
      </Button>
      {envoye && <p role="status">{t("gaz.inventaire.ok")}</p>}
    </form>
  );
}

const fmt = (n: number) => `${n > 0 ? "+" : ""}${n}`;
