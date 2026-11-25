import { useEffect, useState } from "react";
import { api, type Livraison } from "../api/index.js";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip, type Tone } from "../ui/Chip.js";
import { EtatVide } from "../visuels/Illustration.js";

const TONES: Record<Livraison["etat"], Tone> = {
  a_livrer: "alerte",
  parti: "info",
  livre: "ok",
  probleme: "danger",
};

/** Mode livreur : aucun menu, la liste du jour et trois boutons (Parti, Livré, Problème). */
export function LivreurMode({ source = api.livraisons }: { source?: () => Promise<Livraison[]> }) {
  const { t } = useI18n();
  const [liste, setListe] = useState<Livraison[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    source()
      .then(setListe)
      .catch(() => undefined);
    return () => controller.abort();
  }, [source]);

  const marquer = (id: string, etat: Livraison["etat"]) =>
    setListe((l) => l.map((x) => (x.id === id ? { ...x, etat } : x)));

  return (
    <section aria-labelledby="titre-livreur" className="livreur">
      <h1 id="titre-livreur">{t("mode.titre")}</h1>
      {liste.length === 0 && <EtatVide genre="vide" titre={t("mode.vide")} />}
      {liste.map((l) => (
        <article key={l.id} className="carte">
          <div className="livreur__ligne">
            <strong>{l.client}</strong>
            <Chip tone={TONES[l.etat]}>{t(`mode.etat.${l.etat}`)}</Chip>
          </div>
          <p>
            {l.quartier} · {l.article} · {l.montant.toLocaleString("fr-FR")} FCFA
          </p>
          <div className="livreur__actions">
            <Button variant="noir" onClick={() => marquer(l.id, "parti")}>
              {t("mode.parti")}
            </Button>
            <Button onClick={() => marquer(l.id, "livre")}>{t("mode.livre")}</Button>
            <Button variant="contour" onClick={() => marquer(l.id, "probleme")}>
              {t("mode.probleme")}
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
