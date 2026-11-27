import type { PaymentMethod, PublicCatalogue } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Field } from "../ui/Field.js";
import { Segmented } from "../ui/Segmented.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { type Coordonnees, corps, type Echec, expliquer, manque, referenceClient } from "./commande.js";
import type { Total } from "./panier.js";

type Saisie = Omit<Coordonnees, "mode" | "quartierId">;

const VIDE: Saisie = {
  nom: "",
  telephone: "",
  autreQuartier: "",
  repere: "",
  position: null,
  paiement: "cash",
  reference: "",
};

/** Coordonnées, adresse et paiement. La commande exige le réseau : le client doit savoir qu'elle est bien partie. */
export function Formulaire({
  total,
  mode,
  quartierId,
  shop,
  onRecue,
  onRupture,
}: Readonly<{
  total: Total;
  mode: Coordonnees["mode"];
  quartierId: string;
  shop: PublicCatalogue["shop"];
  onRecue: (jeton: string) => void;
  onRupture: () => void;
}>) {
  const { t } = useI18n();
  const [saisie, setSaisie] = useState(VIDE);
  const [echec, setEchec] = useState<Echec | null>(null);
  const [positionRefusee, setPositionRefusee] = useState(false);
  const c: Coordonnees = { ...saisie, mode, quartierId };
  const absent = manque(c);
  const maj = (champ: keyof Saisie, valeur: string) => setSaisie((s) => ({ ...s, [champ]: valeur }));

  const [commander, occupe] = useEnvoi(async () => {
    setEchec(null);
    try {
      const ref = referenceClient();
      const recue = await api.commander(corps(c, total, ref), ref);
      onRecue(recue.trackingToken);
    } catch (e) {
      const raison = expliquer(e);
      setEchec(raison);
      if (raison.genre === "rupture") onRupture();
    }
  });

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (!absent) void commander();
  }

  function localiser() {
    setPositionRefusee(false);
    const refuser = () => setPositionRefusee(true);
    if (!navigator.geolocation) return refuser();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setSaisie((s) => ({ ...s, position: { latitude: coords.latitude, longitude: coords.longitude } })),
      refuser,
      { timeout: 10_000 },
    );
  }

  return (
    <form onSubmit={envoyer} aria-label={t("commande.titre")}>
      <h3>{t("commande.titre")}</h3>
      <Field
        label={t("commande.nom")}
        autoComplete="name"
        maxLength={120}
        value={saisie.nom}
        onChange={(e) => maj("nom", e.target.value)}
      />
      <Field
        label={t("commande.telephone")}
        type="tel"
        autoComplete="tel"
        maxLength={30}
        value={saisie.telephone}
        onChange={(e) => maj("telephone", e.target.value)}
      />
      {mode === "delivery" && (
        <>
          {!quartierId && (
            <Field
              label={t("commande.autre.quartier")}
              maxLength={80}
              value={saisie.autreQuartier}
              onChange={(e) => maj("autreQuartier", e.target.value)}
            />
          )}
          <Field
            label={t("commande.repere")}
            maxLength={300}
            value={saisie.repere}
            onChange={(e) => maj("repere", e.target.value)}
          />
          <Button variant="contour" onClick={localiser}>
            {t("commande.position")}
          </Button>
          {saisie.position && <output className="bloc">{t("commande.position.ok")}</output>}
          {positionRefusee && <output className="bloc">{t("commande.position.refus")}</output>}
        </>
      )}
      <Segmented<PaymentMethod>
        legend={t("vente.paiement")}
        value={saisie.paiement}
        onChange={(paiement) => setSaisie((s) => ({ ...s, paiement }))}
        options={[
          { value: "cash", label: t("paiement.especes") },
          { value: "orange_money", label: t("paiement.om") },
          { value: "momo", label: t("paiement.momo") },
        ]}
      />
      {saisie.paiement !== "cash" && (
        <>
          <p>
            {[
              t("commande.mobile.aide"),
              (saisie.paiement === "momo" ? shop.momoNumber : shop.omNumber) || shop.phone,
            ].join(" ")}
          </p>
          <Field
            label={t("commande.reference")}
            maxLength={60}
            value={saisie.reference}
            onChange={(e) => maj("reference", e.target.value)}
          />
        </>
      )}
      {absent && <p className="champ__aide">{t(absent)}</p>}
      {echec && (
        <p role="alert" className="connexion__erreur">
          {echec.message || t(`commande.echec.${echec.genre as "reseau" | "serveur"}`)}
        </p>
      )}
      <Button type="submit" block disabled={absent !== null || occupe}>
        {`${t("commande.envoyer")} ${formatFcfa(total.total)}`}
      </Button>
    </form>
  );
}
