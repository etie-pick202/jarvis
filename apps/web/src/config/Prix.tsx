import type { Brand, Format } from "@jarvis/shared";
import { type FormEvent, useId, useRef, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Suite } from "../ui/Suite.js";
import { Table } from "../ui/Table.js";
import { TitreFiche } from "../ui/TitreFiche.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";
import { lireFcfa } from "./tarifs.js";

function Choix({
  libelle,
  valeur,
  onChange,
  options,
  premier,
}: Readonly<{
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  options: readonly { id: string; nom: string }[];
  premier: string;
}>) {
  const id = useId();
  return (
    <div className="champ">
      <label className="champ__label" htmlFor={id}>
        {libelle}
      </label>
      <select id={id} className="champ__saisie" value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="">{premier}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Nouveau prix de recharge : pour tout un format, ou en exception pour une marque. L'ancien reste dans l'historique. */
function NouveauPrix({
  marques,
  formats,
  onFait,
}: Readonly<{ marques: readonly Brand[]; formats: readonly Format[]; onFait: () => void }>) {
  const { t } = useI18n();
  const [formatId, setFormatId] = useState("");
  const [marqueId, setMarqueId] = useState("");
  const [gaz, setGaz] = useState("");
  const [transport, setTransport] = useState("");
  const [cout, setCout] = useState("");
  const [ok, setOk] = useState(false);
  const montant = lireFcfa(gaz);
  const port = transport.trim() === "" ? 0 : lireFcfa(transport);
  const achat = cout.trim() === "" ? 0 : lireFcfa(cout);
  const format = formats.find((f) => f.id === formatId);
  const plafond = format?.priceCeiling ?? null;
  const depasse = montant !== null && plafond !== null && montant > plafond;
  const perte = montant !== null && port !== null && achat !== null && achat > montant + port;
  const pret =
    format !== undefined && montant !== null && montant > 0 && port !== null && achat !== null && !depasse;

  const [enregistrer, occupe] = useEnvoi(async () => {
    if (!format || montant === null || port === null || achat === null) return;
    await ecrire({
      method: "PUT",
      path: "/catalogue/prices",
      label: `${t("tarifs.prix.nouveau")} : ${format.label} ${formatFcfa(montant)}`,
      body: {
        formatId: format.id,
        ...(marqueId ? { brandId: marqueId } : {}),
        amount: montant,
        transportContribution: port,
        purchaseCost: achat,
      },
    });
    setGaz("");
    setTransport("");
    setCout("");
    setOk(true);
    onFait();
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void enregistrer();
  }

  const saisir = (f: (v: string) => void) => (e: { target: { value: string } }) => {
    f(e.target.value);
    setOk(false);
  };

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("tarifs.prix.nouveau")}>
      <h2>{t("tarifs.prix.nouveau")}</h2>
      <Choix
        libelle={t("tarifs.format.nom")}
        valeur={formatId}
        onChange={setFormatId}
        premier="—"
        options={formats.filter((f) => f.active).map((f) => ({ id: f.id, nom: f.label }))}
      />
      <Choix
        libelle={t("gaz.marque")}
        valeur={marqueId}
        onChange={setMarqueId}
        premier={t("tarifs.toutes")}
        options={marques.filter((m) => m.active).map((m) => ({ id: m.id, nom: m.name }))}
      />
      <Field label={t("tarifs.prix.gaz")} inputMode="numeric" value={gaz} onChange={saisir(setGaz)} />
      <Field
        label={t("tarifs.transport")}
        inputMode="numeric"
        value={transport}
        onChange={saisir(setTransport)}
      />
      <Field label={t("tarifs.cout")} inputMode="numeric" value={cout} onChange={saisir(setCout)} />
      {depasse && plafond !== null && (
        <p role="alert" className="connexion__erreur">
          {`${t("tarifs.depasse")} ${formatFcfa(plafond)}.`}
        </p>
      )}
      {perte && <output className="bloc">{t("tarifs.perte")}</output>}
      <Button type="submit" disabled={!pret || occupe}>
        {t("tarifs.prix.enregistrer")}
      </Button>
      {ok && <output className="bloc">{t("tarifs.prix.ok")}</output>}
    </form>
  );
}

/** Prix en vigueur par marque et format ; seul le PDG les change. */
export function Prix() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const prix = useCached("tarifs-prix", api.prixEnVigueur, []);
  const marques = useCached("tarifs-marques", api.marquesConfig, []);
  const formats = useCached("tarifs-formats", api.formatsConfig, []);
  const nom = (id: string) => marques.data.find((m) => m.id === id)?.name ?? "?";
  const format = (id: string) => formats.data.find((f) => f.id === id)?.label ?? "?";
  const fiche = useRef<HTMLDivElement>(null);

  return (
    <div className={profilsActifs.includes("pdg") ? "page page--panneau" : "page"}>
      <section className="carte">
        <TitreFiche
          titre={t("rub.config.prix")}
          bouton={profilsActifs.includes("pdg") ? t("tarifs.prix.nouveau") : undefined}
          fiche={fiche}
        />
        <Etat
          {...prix}
          vide={prix.data.length === 0}
          messageVide={t("tarifs.aucun.prix")}
          texteVide={t("vide.prix")}
          actionVide={<Suite vers="/config/marques" libelle={t("vide.vers.marques")} />}
        >
          <Table
            cartes
            caption={t("rub.config.prix")}
            colonnes={[
              t("gaz.marque"),
              t("tarifs.format.nom"),
              t("tarifs.prix.gaz"),
              t("tarifs.transport"),
              t("tarifs.cout"),
            ]}
          >
            {prix.data.map((p) => (
              <tr key={`${p.brandId}:${p.formatId}`}>
                <th scope="row">
                  <MarqueGaz nom={nom(p.brandId)} />
                </th>
                <td>{format(p.formatId)}</td>
                <td>{formatFcfa(p.amount)}</td>
                <td>{formatFcfa(p.transportContribution)}</td>
                <td>{formatFcfa(p.purchaseCost)}</td>
              </tr>
            ))}
          </Table>
        </Etat>
      </section>
      {profilsActifs.includes("pdg") ? (
        <div ref={fiche}>
          <NouveauPrix marques={marques.data} formats={formats.data} onFait={prix.recharger} />
        </div>
      ) : (
        <p>{t("tarifs.reserve")}</p>
      )}
    </div>
  );
}
