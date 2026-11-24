import { type FormEvent, useState } from "react";
import { api, type Fournisseur } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";

const MARQUES = ["OLA", "TRADEX", "BOCOM", "TOTAL", "STARGAS"];

/** Fiches fournisseurs : nom, téléphone, marques fournies. Une réception est toujours liée à un fournisseur. */
export function Fournisseurs() {
  const { t } = useI18n();
  const { data, modifier } = useCached("fournisseurs", api.fournisseurs, []);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [marques, setMarques] = useState<string[]>([]);
  const valide = nom.trim() !== "" && telephone.trim() !== "" && marques.length > 0;

  async function ajouter(event: FormEvent) {
    event.preventDefault();
    const fiche: Fournisseur = {
      id: crypto.randomUUID(),
      nom: nom.trim(),
      telephone: telephone.trim(),
      marques,
    };
    await ecrire({
      method: "POST",
      path: "/fournisseurs",
      label: `${t("gaz.fournisseur.nouveau")} : ${fiche.nom}`,
      body: fiche,
    });
    modifier((d) => [...d, fiche]);
    setNom("");
    setTelephone("");
    setMarques([]);
  }

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.fournisseurs.titre")}</h1>
        <Table
          caption={t("gaz.fournisseurs.titre")}
          colonnes={[t("gaz.nom"), t("gaz.telephone"), t("gaz.marques")]}
        >
          {data.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.nom}</th>
              <td>{f.telephone}</td>
              <td>{f.marques.join(", ")}</td>
            </tr>
          ))}
        </Table>
      </section>
      <form className="carte" onSubmit={ajouter}>
        <h2>{t("gaz.fournisseur.nouveau")}</h2>
        <Field label={t("gaz.nom")} value={nom} onChange={(e) => setNom(e.target.value)} />
        <Field
          label={t("gaz.telephone")}
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
        <fieldset className="vente__groupe">
          <legend className="champ__label">{t("gaz.marques")}</legend>
          <div className="cases">
            {MARQUES.map((m) => (
              <label key={m} className="cases__case">
                <input
                  type="checkbox"
                  checked={marques.includes(m)}
                  onChange={(e) =>
                    setMarques((l) => (e.target.checked ? [...l, m] : l.filter((x) => x !== m)))
                  }
                />
                {m}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={!valide}>
          {t("gaz.ajouter")}
        </Button>
      </form>
    </div>
  );
}
