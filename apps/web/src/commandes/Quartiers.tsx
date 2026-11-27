import type { Neighbourhood, ShopSettings } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { corpsReglages, depuisReglages, erreurReglages, lireFrais, type SaisieReglages } from "./reglages.js";

const SANS_REGLAGES: ShopSettings = {
  openingHours: "",
  orderHours: "",
  phone: "",
  address: "",
  minimumOrder: 0,
  deliveryFeePerBottle: 0,
  deliveryFeeCeiling: null,
};

const CHAMPS: readonly (keyof SaisieReglages)[] = [
  "openingHours",
  "orderHours",
  "phone",
  "address",
  "omNumber",
  "momoNumber",
  "eveningCountTime",
  "minimumOrder",
  "deliveryFeePerBottle",
];

/** Réglages affichés sur la vitrine et frais de livraison par défaut. */
function Boutique({
  reglages,
  onFait,
}: Readonly<{ reglages: ShopSettings; onFait: (r: ShopSettings) => void }>) {
  const { t } = useI18n();
  // Tant que rien n'est tapé, les champs suivent la valeur lue (copie locale puis serveur).
  const [tape, setTape] = useState<Partial<SaisieReglages>>({});
  const [ok, setOk] = useState(false);
  const saisie = { ...depuisReglages(reglages), ...tape };
  const erreur = erreurReglages(saisie, reglages.deliveryFeeCeiling);

  const [enregistrer, occupe] = useEnvoi(async () => {
    const corps = corpsReglages(saisie);
    await ecrire({ method: "PUT", path: "/delivery/settings", label: t("quartiers.reglages"), body: corps });
    onFait({ ...reglages, ...corps });
    setTape({});
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (!erreur) void enregistrer();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("quartiers.reglages")}>
      <h2>{t("quartiers.reglages")}</h2>
      {CHAMPS.map((c) => (
        <Field
          key={c}
          label={t(`quartiers.champ.${c}`)}
          value={saisie[c]}
          onChange={(e) => {
            setTape((x) => ({ ...x, [c]: e.target.value }));
            setOk(false);
          }}
        />
      ))}
      {erreur && (
        <p role="alert" className="connexion__erreur">
          {t(erreur)}
        </p>
      )}
      <Button type="submit" disabled={erreur !== null || occupe}>
        {t("quartiers.enregistrer")}
      </Button>
      {ok && <output className="bloc">{t("quartiers.enregistre")}</output>}
    </form>
  );
}

/** Plafond des frais de livraison : réservé au PDG. */
function Plafond({
  actuel,
  onFait,
}: Readonly<{ actuel: number | null; onFait: (v: number | null) => void }>) {
  const { t } = useI18n();
  const [tape, setTape] = useState<string | null>(null);
  const saisie = tape ?? (actuel === null ? "" : String(actuel));
  const valeur = saisie.trim() === "" ? null : lireFrais(saisie);
  const invalide = saisie.trim() !== "" && valeur === null;
  const [enregistrer, occupe] = useEnvoi(async () => {
    await ecrire({
      method: "PUT",
      path: "/delivery/fee-ceiling",
      label: t("quartiers.plafond"),
      body: { ceiling: valeur },
    });
    onFait(valeur);
    setTape(null);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (!invalide) void enregistrer();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("quartiers.plafond")}>
      <Field
        label={t("quartiers.plafond")}
        inputMode="numeric"
        value={saisie}
        onChange={(e) => setTape(e.target.value)}
      />
      <p className="champ__aide">{t("quartiers.plafond.aide")}</p>
      <Button type="submit" disabled={invalide || occupe}>
        {t("quartiers.plafond.enregistrer")}
      </Button>
    </form>
  );
}

function Ajout({
  existants,
  plafond,
  onFait,
}: Readonly<{
  existants: readonly Neighbourhood[];
  plafond: number | null;
  onFait: (q: Neighbourhood) => void;
}>) {
  const { t } = useI18n();
  const [nom, setNom] = useState("");
  const [frais, setFrais] = useState("");
  const montant = lireFrais(frais);
  const pris = existants.some((q) => q.name.trim().toLowerCase() === nom.trim().toLowerCase());
  const depasse = montant !== null && plafond !== null && montant > plafond;
  const pret = nom.trim() !== "" && !pris && montant !== null && !depasse;

  const [ajouter, occupe] = useEnvoi(async () => {
    if (montant === null) return;
    const corps = { name: nom.trim(), feePerBottle: montant };
    await ecrire({
      method: "POST",
      path: "/delivery/neighbourhoods",
      label: `${t("quartiers.nouveau")} : ${corps.name}`,
      body: corps,
    });
    onFait({ id: crypto.randomUUID(), active: true, ...corps });
    setNom("");
    setFrais("");
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void ajouter();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("quartiers.nouveau")}>
      <h2>{t("quartiers.nouveau")}</h2>
      <Field label={t("quartiers.nom")} maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
      {nom.trim() !== "" && pris && (
        <p role="alert" className="connexion__erreur">
          {t("quartiers.pris")}
        </p>
      )}
      <Field
        label={t("quartiers.frais")}
        inputMode="numeric"
        value={frais}
        onChange={(e) => setFrais(e.target.value)}
      />
      {depasse && (
        <p role="alert" className="connexion__erreur">
          {t("quartiers.depasse")}
        </p>
      )}
      <Button type="submit" disabled={!pret || occupe}>
        {t("quartiers.ajouter")}
      </Button>
    </form>
  );
}

/** Quartiers livrés, frais de livraison et réglages de la boutique (PDG et gérant ; plafond au PDG). */
export function Quartiers() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const pdg = profilsActifs.includes("pdg");
  const gere = pdg || profilsActifs.includes("gerant");
  const quartiers = useCached("quartiers", api.quartiers, []);
  const reglages = useCached("reglages-boutique", api.reglagesBoutique, SANS_REGLAGES);
  const plafond = reglages.data.deliveryFeeCeiling;

  async function basculer(q: Neighbourhood) {
    await ecrire({
      method: "PATCH",
      path: `/delivery/neighbourhoods/${q.id}`,
      label: `${t(q.active ? "canal.desactiver" : "canal.reactiver")} : ${q.name}`,
      body: { active: !q.active },
    });
    quartiers.modifier((l) => l.map((x) => (x.id === q.id ? { ...x, active: !q.active } : x)));
  }

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.livre.quartiers")}</h1>
        <Etat
          {...quartiers}
          vide={quartiers.data.length === 0}
          messageVide={t("quartiers.aucun")}
          texteVide={t("vide.quartiers")}
        >
          <Table caption={t("rub.livre.quartiers")} colonnes={[t("quartiers.nom"), t("quartiers.frais"), ""]}>
            {quartiers.data.map((q) => (
              <tr key={q.id}>
                <th scope="row">
                  {q.name} {!q.active && <Chip>{t("canal.inactif")}</Chip>}
                </th>
                <td>{formatFcfa(q.feePerBottle)}</td>
                <td>
                  {gere && (
                    <Button
                      variant="contour"
                      aria-label={`${t(q.active ? "canal.desactiver" : "canal.reactiver")} ${q.name}`}
                      onClick={() => void basculer(q)}
                    >
                      {t(q.active ? "canal.desactiver" : "canal.reactiver")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Etat>
      </section>
      {gere && (
        <>
          <Ajout
            existants={quartiers.data}
            plafond={plafond}
            onFait={(q) => quartiers.modifier((l) => [...l, q])}
          />
          <Etat {...reglages}>
            <Boutique reglages={reglages.data} onFait={(r) => reglages.modifier(() => r)} />
            {pdg && (
              <Plafond
                actuel={plafond}
                onFait={(v) => reglages.modifier((r) => ({ ...r, deliveryFeeCeiling: v }))}
              />
            )}
          </Etat>
        </>
      )}
    </div>
  );
}
