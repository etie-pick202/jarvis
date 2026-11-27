import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { useGarde } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { useCaisses } from "./donnees.js";

const lire = (v: string): number | null => (/^\d{1,9}$/u.test(v.trim()) ? Number(v) : null);

/** Clôture du jour : comptage physique par caisse, écart affiché, justification demandée au-delà du seuil réglé par le PDG. */
export function Cloture() {
  const garde = useGarde();
  const { t } = useI18n();
  const { actives, lecture } = useCaisses();
  const { data: seuil } = useCached("seuil-cloture", api.seuilCloture, 0);
  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [justifs, setJustifs] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);

  const lignes = actives.map((c) => {
    const compte = lire(comptes[c.id] ?? "");
    return { caisse: c, compte, ecart: compte === null ? null : compte - c.solde };
  });
  const exige = (j: (typeof lignes)[number]) => j.ecart !== null && Math.abs(j.ecart) > seuil;
  const manque = (j: (typeof lignes)[number]) => exige(j) && (justifs[j.caisse.id] ?? "").trim() === "";
  const complet = lignes.length > 0 && lignes.every((j) => j.compte !== null && !manque(j));

  async function cloturer(event: FormEvent) {
    event.preventDefault();
    // Le serveur clôture une caisse à la fois : une écriture par caisse, chacune avec sa clé d'idempotence.
    for (const j of lignes) {
      if (j.compte === null) continue;
      const justification = justifs[j.caisse.id]?.trim();
      await ecrire({
        method: "POST",
        path: "/cash/closures",
        label: `${t("caisse.cloture.titre")} : ${j.caisse.nom}`,
        body: {
          registerId: j.caisse.id,
          countedAmount: j.compte,
          ...(j.ecart !== 0 && justification ? { justification } : {}),
        },
      });
    }
    setComptes({});
    setJustifs({});
    setOk(true);
  }

  return (
    <form className="carte page" onSubmit={garde(cloturer)}>
      <h1>{t("caisse.cloture.titre")}</h1>
      <p>
        {seuil === 0 ? t("caisse.cloture.aide") : `${t("caisse.cloture.aide.seuil")} ${formatFcfa(seuil)}.`}
      </p>
      <Etat {...lecture} vide={actives.length === 0} messageVide={t("caisse.vide")}>
        <Table
          cartes
          caption={t("caisse.cloture.titre")}
          colonnes={[t("caisse.caisse"), t("caisse.theorique"), t("caisse.compte"), t("caisse.ecart")]}
        >
          {lignes.map((j) => (
            <tr key={j.caisse.id}>
              <th scope="row">{j.caisse.nom}</th>
              <td>{formatFcfa(j.caisse.solde)}</td>
              <td className="cartes__saisie">
                <Field
                  label={`${j.caisse.nom} : ${t("caisse.compte")}`}
                  inputMode="numeric"
                  value={comptes[j.caisse.id] ?? ""}
                  onChange={(e) => {
                    setComptes((c) => ({ ...c, [j.caisse.id]: e.target.value }));
                    setOk(false);
                  }}
                />
                {exige(j) && (
                  <Field
                    label={`${j.caisse.nom} : ${t("caisse.justification")}`}
                    value={justifs[j.caisse.id] ?? ""}
                    onChange={(e) => setJustifs((x) => ({ ...x, [j.caisse.id]: e.target.value }))}
                  />
                )}
              </td>
              <td>
                {j.ecart === null ? null : (
                  <Chip tone={j.ecart === 0 ? "ok" : "danger"}>
                    {j.ecart === 0
                      ? t("gaz.conforme")
                      : `${j.ecart > 0 ? "+" : "−"}${formatFcfa(Math.abs(j.ecart))}`}
                  </Chip>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Etat>
      <Button type="submit" disabled={!complet}>
        {t("caisse.cloture.valider")}
      </Button>
      {ok && <p role="status">{t("caisse.cloture.ok")}</p>}
    </form>
  );
}
