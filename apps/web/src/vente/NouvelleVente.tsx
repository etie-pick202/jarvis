import { useId, useState } from "react";
import type { Article, Client } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { enqueue, flush } from "../offline/outbox.js";
import { sendOperation } from "../offline/sync.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";
import { Squelette } from "../ui/Squelette.js";
import { Suite } from "../ui/Suite.js";
import { useGarde } from "../ui/useEnvoi.js";
import { FormatBouteille } from "../visuels/FormatBouteille.js";
import { EtatVide } from "../visuels/Illustration.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";
import { useCatalogue, useSuggestions } from "./donnees.js";
import { Recu, type RecuVente } from "./Recu.js";
import {
  corpsVente,
  detailGaz,
  ecartEmballage,
  formatFcfa,
  fraisLivraison,
  type Paiement,
  type Panier,
  type Reception,
  total,
  venteAutorisee,
} from "./regles.js";

const CLIENT_COMPTOIR = "Client comptoir";

/** Nouvelle vente en trois écrans : article, quantité, moyen de paiement. */
export function NouvelleVente() {
  const garde = useGarde();
  const { t } = useI18n();
  const { articles, pret, hors, consommer } = useCatalogue();
  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [article, setArticle] = useState<Article | null>(null);
  const [nom, setNom] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [echange, setEchange] = useState(false);
  const [rapportee, setRapportee] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [reception, setReception] = useState<Reception>("comptoir");
  const [paiement, setPaiement] = useState<Paiement>("especes");
  const [recu, setRecu] = useState<RecuVente | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const idRapportee = useId();

  const gaz = article?.genre === "gaz";
  const marques = articles.filter((a) => a.genre === "gaz" && a.marque);
  const suggestions = useSuggestions(nom, client === null);
  const nomFinal = nom.trim() || (gaz ? "" : CLIENT_COMPTOIR);
  const echangeValide = !echange || rapportee !== "";
  const etape1Ok = article !== null && article.stock > 0 && nomFinal !== "" && echangeValide;
  const panier: Panier | null = article
    ? { article, quantite, reception, echange: gaz && echange ? rapportee : null }
    : null;
  const ecart =
    article && echange && rapportee
      ? ecartEmballage(article, marques.find((m) => m.marque === rapportee) ?? article)
      : null;

  function reinitialiser() {
    setEtape(1);
    setArticle(null);
    setNom("");
    setClient(null);
    setEchange(false);
    setRapportee("");
    setQuantite(1);
    setReception("comptoir");
    setPaiement("especes");
    setRecu(null);
  }

  async function encaisser() {
    if (!panier || !venteAutorisee(panier.article, panier.quantite)) return;
    setEnvoi(true);
    // Enregistrée d'abord sur l'appareil (hors ligne d'abord), puis envoyée dès que le réseau le permet.
    const op = await enqueue({
      method: "POST",
      path: "/sales",
      syncType: "sale",
      label: `${panier.article.nom} × ${panier.quantite} · ${nomFinal}`,
      body: corpsVente(panier, nomFinal, paiement, marques),
    });
    consommer(panier.article.id, panier.quantite);
    void flush(sendOperation);
    setRecu({
      numero: `L-${op.id.slice(0, 6).toUpperCase()}`,
      date: new Date(op.createdAt),
      client: nomFinal,
      telephone: client?.telephone,
      panier,
      paiement,
    });
    setEnvoi(false);
  }

  if (recu) return <Recu recu={recu} onNouvelle={reinitialiser} />;
  if (!pret) return <Squelette />;
  if (articles.length === 0) {
    return (
      <section className="carte vente">
        <EtatVide
          genre={hors ? "hors-ligne" : "vide"}
          niveau={1}
          titre={t(hors ? "vide.catalogue.hors" : "vide.vente.titre")}
          texte={t(hors ? "vide.catalogue.hors.texte" : "vide.vente")}
        >
          {!hors && <Suite vers="/config/prix" libelle={t("vide.vers.prix")} />}
        </EtatVide>
      </section>
    );
  }

  const detail = article ? detailGaz(article) : null;
  return (
    <section className="carte vente" aria-labelledby="titre-vente">
      <h1 id="titre-vente">{t("vente.titre")}</h1>
      <p className="vente__etape">{`${t("vente.etape")} ${etape} / 3`}</p>

      {etape === 1 && (
        <>
          <fieldset className="vente__groupe">
            <legend className="champ__label">{t("vente.article")}</legend>
            <div className="vente__articles">
              {articles.map((a) => (
                <label
                  key={a.id}
                  className={`vente__article${a.stock === 0 ? " vente__article--rupture" : ""}`}
                >
                  <input
                    type="radio"
                    name="article"
                    checked={article?.id === a.id}
                    disabled={a.stock === 0}
                    onChange={() => {
                      setArticle(a);
                      setQuantite(1);
                      if (a.genre !== "gaz") setEchange(false);
                    }}
                  />
                  {a.genre === "gaz" && a.marque ? (
                    <span className="vente__nom">
                      <MarqueGaz nom={a.marque} compacte />
                      {a.formatLibelle && <FormatBouteille libelle={a.formatLibelle} />}
                    </span>
                  ) : (
                    <span>{a.nom}</span>
                  )}
                  <strong>{formatFcfa(a.prix)}</strong>
                  {a.stock === 0 ? <Chip tone="danger">{t("vente.indisponible")}</Chip> : null}
                </label>
              ))}
            </div>
          </fieldset>

          {article && (
            <div className="vente__client">
              <Field
                label={gaz ? t("vente.client.obligatoire") : t("vente.client.facultatif")}
                required={gaz}
                autoComplete="off"
                value={nom}
                onChange={(e) => {
                  setNom(e.target.value);
                  setClient(null);
                }}
              />
              {suggestions.length > 0 && (
                <ul className="vente__suggestions" aria-label={t("vente.suggestions")}>
                  {suggestions.map((c) => (
                    <li key={c.id}>
                      <Button
                        variant="contour"
                        onClick={() => {
                          setClient(c);
                          setNom(c.nom);
                        }}
                      >
                        {c.nom}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {gaz && (
            <div className="vente__echange">
              <label className="vente__bascule">
                <input type="checkbox" checked={echange} onChange={(e) => setEchange(e.target.checked)} />
                {t("vente.echange")}
              </label>
              {echange && (
                <div className="champ">
                  <label className="champ__label" htmlFor={idRapportee}>
                    {t("vente.rapportee")}
                  </label>
                  <select
                    id={idRapportee}
                    className="champ__saisie"
                    value={rapportee}
                    onChange={(e) => setRapportee(e.target.value)}
                  >
                    <option value="">—</option>
                    {marques.map((m) => (
                      <option key={m.id} value={m.marque}>
                        {m.marque}
                      </option>
                    ))}
                  </select>
                  {ecart === null && rapportee !== "" && rapportee !== article?.marque && (
                    <p role="status">{t("vente.ecart.inconnu")}</p>
                  )}
                  {ecart !== null && (
                    <p role="status">
                      {ecart >= 0 ? t("vente.gain") : t("vente.perte")} : {formatFcfa(Math.abs(ecart))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="action-fixe">
            {panier && (
              <p className="action-fixe__total">
                <span>{t("vente.total")}</span>
                <strong>{formatFcfa(total(panier))}</strong>
              </p>
            )}
            <Button block disabled={!etape1Ok} onClick={() => setEtape(2)}>
              {t("vente.suivant")}
            </Button>
          </div>
        </>
      )}

      {etape === 2 && article && (
        <>
          <fieldset className="champ vente__groupe">
            <legend className="champ__label">{t("vente.quantite")}</legend>
            <div className="vente__quantite">
              <Button
                variant="contour"
                aria-label={t("vente.moins")}
                onClick={() => setQuantite((q) => Math.max(1, q - 1))}
              >
                −
              </Button>
              <output aria-live="polite">{quantite}</output>
              <Button variant="noir" aria-label={t("vente.plus")} onClick={() => setQuantite((q) => q + 1)}>
                +
              </Button>
            </div>
            {!venteAutorisee(article, quantite) && (
              <p role="alert" className="connexion__erreur">
                {`${t("vente.stock.max")} ${article.stock}`}
              </p>
            )}
          </fieldset>
          <Segmented<Reception>
            legend={t("vente.reception")}
            value={reception}
            onChange={setReception}
            options={[
              { value: "comptoir", label: t("vente.comptoir") },
              { value: "livraison", label: t("vente.livraison") },
            ]}
          />
          <div className="vente__actions action-fixe">
            <Button variant="contour" onClick={() => setEtape(1)}>
              {t("vente.retour")}
            </Button>
            <Button disabled={!venteAutorisee(article, quantite)} onClick={() => setEtape(3)}>
              {t("vente.suivant")}
            </Button>
          </div>
        </>
      )}

      {etape === 3 && article && panier && (
        <>
          <Segmented<Paiement>
            legend={t("vente.paiement")}
            value={paiement}
            onChange={setPaiement}
            options={[
              { value: "especes", label: t("paiement.especes") },
              { value: "om", label: t("paiement.om") },
              { value: "momo", label: t("paiement.momo") },
            ]}
          />
          <dl className="vente__recap">
            {detail ? (
              <>
                <div>
                  <dt>{`${article.nom} × ${quantite}`}</dt>
                  <dd>{formatFcfa(detail.gaz * quantite)}</dd>
                </div>
                <div>
                  <dt>{t("vente.transport")}</dt>
                  <dd>{formatFcfa(detail.transport * quantite)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{`${article.nom} × ${quantite}`}</dt>
                <dd>{formatFcfa(article.prix * quantite)}</dd>
              </div>
            )}
            {fraisLivraison(panier) > 0 && (
              <div>
                <dt>{t("vente.livraison")}</dt>
                <dd>{formatFcfa(fraisLivraison(panier))}</dd>
              </div>
            )}
            <div className="vente__total">
              <dt>{t("vente.total")}</dt>
              <dd>{formatFcfa(total(panier))}</dd>
            </div>
          </dl>
          <div className="vente__actions action-fixe">
            <Button variant="contour" onClick={() => setEtape(2)}>
              {t("vente.retour")}
            </Button>
            <Button disabled={envoi} onClick={() => void garde(encaisser)()}>
              {`${t("vente.encaisser")} ${formatFcfa(total(panier))}`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
