import type { PublicCatalogue } from "@jarvis/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useI18n } from "../i18n/index.js";
import { LanguageSwitch } from "../i18n/LanguageSwitch.js";
import { allerA } from "../ui/amener.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Segmented } from "../ui/Segmented.js";
import { formatFcfa } from "../vente/regles.js";
import { LogoCocosab } from "../visuels/LogoCocosab.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";
import { commandeRecue, dernierSuivi } from "./commande.js";
import { Formulaire } from "./Formulaire.js";
import {
  calculer,
  changer,
  garderPanier,
  lirePanier,
  type Panier,
  type Produit,
  produits,
} from "./panier.js";

const VIDE: PublicCatalogue = {
  gas: [],
  articles: [],
  neighbourhoods: [],
  shop: {
    openingHours: "",
    orderHours: "",
    phone: "",
    address: "",
    minimumOrder: 0,
    deliveryFeePerBottle: 0,
  },
};

type Mode = "delivery" | "pickup";

function Rayon({
  titre,
  liste,
  panier,
  onChanger,
}: Readonly<{
  titre: string;
  liste: readonly Produit[];
  panier: Panier;
  onChanger: (cle: string, quantite: number) => void;
}>) {
  const { t } = useI18n();
  if (liste.length === 0) return null;
  return (
    <section className="carte">
      <h2>{titre}</h2>
      <ul className="liste">
        {liste.map((p) => {
          const quantite = panier[p.cle] ?? 0;
          return (
            <li key={p.cle} className="validation">
              <div>
                {p.marque && <MarqueGaz nom={p.marque} compacte />} <strong>{p.nom}</strong>
                <p>{formatFcfa(p.prix)}</p>
              </div>
              {p.disponible ? (
                <div className="vente__quantite">
                  <Button
                    variant="contour"
                    disabled={quantite === 0}
                    aria-label={`${t("vente.moins")} : ${p.nom}`}
                    onClick={() => onChanger(p.cle, quantite - 1)}
                  >
                    −
                  </Button>
                  <output aria-label={`${t("vente.quantite")} : ${p.nom}`}>{quantite}</output>
                  <Button
                    variant="noir"
                    aria-label={`${t("vente.plus")} : ${p.nom}`}
                    onClick={() => onChanger(p.cle, quantite + 1)}
                  >
                    +
                  </Button>
                </div>
              ) : (
                <Chip tone="danger">{t("vente.indisponible")}</Chip>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Vitrine publique, sans compte : produits, disponibilité, panier et total avec livraison. */
export function Boutique() {
  const { t } = useI18n();
  const lecture = useCached("boutique", api.vitrine, VIDE);
  const { shop, neighbourhoods } = lecture.data;
  const [panier, setPanier] = useState<Panier>(lirePanier);
  const [mode, setMode] = useState<Mode>("delivery");
  const [quartier, setQuartier] = useState("");
  const idQuartier = useId();
  const naviguer = useNavigate();
  const suivi = dernierSuivi();
  const blocPanier = useRef<HTMLElement>(null);
  useEffect(() => garderPanier(panier), [panier]);

  const liste = produits(lecture.data);
  const choisi = neighbourhoods.find((n) => n.id === quartier);
  const frais = mode === "pickup" ? 0 : (choisi?.feePerBottle ?? shop.deliveryFeePerBottle);
  const total = calculer(panier, liste, frais);
  const sousMinimum = total.lignes.length > 0 && total.produits < shop.minimumOrder;
  const modifier = (cle: string, quantite: number) => setPanier((p) => changer(p, cle, quantite));

  return (
    <div className="boutique">
      <header className="boutique__entete">
        <LogoCocosab sur="sombre" />
        <LanguageSwitch />
        <Link className="btn btn--contour" to="/connexion">
          {t("boutique.equipe")}
        </Link>
      </header>
      <main className="page boutique__page">
        <h1>{t("boutique.titre")}</h1>
        {suivi && <Link to={`/boutique/suivi/${suivi}`}>{t("commande.derniere")}</Link>}
        <Etat
          {...lecture}
          vide={liste.length === 0}
          messageVide={t("boutique.vide")}
          texteVide={t("vide.boutique")}
        >
          <p>
            {[shop.openingHours, shop.address].filter(Boolean).join(" · ")}
            {shop.phone && (
              <>
                {" · "}
                <a href={`tel:${shop.phone}`}>{shop.phone}</a>
              </>
            )}
          </p>
          <Rayon
            titre={t("boutique.gaz")}
            liste={liste.filter((p) => p.genre === "gaz")}
            panier={panier}
            onChanger={modifier}
          />
          <Rayon
            titre={t("boutique.articles")}
            liste={liste.filter((p) => p.genre === "article")}
            panier={panier}
            onChanger={modifier}
          />
          <section ref={blocPanier} className="carte boutique__panier" aria-labelledby="titre-panier">
            <h2 id="titre-panier">{t("boutique.panier")}</h2>
            {total.perdus.length > 0 && (
              <div className="bandeau" role="alert">
                <span>{t("boutique.perdus")}</span>
                <Button
                  variant="contour"
                  onClick={() => setPanier((p) => total.perdus.reduce((x, cle) => changer(x, cle, 0), p))}
                >
                  {t("boutique.retirer")}
                </Button>
              </div>
            )}
            {total.lignes.length === 0 ? (
              <p>{t("boutique.panier.vide")}</p>
            ) : (
              <>
                <Segmented<Mode>
                  legend={t("boutique.mode")}
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "delivery", label: t("vente.livraison") },
                    { value: "pickup", label: t("boutique.retrait") },
                  ]}
                />
                {mode === "delivery" && (
                  <div className="champ">
                    <label className="champ__label" htmlFor={idQuartier}>
                      {t("boutique.quartier")}
                    </label>
                    <select
                      id={idQuartier}
                      className="champ__saisie"
                      value={quartier}
                      onChange={(e) => setQuartier(e.target.value)}
                    >
                      <option value="">{t("boutique.quartier.autre")}</option>
                      {neighbourhoods.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <dl className="vente__recap">
                  {total.lignes.map((l) => (
                    <div key={l.produit.cle}>
                      <dt>{`${l.produit.nom} × ${l.quantite}`}</dt>
                      <dd>{formatFcfa(l.montant)}</dd>
                    </div>
                  ))}
                  {mode === "delivery" && (
                    <div>
                      <dt>{t("vente.livraison")}</dt>
                      <dd>{formatFcfa(total.livraison)}</dd>
                    </div>
                  )}
                  <div className="vente__total">
                    <dt>{t("vente.total")}</dt>
                    <dd>{formatFcfa(total.total)}</dd>
                  </div>
                </dl>
                {sousMinimum ? (
                  <p role="alert" className="connexion__erreur">
                    {`${t("boutique.minimum")} ${formatFcfa(shop.minimumOrder)}`}
                  </p>
                ) : (
                  <Formulaire
                    total={total}
                    mode={mode}
                    quartierId={choisi?.id ?? ""}
                    shop={shop}
                    onRupture={lecture.recharger}
                    onRecue={(jeton) => {
                      commandeRecue(jeton);
                      garderPanier({});
                      void naviguer(`/boutique/suivi/${jeton}`);
                    }}
                  />
                )}
              </>
            )}
          </section>
          {total.lignes.length > 0 && (
            <Button block className="boutique__barre" onClick={() => allerA(blocPanier.current, false)}>
              {`${t("boutique.voir.panier")} · ${formatFcfa(total.total)}`}
            </Button>
          )}
        </Etat>
      </main>
    </div>
  );
}
