import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";

/** Stock plein et vide par marque, alerte de seuil bas, confirmation du soir. */
export function StockGaz() {
  const { t } = useI18n();
  const { data, pret } = useCached("gaz-stock", api.gazStock, []);
  const pleines = data.reduce((n, s) => n + s.pleines, 0);
  const vides = data.reduce((n, s) => n + s.vides, 0);

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("gaz.stock.titre")}</h1>
        {!pret && data.length === 0 ? (
          <p role="status">{t("page.chargement")}</p>
        ) : (
          <Table
            caption={t("gaz.stock.titre")}
            colonnes={[t("gaz.marque"), t("gaz.pleines"), t("gaz.vides"), t("gaz.total"), ""]}
          >
            {data.map((s) => (
              <tr key={s.marque}>
                <th scope="row">{s.marque}</th>
                <td>{s.pleines}</td>
                <td>{s.vides}</td>
                <td>{s.pleines + s.vides}</td>
                <td>
                  {s.pleines === 0 ? (
                    <Chip tone="danger">{t("gaz.rupture")}</Chip>
                  ) : s.pleines <= s.seuil ? (
                    <Chip tone="alerte">{t("gaz.bas")}</Chip>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="tableau__total">
              <th scope="row">{t("gaz.total.general")}</th>
              <td>{pleines}</td>
              <td>{vides}</td>
              <td>{pleines + vides}</td>
              <td />
            </tr>
          </Table>
        )}
      </section>
      <ConfirmationSoir theorique={pleines + vides} />
    </div>
  );
}

/** Chaque soir : le gérant confirme le nombre de bouteilles ; un écart exige une justification. */
export function ConfirmationSoir({ theorique }: { theorique: number }) {
  const { t } = useI18n();
  const [compte, setCompte] = useState("");
  const [justification, setJustification] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const nombre = Number(compte);
  const saisi = compte.trim() !== "" && Number.isInteger(nombre) && nombre >= 0;
  const ecart = saisi ? nombre - theorique : 0;
  const pret = saisi && (ecart === 0 || justification.trim() !== "");

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    await ecrire({
      method: "POST",
      path: "/gaz/confirmation-soir",
      label: `${t("gaz.soir.titre")} : ${nombre}`,
      body: { compte: nombre, theorique, justification: ecart === 0 ? null : justification.trim() },
    });
    setEnvoye(true);
  }

  return (
    <form className="carte" onSubmit={envoyer}>
      <h2>{t("gaz.soir.titre")}</h2>
      <p>{`${t("gaz.soir.theorique")} : ${theorique}`}</p>
      <Field
        label={t("gaz.soir.compte")}
        inputMode="numeric"
        value={compte}
        onChange={(e) => {
          setCompte(e.target.value);
          setEnvoye(false);
        }}
      />
      {saisi && ecart !== 0 && (
        <>
          <p role="alert" className="connexion__erreur">
            {`${t("gaz.soir.ecart")} : ${ecart > 0 ? "+" : ""}${ecart}`}
          </p>
          <Field
            label={t("gaz.soir.justification")}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </>
      )}
      <Button type="submit" disabled={!pret}>
        {t("gaz.soir.confirmer")}
      </Button>
      {envoye && <p role="status">{t("gaz.soir.ok")}</p>}
    </form>
  );
}
