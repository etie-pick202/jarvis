import type { Brand, Format } from "@jarvis/shared";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { allerA } from "../ui/amener.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { Table } from "../ui/Table.js";
import { TitreFiche } from "../ui/TitreFiche.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";
import { lireFcfa, nomPris } from "./tarifs.js";

/** Marque : nom et valeur d'emballage d'une bouteille vide (laissée vide tant qu'elle n'est pas relevée). */
function FicheMarque({
  marque,
  existantes,
  onFait,
  onAnnuler,
}: Readonly<{
  marque?: Brand;
  existantes: readonly Brand[];
  onFait: (m: Brand) => void;
  onAnnuler: () => void;
}>) {
  const { t } = useI18n();
  const [nom, setNom] = useState(marque?.name ?? "");
  const [valeur, setValeur] = useState(
    marque && marque.packagingValueKnown !== false ? String(marque.packagingValue) : "",
  );
  const connue = valeur.trim() !== "";
  const montant = lireFcfa(valeur);
  const pris = nomPris(
    nom,
    existantes.filter((m) => m.id !== marque?.id).map((m) => m.name),
  );
  const pret = nom.trim() !== "" && !pris && (!connue || montant !== null);
  const titre = marque ? `${t("canal.modifier")} ${marque.name}` : t("tarifs.marque.nouvelle");

  const [enregistrer, occupe] = useEnvoi(async () => {
    const corps = {
      name: nom.trim(),
      packagingValueKnown: connue,
      ...(connue && montant !== null ? { packagingValue: montant } : {}),
    };
    await ecrire({
      method: marque ? "PATCH" : "POST",
      path: marque ? `/catalogue/brands/${marque.id}` : "/catalogue/brands",
      label: `${titre} : ${corps.name}`,
      body: corps,
    });
    onFait({
      id: marque?.id ?? crypto.randomUUID(),
      active: marque?.active ?? true,
      packagingValue: 0,
      ...corps,
    });
    if (!marque) {
      setNom("");
      setValeur("");
    }
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void enregistrer();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={titre}>
      <h2>{titre}</h2>
      <Field
        label={t("tarifs.marque.nom")}
        maxLength={60}
        value={nom}
        onChange={(e) => setNom(e.target.value)}
      />
      {pris && (
        <p role="alert" className="connexion__erreur">
          {t("tarifs.nom.pris")}
        </p>
      )}
      <Field
        label={t("tarifs.emballage")}
        inputMode="numeric"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
      />
      {connue && montant === null && (
        <p role="alert" className="connexion__erreur">
          {t("tarifs.montant.invalide")}
        </p>
      )}
      {!connue && <p className="champ__aide">{t("tarifs.emballage.inconnu")}</p>}
      <div className="vente__actions">
        <Button type="submit" disabled={!pret || occupe}>
          {t("tarifs.enregistrer")}
        </Button>
        {marque && (
          <Button variant="contour" onClick={onAnnuler}>
            {t("vente.retour")}
          </Button>
        )}
      </div>
    </form>
  );
}

function NouveauFormat({
  existants,
  onFait,
}: Readonly<{ existants: readonly Format[]; onFait: (f: Format) => void }>) {
  const { t } = useI18n();
  const [libelle, setLibelle] = useState("");
  const [poids, setPoids] = useState("");
  const [plafond, setPlafond] = useState("");
  const grammes = lireFcfa(poids);
  const max = plafond.trim() === "" ? null : lireFcfa(plafond);
  const pris = nomPris(
    libelle,
    existants.map((f) => f.label),
  );
  const pret =
    libelle.trim() !== "" &&
    !pris &&
    grammes !== null &&
    grammes > 0 &&
    (plafond.trim() === "" || max !== null);

  const [ajouter, occupe] = useEnvoi(async () => {
    if (grammes === null) return;
    const corps = { label: libelle.trim(), weightGrams: grammes, priceCeiling: max };
    await ecrire({
      method: "POST",
      path: "/catalogue/formats",
      label: `${t("tarifs.format.nouveau")} : ${corps.label}`,
      body: corps,
    });
    onFait({ id: crypto.randomUUID(), active: true, ...corps });
    setLibelle("");
    setPoids("");
    setPlafond("");
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void ajouter();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("tarifs.format.nouveau")}>
      <h2>{t("tarifs.format.nouveau")}</h2>
      <Field
        label={t("tarifs.format.nom")}
        maxLength={60}
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
      />
      {pris && (
        <p role="alert" className="connexion__erreur">
          {t("tarifs.nom.pris")}
        </p>
      )}
      <Field
        label={t("tarifs.poids")}
        inputMode="numeric"
        value={poids}
        onChange={(e) => setPoids(e.target.value)}
      />
      <Field
        label={t("tarifs.plafond")}
        inputMode="numeric"
        value={plafond}
        onChange={(e) => setPlafond(e.target.value)}
      />
      <Button type="submit" disabled={!pret || occupe}>
        {t("tarifs.format.ajouter")}
      </Button>
    </form>
  );
}

/** Marques et formats de gaz : le PDG ajoute, modifie, désactive ; le gérant consulte. */
export function Marques() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const pdg = profilsActifs.includes("pdg");
  const marques = useCached("tarifs-marques", api.marquesConfig, []);
  const formats = useCached("tarifs-formats", api.formatsConfig, []);
  const [edition, setEdition] = useState<string | null>(null);
  const choisie = marques.data.find((m) => m.id === edition);

  async function basculer(genre: "brands" | "formats", id: string, nom: string, actif: boolean) {
    await ecrire({
      method: "PATCH",
      path: `/catalogue/${genre}/${id}`,
      label: `${t(actif ? "canal.desactiver" : "canal.reactiver")} : ${nom}`,
      body: { active: !actif },
    });
    const inverser = <T extends { id: string; active: boolean }>(l: T[]) =>
      l.map((x) => (x.id === id ? { ...x, active: !actif } : x));
    if (genre === "brands") marques.modifier(inverser);
    else formats.modifier(inverser);
  }

  const fiche = useRef<HTMLDivElement>(null);
  const ficheFormat = useRef<HTMLDivElement>(null);
  // La fiche est après la liste sur téléphone : « Modifier » y conduit.
  useEffect(() => {
    if (edition) allerA(fiche.current);
  }, [edition]);
  return (
    <div className={pdg ? "page page--panneau" : "page"}>
      <section className="carte">
        <TitreFiche
          titre={t("rub.config.marques")}
          bouton={pdg ? t("tarifs.marque.nouvelle") : undefined}
          fiche={fiche}
        />
        {!pdg && <p>{t("tarifs.reserve")}</p>}
        <Etat
          {...marques}
          vide={marques.data.length === 0}
          messageVide={t("tarifs.aucune.marque")}
          texteVide={t(pdg ? "vide.marques" : "vide.pdg")}
        >
          <Table
            cartes
            caption={t("rub.config.marques")}
            colonnes={[t("gaz.marque"), t("tarifs.emballage"), ""]}
          >
            {marques.data.map((m) => (
              <tr key={m.id}>
                <th scope="row">
                  <MarqueGaz nom={m.name} /> {!m.active && <Chip>{t("canal.inactif")}</Chip>}
                </th>
                <td>
                  {m.packagingValueKnown === false ? (
                    <Chip tone="alerte">{t("tarifs.a.relever")}</Chip>
                  ) : (
                    formatFcfa(m.packagingValue)
                  )}
                </td>
                <td>
                  {pdg && (
                    <div className="vente__actions">
                      <Button
                        variant="contour"
                        aria-label={`${t("canal.modifier")} ${m.name}`}
                        onClick={() => setEdition(m.id)}
                      >
                        {t("canal.modifier")}
                      </Button>
                      <Button
                        variant="contour"
                        aria-label={`${t(m.active ? "canal.desactiver" : "canal.reactiver")} ${m.name}`}
                        onClick={() => void basculer("brands", m.id, m.name, m.active)}
                      >
                        {t(m.active ? "canal.desactiver" : "canal.reactiver")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Etat>
      </section>
      {pdg && (
        <div ref={fiche}>
          <FicheMarque
            key={choisie?.id ?? "nouvelle"}
            marque={choisie}
            existantes={marques.data}
            onFait={(n) => {
              marques.modifier((l) =>
                l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [...l, n],
              );
              setEdition(null);
            }}
            onAnnuler={() => setEdition(null)}
          />
        </div>
      )}
      <section className="carte">
        <TitreFiche
          niveau={2}
          titre={t("tarifs.formats")}
          bouton={pdg ? t("tarifs.format.nouveau") : undefined}
          fiche={ficheFormat}
        />
        <Etat
          {...formats}
          vide={formats.data.length === 0}
          messageVide={t("tarifs.aucun.format")}
          texteVide={t(pdg ? "vide.formats" : "vide.pdg")}
        >
          <Table
            cartes
            caption={t("tarifs.formats")}
            colonnes={[t("tarifs.format.nom"), t("tarifs.plafond"), ""]}
          >
            {formats.data.map((f) => (
              <tr key={f.id}>
                <th scope="row">
                  {f.label} {!f.active && <Chip>{t("canal.inactif")}</Chip>}
                </th>
                <td>{f.priceCeiling === null ? "—" : formatFcfa(f.priceCeiling)}</td>
                <td>
                  {pdg && (
                    <Button
                      variant="contour"
                      aria-label={`${t(f.active ? "canal.desactiver" : "canal.reactiver")} ${f.label}`}
                      onClick={() => void basculer("formats", f.id, f.label, f.active)}
                    >
                      {t(f.active ? "canal.desactiver" : "canal.reactiver")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Etat>
      </section>
      {pdg && (
        <div ref={ficheFormat}>
          <NouveauFormat existants={formats.data} onFait={(f) => formats.modifier((l) => [...l, f])} />
        </div>
      )}
    </div>
  );
}
