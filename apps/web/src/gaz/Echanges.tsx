import { type FormEvent, useCallback, useState } from "react";
import { ApiError } from "../api/client.js";
import { api, type Echange } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { useI18n } from "../i18n/index.js";
import { useAmener } from "../ui/amener.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { MarqueGaz } from "../visuels/MarqueGaz.js";

/**
 * Solder un écart « à régulariser » : le serveur le calcule avec les valeurs désormais connues des marques ; si elles
 * manquent encore, le PDG saisit le montant.
 */
function Solde({ echange, onFait }: Readonly<{ echange: Echange; onFait: () => void }>) {
  const { t } = useI18n();
  const [saisie, setSaisie] = useState("");
  const [refus, setRefus] = useState<string | null>(null);
  const montant = /^-?\d{1,9}$/u.test(saisie.trim()) ? Number(saisie) : null;
  const invalide = saisie.trim() !== "" && montant === null;
  const [solder, occupe] = useEnvoi(async () => {
    setRefus(null);
    try {
      await api.solderEcart(echange.venteId, montant ?? undefined);
      onFait();
    } catch (e) {
      setRefus(e instanceof ApiError && e.status < 500 ? e.message : t("ecarts.reseau"));
    }
  });

  const bloc = useAmener<HTMLFormElement>();

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (!invalide) void solder();
  }

  return (
    <form
      ref={bloc}
      className="carte"
      onSubmit={soumettre}
      aria-label={`${t("ecarts.solder")} ${echange.client}`}
    >
      <h2>{`${t("ecarts.solder")} : ${echange.client}`}</h2>
      <p>{t("ecarts.aide")}</p>
      <Field label={t("ecarts.montant")} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
      {invalide && (
        <p role="alert" className="connexion__erreur">
          {t("ecarts.invalide")}
        </p>
      )}
      {refus && (
        <p role="alert" className="connexion__erreur">
          {refus}
        </p>
      )}
      <Button type="submit" disabled={invalide || occupe}>
        {t("ecarts.valider")}
      </Button>
    </form>
  );
}

function Liste({ attente, basculer }: Readonly<{ attente: boolean; basculer: (v: boolean) => void }>) {
  const { t, lang } = useI18n();
  const { profilsActifs } = useSession();
  const charger = useCallback((s: AbortSignal) => api.pageEchanges(attente, s), [attente]);
  const lecture = useCached(`gaz-echanges-${attente ? "attente" : "tous"}`, charger, {
    echanges: [],
    aRegulariser: 0,
  });
  const { echanges, aRegulariser } = lecture.data;
  const { visibles, restants, plus } = usePagination(echanges);
  const [choisi, setChoisi] = useState<string | null>(null);
  const echange = echanges.find((e) => e.id === choisi && e.ecart === null);
  const pdg = profilsActifs.includes("pdg");
  const quand = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <section className="carte">
        <h1>{t("gaz.echanges.titre")}</h1>
        <label className="vente__bascule">
          <input type="checkbox" checked={attente} onChange={(e) => basculer(e.target.checked)} />
          {t("ecarts.seulement")}
        </label>
        <Etat {...lecture} vide={echanges.length === 0} messageVide={t("gaz.echanges.vide")}>
          {aRegulariser > 0 && <output className="bloc">{`${t("ecarts.nombre")} : ${aRegulariser}`}</output>}
          <Table
            cartes
            caption={t("gaz.echanges.titre")}
            colonnes={[t("gaz.heure"), t("gaz.client"), t("gaz.remise"), t("gaz.rapportee"), t("gaz.ecart")]}
          >
            {visibles.map((e) => (
              <tr key={e.id}>
                <td>{quand.format(new Date(e.date))}</td>
                <td>{e.client}</td>
                <td>
                  <MarqueGaz nom={e.remise} />
                </td>
                <td>
                  <MarqueGaz nom={e.rapportee} />
                </td>
                <td>
                  {e.ecart === null ? (
                    <Chip tone="alerte">{t("gaz.a.regulariser")}</Chip>
                  ) : (
                    <Chip tone={e.ecart >= 0 ? "ok" : "danger"}>
                      {`${e.ecart >= 0 ? t("gaz.gain") : t("gaz.perte")} ${formatFcfa(Math.abs(e.ecart))}`}
                    </Chip>
                  )}
                  {pdg && e.ecart === null && (
                    <Button
                      variant="contour"
                      aria-label={`${t("ecarts.solder")} ${e.client}`}
                      onClick={() => setChoisi(e.id)}
                    >
                      {t("ecarts.solder")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
        </Etat>
      </section>
      {echange && (
        <Solde
          key={echange.id}
          echange={echange}
          onFait={() => {
            setChoisi(null);
            lecture.recharger();
          }}
        />
      )}
    </>
  );
}

/** Échanges entre marques avec l'écart de valeur d'emballage (gain ou perte) et les écarts à régulariser. */
export function Echanges() {
  const [attente, setAttente] = useState(false);
  return (
    <div className="page">
      <Liste key={String(attente)} attente={attente} basculer={setAttente} />
    </div>
  );
}
