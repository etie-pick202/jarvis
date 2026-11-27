import { useState } from "react";
import { useI18n } from "../i18n/index.js";
import { Button } from "../ui/Button.js";
import { Chip } from "../ui/Chip.js";
import { Etat } from "../ui/Etat.js";
import { formatFcfa } from "../vente/regles.js";
import { totalEspeces, totalSoldes, useCaisses } from "./donnees.js";
import { Journal } from "./Journal.js";

/** Solde théorique de chaque caisse, mis à jour après chaque mouvement. */
export function Soldes() {
  const { t } = useI18n();
  const { caisses, lecture } = useCaisses();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const choisie = caisses.find((c) => c.id === ouverte);
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("caisse.soldes.titre")}</h1>
        <Etat {...lecture} vide={caisses.length === 0} messageVide={t("caisse.vide")}>
          <ul className="caisses">
            {caisses.map((c) => (
              <li key={c.id} className={`caisses__carte${c.actif ? "" : " caisses__carte--veille"}`}>
                <h2>{c.nom}</h2>
                {c.actif ? (
                  <>
                    <p className="caisses__solde">{formatFcfa(c.solde)}</p>
                    <p className="caisses__fond">{`${t("caisse.fond")} : ${formatFcfa(c.fond)}`}</p>
                  </>
                ) : (
                  <Chip>{t("caisse.veille")}</Chip>
                )}
                <Button
                  variant="contour"
                  aria-label={`${t("corr.mouvements")} ${c.nom}`}
                  onClick={() => setOuverte(c.id)}
                >
                  {t("corr.mouvements")}
                </Button>
              </li>
            ))}
          </ul>
          <p className="caisses__total">
            <strong>{`${t("caisse.total")} : ${formatFcfa(totalSoldes(caisses))}`}</strong>
            <span>{` · ${t("caisse.dont")} ${formatFcfa(totalEspeces(caisses))} ${t("caisse.enespeces")}`}</span>
          </p>
        </Etat>
      </section>
      {choisie && <Journal key={choisie.id} caisse={choisie} onSolde={lecture.recharger} />}
    </div>
  );
}
