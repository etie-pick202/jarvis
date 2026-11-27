import { Link } from "react-router";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import type { MessageKey } from "../i18n/fr.js";
import { useI18n } from "../i18n/index.js";
import { Chip } from "../ui/Chip.js";

interface Etape {
  cle: MessageKey;
  aide: MessageKey;
  faite: boolean;
  vers: string;
}

const lireCatalogue = async (signal: AbortSignal) => {
  const [marques, formats, prix] = await Promise.all([
    api.marquesConfig(signal),
    api.formatsConfig(signal),
    api.prixEnVigueur(signal),
  ]);
  return { marques: marques.length, formats: formats.length, prix: prix.length };
};
const lireQuartiers = async (signal: AbortSignal) => (await api.quartiers(signal)).length;
const lireComptes = async (signal: AbortSignal) => (await api.comptes(signal)).length;

/**
 * Premier démarrage : ce qu'il reste à saisir avant la première vente. L'avancement vient des données lues,
 * jamais d'un réglage local ; la liste disparaît quand tout est fait.
 */
export function MiseEnRoute() {
  const { t } = useI18n();
  const catalogue = useCached("route-catalogue", lireCatalogue, { marques: 0, formats: 0, prix: 0 });
  const quartiers = useCached("route-quartiers", lireQuartiers, 0);
  const comptes = useCached("route-comptes", lireComptes, 0);
  // Sans réponse (ni copie) pour chacune, on ne sait pas ce qui manque : on ne dit rien.
  if (!catalogue.charge || !quartiers.charge || !comptes.charge) return null;

  const { marques, formats, prix } = catalogue.data;
  const etapes: Etape[] = [
    {
      cle: "route.marques",
      aide: "route.marques.aide",
      faite: marques > 0 && formats > 0,
      vers: "/config/marques",
    },
    { cle: "route.prix", aide: "route.prix.aide", faite: prix > 0, vers: "/config/prix" },
    {
      cle: "route.quartiers",
      aide: "route.quartiers.aide",
      faite: quartiers.data > 0,
      vers: "/livre/quartiers",
    },
    // Le seul compte du départ est celui du PDG.
    {
      cle: "route.comptes",
      aide: "route.comptes.aide",
      faite: comptes.data > 1,
      vers: "/config/utilisateurs",
    },
  ];
  const faites = etapes.filter((e) => e.faite).length;
  if (faites === etapes.length) return null;
  const suivante = etapes.find((e) => !e.faite);

  return (
    <section className="carte route" aria-labelledby="titre-route">
      <h2 id="titre-route">{t("route.titre")}</h2>
      <p className="champ__aide">{`${faites} / ${etapes.length} · ${t("route.intro")}`}</p>
      <ol className="route__liste">
        {etapes.map((e, i) => (
          <li key={e.cle} className="route__etape">
            <span className={`route__rang${e.faite ? " route__rang--faite" : ""}`} aria-hidden="true">
              {e.faite ? "✓" : i + 1}
            </span>
            <span className="route__texte">
              <strong>{t(e.cle)}</strong>
              <small>{t(e.aide)}</small>
            </span>
            {e.faite ? (
              <Chip tone="ok">{t("route.fait")}</Chip>
            ) : (
              <Link
                className={`btn${e === suivante ? "" : " btn--contour"}`}
                to={e.vers}
                aria-label={`${t("route.completer")} : ${t(e.cle)}`}
              >
                {t("route.completer")}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
