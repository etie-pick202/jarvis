import { type CreateCanalSubscriberInput, toE164, type UpdateCanalSubscriberInput } from "@jarvis/shared";
import { type FormEvent, useId, useState } from "react";
import { api, type CanalFormula, type CanalSubscriber } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { useGarde } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { EtatChip } from "./EtatChip.js";
import { Formules } from "./Formules.js";
import { filtrerAbonnes } from "./regles.js";

interface Saisie {
  nom: string;
  telephone: string;
  decodeur: string;
  formule: string;
  echeance: string;
}

const VIDE: Saisie = { nom: "", telephone: "", decodeur: "", formule: "", echeance: "" };

const depuis = (a: CanalSubscriber): Saisie => ({
  nom: a.name,
  telephone: a.phone,
  decodeur: a.decoderNumber,
  formule: a.formulaId,
  echeance: a.expiresOn ?? "",
});

const valide = (s: Saisie) =>
  s.nom.trim() !== "" && toE164(s.telephone) !== null && s.decodeur.trim().length >= 3 && s.formule !== "";

/** Fiche abonné : nom, téléphone, décodeur, formule, échéance. Création et modification. */
function Fiche({
  formules,
  initiale,
  titre,
  onValider,
  onAnnuler,
}: {
  formules: readonly CanalFormula[];
  initiale: Saisie;
  titre: string;
  onValider: (s: Saisie) => Promise<void>;
  onAnnuler?: () => void;
}) {
  const garde = useGarde();
  const { t } = useI18n();
  const [s, setS] = useState(initiale);
  const idFormule = useId();
  const maj = (champ: keyof Saisie) => (valeur: string) => setS((x) => ({ ...x, [champ]: valeur }));

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    await onValider(s);
    setS(initiale);
  }

  return (
    <form className="carte" onSubmit={garde(envoyer)} aria-label={titre}>
      <h2>{titre}</h2>
      <Field label={t("canal.nom")} value={s.nom} onChange={(e) => maj("nom")(e.target.value)} />
      <Field
        label={t("canal.telephone")}
        type="tel"
        value={s.telephone}
        onChange={(e) => maj("telephone")(e.target.value)}
      />
      {s.telephone.trim() !== "" && toE164(s.telephone) === null && (
        <p role="alert" className="connexion__erreur">
          {t("saisie.telephone")}
        </p>
      )}
      <Field
        label={t("canal.decodeur")}
        value={s.decodeur}
        onChange={(e) => maj("decodeur")(e.target.value)}
      />
      <div className="champ">
        <label className="champ__label" htmlFor={idFormule}>
          {t("canal.formule")}
        </label>
        <select
          id={idFormule}
          className="champ__saisie"
          value={s.formule}
          onChange={(e) => maj("formule")(e.target.value)}
        >
          <option value="">—</option>
          {formules
            .filter((f) => f.active || f.id === s.formule)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {`${f.name} (${formatFcfa(f.price)})`}
              </option>
            ))}
        </select>
      </div>
      <Field
        label={t("canal.echeance")}
        type="date"
        value={s.echeance}
        onChange={(e) => maj("echeance")(e.target.value)}
      />
      <div className="vente__actions">
        <Button type="submit" disabled={!valide(s)}>
          {t("canal.enregistrer")}
        </Button>
        {onAnnuler && (
          <Button variant="contour" onClick={onAnnuler}>
            {t("vente.retour")}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Abonnés Canal+ : recherche, ajout, modification ; formules pour le PDG et le gérant. */
export function Abonnes() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("canal-abonnes", api.abonnesCanal, []);
  const { data: abonnes, modifier } = lecture;
  const formules = useCached("canal-formules", api.formulesCanal, []);
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<CanalSubscriber | null>(null);
  const gere = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const trouves = filtrerAbonnes(abonnes, recherche);
  const { visibles, restants, plus } = usePagination(trouves);

  const vue = (s: Saisie, base: CanalSubscriber | null): CanalSubscriber => {
    const f = formules.data.find((x) => x.id === s.formule);
    const memeEcheance = base !== null && base.expiresOn === (s.echeance || null);
    return {
      id: base?.id ?? crypto.randomUUID(),
      name: s.nom.trim(),
      phone: toE164(s.telephone) ?? s.telephone.trim(),
      decoderNumber: s.decodeur.trim(),
      formulaId: s.formule,
      formulaName: f?.name ?? "",
      formulaPrice: f?.price ?? 0,
      expiresOn: s.echeance || null,
      // Les jours restants sont calculés par le serveur : inconnus tant que la saisie n'est pas envoyée.
      daysLeft: memeEcheance ? base.daysLeft : null,
      active: base?.active ?? true,
      createdAt: base?.createdAt ?? new Date().toISOString(),
    };
  };

  const corps = (s: Saisie) => ({
    name: s.nom.trim(),
    phone: toE164(s.telephone) ?? s.telephone.trim(),
    decoderNumber: s.decodeur.trim(),
    formulaId: s.formule,
    expiresOn: s.echeance || null,
  });

  async function ajouter(s: Saisie) {
    const body: CreateCanalSubscriberInput = corps(s);
    await ecrire({
      method: "POST",
      path: "/canal/subscribers",
      label: `${t("canal.nouveau")} : ${body.name}`,
      body,
    });
    modifier((l) => [...l, vue(s, null)]);
  }

  async function changer(base: CanalSubscriber, body: UpdateCanalSubscriberInput, suivant: CanalSubscriber) {
    await ecrire({
      method: "PATCH",
      path: `/canal/subscribers/${base.id}`,
      label: `${t("canal.modifier")} : ${base.name}`,
      body,
    });
    modifier((l) => l.map((a) => (a.id === base.id ? suivant : a)));
    setEdition(null);
  }

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("canal.abonnes.titre")}</h1>
        <Field
          label={t("canal.recherche")}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <Etat {...lecture} vide={trouves.length === 0} messageVide={t("canal.aucun")}>
          <Table
            caption={t("canal.abonnes.titre")}
            colonnes={[
              t("canal.nom"),
              t("canal.decodeur"),
              t("canal.formule"),
              t("canal.echeance"),
              t("canal.actions"),
            ]}
          >
            {visibles.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  {a.name}
                  <br />
                  <a href={`tel:${a.phone}`}>{a.phone}</a>
                </th>
                <td>{a.decoderNumber}</td>
                <td>{a.formulaName}</td>
                <td>{a.active ? <EtatChip abonne={a} /> : t("canal.inactif")}</td>
                <td>
                  <div className="vente__actions">
                    <Button
                      variant="contour"
                      aria-label={`${t("canal.modifier")} ${a.name}`}
                      onClick={() => setEdition(a)}
                    >
                      {t("canal.modifier")}
                    </Button>
                    <Button
                      variant="contour"
                      aria-label={`${a.active ? t("canal.desactiver") : t("canal.reactiver")} ${a.name}`}
                      onClick={() => void changer(a, { active: !a.active }, { ...a, active: !a.active })}
                    >
                      {a.active ? t("canal.desactiver") : t("canal.reactiver")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
        </Etat>
      </section>
      {edition ? (
        <Fiche
          key={edition.id}
          titre={`${t("canal.modifier")} ${edition.name}`}
          formules={formules.data}
          initiale={depuis(edition)}
          onValider={(s) => changer(edition, corps(s), vue(s, edition))}
          onAnnuler={() => setEdition(null)}
        />
      ) : (
        <Fiche
          key="nouveau"
          titre={t("canal.nouveau")}
          formules={formules.data}
          initiale={VIDE}
          onValider={ajouter}
        />
      )}
      {gere && <Formules formules={formules.data} modifier={formules.modifier} />}
    </div>
  );
}
