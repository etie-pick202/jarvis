import type { CountInput } from "@jarvis/shared";
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
import { MarqueGaz } from "../visuels/MarqueGaz.js";

interface Saisie {
  pleines: string;
  vides: string;
}

const VIDE: Saisie = { pleines: "", vides: "" };
const fmt = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const lireEntier = (v: string): number | null => (/^\d+$/u.test(v.trim()) ? Number(v) : null);

/**
 * Comptage physique des bouteilles par marque : inventaire hebdomadaire (le PDG valide) ou confirmation du soir.
 * L'écart avec le stock théorique est calculé ici pour l'affichage et par le serveur pour l'enregistrement ;
 * une justification est obligatoire dès qu'un écart apparaît.
 */
export function Comptage({ kind }: { kind: "weekly" | "evening" }) {
  const garde = useGarde();
  const { t } = useI18n();
  const lecture = useCached("gaz-stock", api.gazStock, []);
  const stock = lecture.data;
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [justification, setJustification] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const titre = kind === "weekly" ? t("gaz.inventaire.titre") : t("gaz.soir.titre");

  const lignes = stock.map((s) => {
    const cle = `${s.brandId}:${s.formatId}`;
    const c = saisies[cle] ?? VIDE;
    const pleines = lireEntier(c.pleines);
    const vides = lireEntier(c.vides);
    return {
      ...s,
      cle,
      c,
      pleines2: pleines,
      vides2: vides,
      ep: pleines === null ? null : pleines - s.pleines,
      ev: vides === null ? null : vides - s.vides,
    };
  });
  const complet = lignes.length > 0 && lignes.every((l) => l.ep !== null && l.ev !== null);
  const ecart = lignes.some((l) => (l.ep ?? 0) !== 0 || (l.ev ?? 0) !== 0);
  const valide = complet && (!ecart || justification.trim().length >= 5);

  function maj(cle: string, champ: keyof Saisie, valeur: string) {
    setSaisies((x) => ({ ...x, [cle]: { ...(x[cle] ?? VIDE), [champ]: valeur } }));
    setEnvoye(false);
  }

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    const corps: CountInput = {
      lines: lignes.map((l) => ({
        brandId: l.brandId,
        formatId: l.formatId,
        countedFull: l.pleines2 ?? 0,
        countedEmpty: l.vides2 ?? 0,
      })),
      ...(ecart ? { justification: justification.trim() } : {}),
    };
    await ecrire({
      method: "POST",
      path: `/inventory/${kind}`,
      syncType: kind === "weekly" ? "inventory_weekly" : "inventory_evening",
      label: titre,
      body: corps,
    });
    setSaisies({});
    setJustification("");
    setEnvoye(true);
  }

  return (
    <form className="carte" onSubmit={garde(envoyer)}>
      {kind === "weekly" ? <h1>{titre}</h1> : <h2>{titre}</h2>}
      <p>{kind === "weekly" ? t("gaz.inventaire.aide") : t("gaz.soir.aide")}</p>
      <Etat {...lecture} vide={stock.length === 0} messageVide={t("gaz.stock.vide")}>
        <Table
          caption={titre}
          colonnes={[t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.ecart.stock")]}
        >
          {lignes.map((l) => (
            <tr key={l.cle}>
              <th scope="row">
                <MarqueGaz nom={l.marque} />
              </th>
              <td>
                <Field
                  label={`${l.marque} : ${t("gaz.pleines")} (${l.pleines})`}
                  inputMode="numeric"
                  value={l.c.pleines}
                  onChange={(e) => maj(l.cle, "pleines", e.target.value)}
                />
              </td>
              <td>
                <Field
                  label={`${l.marque} : ${t("gaz.vides")} (${l.vides})`}
                  inputMode="numeric"
                  value={l.c.vides}
                  onChange={(e) => maj(l.cle, "vides", e.target.value)}
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
      </Etat>
      {complet && ecart && (
        <>
          <p role="alert" className="connexion__erreur">
            {t("gaz.soir.ecart")}
          </p>
          <Field
            label={t("gaz.soir.justification")}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </>
      )}
      <Button type="submit" disabled={!valide}>
        {kind === "weekly" ? t("gaz.inventaire.envoyer") : t("gaz.soir.confirmer")}
      </Button>
      {envoye && <p role="status">{kind === "weekly" ? t("gaz.inventaire.ok") : t("gaz.soir.ok")}</p>}
    </form>
  );
}

export const Inventaire = () => <Comptage kind="weekly" />;
