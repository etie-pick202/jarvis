import { type FormEvent, useState } from "react";
import { api, type Client } from "../api/index.js";
import { classerProbleme } from "../api/problemes.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { lienWhatsappPour } from "../ui/telephone.js";
import { useEnvoi } from "../ui/useEnvoi.js";

/** Recherche d'un client dès les premières lettres de son nom : appel ou message en un geste. */
export function Clients() {
  const { t } = useI18n();
  const [saisie, setSaisie] = useState("");
  const [resultats, setResultats] = useState<Client[] | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  const [chercher, occupe] = useEnvoi(async () => {
    setEchec(null);
    try {
      setResultats(await api.clients(saisie.trim()));
    } catch (e) {
      setResultats(null);
      setEchec(t(`etat.${classerProbleme(e).genre}`));
    }
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (saisie.trim() !== "") void chercher();
  }

  return (
    <section className="carte page">
      <h1>{t("rub.vente.clients")}</h1>
      <form onSubmit={soumettre} aria-label={t("clients.recherche")}>
        <Field
          label={t("clients.recherche")}
          type="search"
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setResultats(null);
          }}
        />
        <Button type="submit" disabled={saisie.trim() === "" || occupe}>
          {t("clients.chercher")}
        </Button>
      </form>
      {echec && (
        <p role="alert" className="connexion__erreur">
          {echec}
        </p>
      )}
      {resultats?.length === 0 && <output className="bloc">{t("clients.aucun")}</output>}
      {resultats && resultats.length > 0 && (
        <Table cartes caption={t("rub.vente.clients")} colonnes={[t("gaz.client"), t("gaz.telephone"), ""]}>
          {resultats.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.nom}</th>
              <td>{c.telephone ? <a href={`tel:${c.telephone}`}>{c.telephone}</a> : "—"}</td>
              <td>
                {c.telephone && (
                  <a
                    className="btn btn--contour"
                    href={lienWhatsappPour(c.telephone, "")}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${t("vente.whatsapp")} ${c.nom}`}
                  >
                    {t("vente.whatsapp")}
                  </a>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
