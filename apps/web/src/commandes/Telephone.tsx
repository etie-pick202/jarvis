import type { PaymentMethod, PublicCatalogue } from "@jarvis/shared";
import { type FormEvent, useId, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { type Coordonnees, corps, expliquer, manque } from "../boutique/commande.js";
import { calculer, changer, type Panier, produits } from "../boutique/panier.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";

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

const COORDONNEES: Coordonnees = {
  nom: "",
  telephone: "",
  mode: "delivery",
  quartierId: "",
  autreQuartier: "",
  repere: "",
  position: null,
  paiement: "cash",
  reference: "",
};

/** Commande dictée au téléphone, saisie par le gérant : même parcours ensuite que les commandes en ligne. */
function Saisie({
  vitrine,
  onRecue,
}: Readonly<{ vitrine: PublicCatalogue; onRecue: (numero: string) => void }>) {
  const { t } = useI18n();
  const [c, setC] = useState(COORDONNEES);
  const [panier, setPanier] = useState<Panier>({});
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const [echec, setEchec] = useState<string | null>(null);
  const idQuartier = useId();
  const liste = produits(vitrine);
  const quartier = vitrine.neighbourhoods.find((q) => q.id === c.quartierId);
  const frais = c.mode === "pickup" ? 0 : (quartier?.feePerBottle ?? vitrine.shop.deliveryFeePerBottle);
  const total = calculer(panier, liste, frais);
  const absent = total.lignes.length === 0 ? ("telephone.manque.produit" as const) : manque(c);
  const maj = (champ: keyof Coordonnees) => (e: { target: { value: string } }) =>
    setC((x) => ({ ...x, [champ]: e.target.value }));

  const [envoyer, occupe] = useEnvoi(async () => {
    setEchec(null);
    try {
      // La même référence est renvoyée tant que le serveur n'a pas répondu : pas de commande en double.
      const recue = await api.commandeTelephone(corps(c, total, ref), ref);
      setC(COORDONNEES);
      setPanier({});
      setRef(crypto.randomUUID());
      onRecue(recue.number);
    } catch (e) {
      const raison = expliquer(e);
      setEchec(raison.message || t(`commande.echec.${raison.genre as "reseau" | "serveur"}`));
    }
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (!absent) void envoyer();
  }

  return (
    <form onSubmit={soumettre} aria-label={t("telephone.titre")}>
      <fieldset className="vente__groupe">
        <legend className="champ__label">{t("vente.article")}</legend>
        {liste.map((p) => (
          <div key={p.cle} className="validation">
            <span>{`${p.nom} · ${formatFcfa(p.prix)}`}</span>
            <Field
              label={`${t("vente.quantite")} : ${p.nom}`}
              inputMode="numeric"
              disabled={!p.disponible}
              value={String(panier[p.cle] ?? "")}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/gu, ""));
                setPanier((x) => changer(x, p.cle, n));
              }}
            />
          </div>
        ))}
      </fieldset>
      <Field label={t("gaz.client")} maxLength={120} value={c.nom} onChange={maj("nom")} />
      <Field
        label={t("gaz.telephone")}
        type="tel"
        maxLength={30}
        value={c.telephone}
        onChange={maj("telephone")}
      />
      <Segmented<Coordonnees["mode"]>
        legend={t("telephone.mode")}
        value={c.mode}
        onChange={(mode) => setC((x) => ({ ...x, mode }))}
        options={[
          { value: "delivery", label: t("vente.livraison") },
          { value: "pickup", label: t("boutique.retrait") },
        ]}
      />
      {c.mode === "delivery" && (
        <>
          <div className="champ">
            <label className="champ__label" htmlFor={idQuartier}>
              {t("boutique.quartier")}
            </label>
            <select
              id={idQuartier}
              className="champ__saisie"
              value={c.quartierId}
              onChange={maj("quartierId")}
            >
              <option value="">{t("boutique.quartier.autre")}</option>
              {vitrine.neighbourhoods.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
          {!c.quartierId && (
            <Field
              label={t("commande.autre.quartier")}
              maxLength={80}
              value={c.autreQuartier}
              onChange={maj("autreQuartier")}
            />
          )}
          <Field label={t("commande.repere")} maxLength={300} value={c.repere} onChange={maj("repere")} />
        </>
      )}
      <Segmented<PaymentMethod>
        legend={t("vente.paiement")}
        value={c.paiement}
        onChange={(paiement) => setC((x) => ({ ...x, paiement }))}
        options={[
          { value: "cash", label: t("paiement.especes") },
          { value: "orange_money", label: t("paiement.om") },
          { value: "momo", label: t("paiement.momo") },
        ]}
      />
      {c.paiement !== "cash" && (
        <Field
          label={t("commande.reference")}
          maxLength={60}
          value={c.reference}
          onChange={maj("reference")}
        />
      )}
      {absent && <p className="champ__aide">{t(absent)}</p>}
      {echec && (
        <p role="alert" className="connexion__erreur">
          {echec}
        </p>
      )}
      <Button type="submit" block disabled={absent !== null || occupe}>
        {`${t("telephone.enregistrer")} ${formatFcfa(total.total)}`}
      </Button>
    </form>
  );
}

export function CommandeTelephone({ onRecue }: Readonly<{ onRecue: () => void }>) {
  const { t } = useI18n();
  const lecture = useCached("boutique", api.vitrine, VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [numero, setNumero] = useState<string | null>(null);
  return (
    <section className="carte">
      <Button variant="noir" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {t("telephone.titre")}
      </Button>
      {numero && <output className="bloc">{`${t("telephone.ok")} ${numero}`}</output>}
      {ouvert && (
        <Etat {...lecture}>
          <Saisie
            vitrine={lecture.data}
            onRecue={(n) => {
              setNumero(n);
              setOuvert(false);
              onRecue();
            }}
          />
        </Etat>
      )}
    </section>
  );
}
