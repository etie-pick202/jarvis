import { type FormEvent, useState } from "react";
import { api, type Fournisseur } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";

/** Fiches fournisseurs : nom, téléphone, marques fournies. Une réception est toujours liée à un fournisseur. */
export function Fournisseurs() {
  const { t } = useI18n();
  const lecture = useCached("fournisseurs", api.fournisseurs, []);
  const { data, modifier } = lecture;
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const { data: marquesDispo } = useCached("marques", api.marques, []);
  const [choisies, setChoisies] = useState<string[]>([]);
  const valide = nom.trim() !== "" && choisies.length > 0;

  async function ajouter(event: FormEvent) {
    event.preventDefault();
    const fiche: Fournisseur = {
      id: crypto.randomUUID(),
      nom: nom.trim(),
      telephone: telephone.trim(),
      brandIds: choisies,
      marques: marquesDispo.filter((m) => choisies.includes(m.id)).map((m) => m.nom),
    };
    await ecrire({
      method: "POST",
      path: "/suppliers",
      label: `${t("gaz.fournisseur.nouveau")} : ${fiche.nom}`,
      body: {
        name: fiche.nom,
        ...(fiche.telephone ? { phone: fiche.telephone } : {}),
        brandIds: fiche.brandIds,
      },
    });
    modifier((d) => [...d, fiche]);
    setNom("");
    setTelephone("");
    setChoisies([]);
  }

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.fournisseurs.titre")}</h1>
        <Etat {...lecture} vide={data.length === 0} messageVide={t("gaz.fournisseurs.vide")}>
          <Table
            caption={t("gaz.fournisseurs.titre")}
            colonnes={[t("gaz.nom"), t("gaz.telephone"), t("gaz.marques")]}
          >
            {data.map((f) => (
              <tr key={f.id}>
                <th scope="row">{f.nom}</th>
                <td>{f.telephone}</td>
                <td className="marques-liste">
                  {f.marques.map((m) => (
                    <MarqueGaz key={m} nom={m} compacte />
                  ))}
                </td>
              </tr>
            ))}
          </Table>
        </Etat>
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
            {marquesDispo.map((m) => (
              <label key={m.id} className="cases__case">
                <input
                  type="checkbox"
                  checked={choisies.includes(m.id)}
                  onChange={(e) =>
                    setChoisies((l) => (e.target.checked ? [...l, m.id] : l.filter((x) => x !== m.id)))
                  }
                />
                <MarqueGaz nom={m.nom} compacte />
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
