import type { Role, UserAccount } from "@jarvis/shared";
import { type FormEvent, useState } from "react";
import { ApiError } from "../api/client.js";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { useEnvoi } from "../ui/useEnvoi.js";

const ROLES: readonly Role[] = ["pdg", "gerant", "caissier", "livreur"];
const MOT_DE_PASSE_MIN = 8;

function Profils({
  legende,
  choisis,
  verrou,
  onChange,
}: Readonly<{
  legende: string;
  choisis: readonly Role[];
  /** Profil qu'on ne peut pas retirer (le PDG ne se rétrograde pas). */
  verrou?: Role;
  onChange: (roles: Role[]) => void;
}>) {
  const { t } = useI18n();
  return (
    <fieldset className="vente__groupe">
      <legend className="champ__label">{legende}</legend>
      <div className="cases">
        {ROLES.map((r) => (
          <label key={r} className="cases__case">
            <input
              type="checkbox"
              checked={choisis.includes(r)}
              disabled={r === verrou}
              onChange={(e) => onChange(e.target.checked ? [...choisis, r] : choisis.filter((x) => x !== r))}
            />
            {t(`config.profil.${r}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Message d'un envoi : refus du serveur tel quel, panne signalée, succès confirmé. */
function useRetour() {
  const { t } = useI18n();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  async function tenter(action: () => Promise<void>, succes: string): Promise<boolean> {
    setRetour(null);
    try {
      await action();
      setRetour({ ok: true, texte: succes });
      return true;
    } catch (e) {
      const refus = e instanceof ApiError && e.status < 500 ? e.message : t("config.reseau");
      setRetour({ ok: false, texte: refus });
      return false;
    }
  }
  const vue = retour && (
    <output className={retour.ok ? "bloc" : "bloc connexion__erreur"} role={retour.ok ? undefined : "alert"}>
      {retour.texte}
    </output>
  );
  return { tenter, vue, effacer: () => setRetour(null) };
}

function Compte({
  compte,
  moi,
  onChange,
}: Readonly<{ compte: UserAccount; moi: boolean; onChange: (c: UserAccount) => void }>) {
  const { t } = useI18n();
  const [ouvert, setOuvert] = useState(false);
  const [roles, setRoles] = useState<Role[]>(compte.roles);
  const [motDePasse, setMotDePasse] = useState("");
  const { tenter, vue } = useRetour();
  const court = motDePasse !== "" && motDePasse.length < MOT_DE_PASSE_MIN;
  const change = roles.length !== compte.roles.length || roles.some((r) => !compte.roles.includes(r));
  const pret = roles.length > 0 && !court && (change || motDePasse !== "");

  const [basculer, bascule] = useEnvoi(async () => {
    await tenter(
      async () => onChange(await api.modifierCompte(compte.id, { active: !compte.active })),
      t("config.compte.ok"),
    );
  });
  const [enregistrer, envoi] = useEnvoi(async () => {
    const ok = await tenter(
      async () =>
        onChange(
          await api.modifierCompte(compte.id, {
            ...(change ? { roles } : {}),
            ...(motDePasse ? { password: motDePasse } : {}),
          }),
        ),
      t("config.compte.ok"),
    );
    if (ok) setMotDePasse("");
  });

  const modifier = t("canal.modifier");

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void enregistrer();
  }

  return (
    <li>
      <article className="carte" aria-label={compte.displayName}>
        <div className="livreur__ligne">
          <h2>{compte.displayName}</h2>
          <Chip tone={compte.active ? "ok" : "neutre"}>
            {t(compte.active ? "config.actif" : "canal.inactif")}
          </Chip>
        </div>
        <p className="champ__aide">
          {`${compte.username} · ${compte.roles.map((r) => t(`config.profil.${r}`)).join(", ")}`}
        </p>
        <div className="vente__actions">
          <Button variant="contour" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
            {t("canal.modifier")}
          </Button>
          {!moi && (
            <Button variant="contour" disabled={bascule} onClick={() => void basculer()}>
              {t(compte.active ? "canal.desactiver" : "canal.reactiver")}
            </Button>
          )}
        </div>
        {ouvert && (
          <form onSubmit={soumettre} aria-label={`${modifier} ${compte.displayName}`}>
            <Profils
              legende={t("config.droits")}
              choisis={roles}
              verrou={moi ? "pdg" : undefined}
              onChange={setRoles}
            />
            <Field
              label={t("config.nouveau.mot.de.passe")}
              type="password"
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            {court && <p className="champ__aide">{t("config.mot.de.passe.court")}</p>}
            <p className="champ__aide">{t("config.sessions")}</p>
            <Button type="submit" disabled={!pret || envoi}>
              {t("config.enregistrer")}
            </Button>
          </form>
        )}
        {vue}
      </article>
    </li>
  );
}

function Nouveau({ existants, onCree }: Readonly<{ existants: readonly UserAccount[]; onCree: () => void }>) {
  const { t } = useI18n();
  const [identifiant, setIdentifiant] = useState("");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const { tenter, vue, effacer } = useRetour();
  const login = identifiant.trim().toLowerCase();
  const pris = existants.some((c) => c.username.toLowerCase() === login);
  const pret =
    login.length >= 2 &&
    !pris &&
    nom.trim() !== "" &&
    motDePasse.length >= MOT_DE_PASSE_MIN &&
    roles.length > 0;

  const [creer, envoi] = useEnvoi(async () => {
    const ok = await tenter(async () => {
      await api.creerCompte({
        username: identifiant.trim(),
        displayName: nom.trim(),
        password: motDePasse,
        roles,
      });
    }, t("config.compte.cree"));
    if (!ok) return;
    setIdentifiant("");
    setNom("");
    setMotDePasse("");
    setRoles([]);
    onCree();
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void creer();
  }

  const saisir = (f: (v: string) => void) => (e: { target: { value: string } }) => {
    f(e.target.value);
    effacer();
  };

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("config.compte.nouveau")}>
      <h2>{t("config.compte.nouveau")}</h2>
      <Field
        label={t("login.identifiant")}
        autoComplete="off"
        value={identifiant}
        onChange={saisir(setIdentifiant)}
      />
      {pris && (
        <p role="alert" className="connexion__erreur">
          {t("config.identifiant.pris")}
        </p>
      )}
      <Field label={t("config.nom.affiche")} autoComplete="off" value={nom} onChange={saisir(setNom)} />
      <Field
        label={t("config.mot.de.passe")}
        type="password"
        autoComplete="new-password"
        value={motDePasse}
        onChange={saisir(setMotDePasse)}
      />
      <p className="champ__aide">{t("config.mot.de.passe.court")}</p>
      <Profils legende={t("config.droits")} choisis={roles} onChange={setRoles} />
      <Button type="submit" disabled={!pret || envoi}>
        {t("config.compte.creer")}
      </Button>
      {vue}
    </form>
  );
}

/**
 * Comptes et droits (PDG). Les mots de passe ne sont jamais gardés sur l'appareil : ces gestes demandent le réseau.
 */
export function Utilisateurs() {
  const { t } = useI18n();
  const { session, profilsActifs } = useSession();
  const lecture = useCached("config-comptes", api.comptes, []);

  if (!profilsActifs.includes("pdg")) {
    return (
      <div className="page">
        <section className="carte">
          <h1>{t("rub.config.utilisateurs")}</h1>
          <p>{t("config.reserve.pdg")}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t("rub.config.utilisateurs")}</h1>
      <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("config.aucun.compte")}>
        <ul className="liste">
          {lecture.data.map((c) => (
            <Compte
              key={c.id}
              compte={c}
              moi={c.id === session?.userId}
              onChange={(n) => lecture.modifier((l) => l.map((x) => (x.id === n.id ? n : x)))}
            />
          ))}
        </ul>
      </Etat>
      <Nouveau existants={lecture.data} onCree={lecture.recharger} />
    </div>
  );
}
