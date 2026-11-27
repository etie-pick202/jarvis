import type { Article, ArticleMove } from "@jarvis/shared";
import { type FormEvent, useCallback, useId, useState } from "react";
import { api } from "../api/index.js";
import { useCached } from "../api/useCached.js";
import { useSession } from "../auth/SessionProvider.js";
import { compresserPiece } from "../gaz/piece.js";
import { useI18n } from "../i18n/index.js";
import { db } from "../offline/db.js";
import { ecrire } from "../offline/ecrire.js";
import { Button } from "../ui/Button.js";
import { ChampFichier } from "../ui/ChampFichier.js";
import { Etat } from "../ui/Etat.js";
import { Field } from "../ui/Field.js";
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { useEnvoi } from "../ui/useEnvoi.js";

const entier = (v: string) => (/^-?\d{1,6}$/u.test(v.trim()) ? Number(v) : null);

/** Correction après comptage : variation en plus ou en moins, toujours justifiée. */
function Ajustement({ article, onFait }: Readonly<{ article: Article; onFait: (delta: number) => void }>) {
  const { t } = useI18n();
  const [variation, setVariation] = useState("");
  const [motif, setMotif] = useState("");
  const [ok, setOk] = useState(false);
  const delta = entier(variation);
  const negatif = delta !== null && article.stockQty + delta < 0;
  const pret = delta !== null && delta !== 0 && !negatif && motif.trim().length >= 5;

  const [ajuster, occupe] = useEnvoi(async () => {
    if (delta === null) return;
    await ecrire({
      method: "POST",
      path: `/catalogue/articles/${article.id}/adjust`,
      label: `${t("market.ajuster")} : ${article.name} (${delta > 0 ? "+" : ""}${delta})`,
      body: { delta, justification: motif.trim() },
    });
    onFait(delta);
    setVariation("");
    setMotif("");
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void ajuster();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("market.ajuster")}>
      <h2>{t("market.ajuster")}</h2>
      <Field
        label={t("market.variation")}
        value={variation}
        onChange={(e) => {
          setVariation(e.target.value);
          setOk(false);
        }}
      />
      {negatif && (
        <p role="alert" className="connexion__erreur">
          {t("market.stock.negatif")}
        </p>
      )}
      <Field label={t("market.motif")} value={motif} onChange={(e) => setMotif(e.target.value)} />
      <Button type="submit" disabled={!pret || occupe}>
        {t("market.ajuster.valider")}
      </Button>
      {ok && <output className="bloc">{t("market.mouvement.ok")}</output>}
    </form>
  );
}

/** Réapprovisionnement : la pièce du fournisseur est obligatoire, comme pour le gaz. */
function Reappro({ article, onFait }: Readonly<{ article: Article; onFait: (quantite: number) => void }>) {
  const { t } = useI18n();
  const [quantite, setQuantite] = useState("");
  const [cout, setCout] = useState("");
  const [piece, setPiece] = useState<File | null>(null);
  const [ok, setOk] = useState(false);
  const n = entier(quantite);
  const prix = cout.trim() === "" ? undefined : entier(cout);
  const pret = n !== null && n > 0 && prix !== null && (prix ?? 0) >= 0 && piece !== null;

  const [recevoir, occupe] = useEnvoi(async () => {
    if (n === null || !piece) return;
    // La pièce est gardée sur l'appareil jusqu'à son envoi, avec l'opération.
    const blob = await compresserPiece(piece);
    const pieceId = crypto.randomUUID();
    await db.pieces.add({ id: pieceId, nom: piece.name, blob });
    await ecrire({
      method: "POST",
      path: `/catalogue/articles/${article.id}/restock`,
      label: `${t("market.reappro")} : ${article.name} (+${n})`,
      pieceId,
      body: { quantity: n, ...(typeof prix === "number" ? { unitCost: prix } : {}) },
    });
    onFait(n);
    setQuantite("");
    setCout("");
    setPiece(null);
    setOk(true);
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (pret) void recevoir();
  }

  return (
    <form className="carte" onSubmit={soumettre} aria-label={t("market.reappro")}>
      <h2>{t("market.reappro")}</h2>
      <Field
        label={t("market.quantite.recue")}
        inputMode="numeric"
        value={quantite}
        onChange={(e) => {
          setQuantite(e.target.value);
          setOk(false);
        }}
      />
      <Field
        label={t("market.cout.unitaire")}
        inputMode="numeric"
        value={cout}
        onChange={(e) => setCout(e.target.value)}
      />
      <ChampFichier
        label={t("gaz.reception.piece")}
        accept="image/*,application/pdf"
        fichier={piece}
        onChoisir={(f) => {
          setPiece(f);
          setOk(false);
        }}
      />
      {piece === null && <p className="champ__aide">{t("gaz.reception.piece.obligatoire")}</p>}
      <Button type="submit" disabled={!pret || occupe}>
        {t("market.reappro.valider")}
      </Button>
      {ok && <output className="bloc">{t("market.mouvement.ok")}</output>}
    </form>
  );
}

function Journal({ article }: Readonly<{ article: Article }>) {
  const { t, lang } = useI18n();
  const charger = useCallback((s: AbortSignal) => api.mouvementsArticle(article.id, s), [article.id]);
  const lecture = useCached<ArticleMove[]>(`mouvements-${article.id}`, charger, []);
  const { visibles, restants, plus } = usePagination(lecture.data);
  const quand = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <section className="carte">
      <h2>{t("market.journal")}</h2>
      <Etat {...lecture} vide={lecture.data.length === 0} messageVide={t("market.aucun.mouvement")}>
        <Table
          cartes
          caption={t("market.journal")}
          colonnes={[
            t("pilot.quand"),
            t("market.mouvement"),
            t("market.variation.courte"),
            t("pilot.auteur"),
          ]}
        >
          {visibles.map((m) => (
            <tr key={m.id}>
              <td>{quand.format(new Date(m.at))}</td>
              <th scope="row">{`${t(`market.genre.${m.kind}`)} · ${m.label}`}</th>
              <td>{`${m.delta > 0 ? "+" : ""}${m.delta}`}</td>
              <td>{m.authorName}</td>
            </tr>
          ))}
        </Table>
        <VoirPlus restants={restants} plus={plus} />
      </Etat>
    </section>
  );
}

/** Mouvements d'un article suivi : journal, ajustement justifié et réapprovisionnement avec pièce. */
export function MouvementsArticles() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("market-articles", api.articlesLibres, []);
  const [choix, setChoix] = useState("");
  const id = useId();
  const gere = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const suivis = lecture.data.filter((a) => a.trackStock && a.active);
  const article = suivis.find((a) => a.id === choix) ?? suivis[0];
  const varier = (cible: string, delta: number) =>
    lecture.modifier((l) => l.map((a) => (a.id === cible ? { ...a, stockQty: a.stockQty + delta } : a)));

  return (
    <div className="page">
      <h1>{t("rub.market.mouvements")}</h1>
      <Etat {...lecture} vide={suivis.length === 0} messageVide={t("market.aucun.suivi")}>
        {article && (
          <>
            <div className="champ">
              <label className="champ__label" htmlFor={id}>
                {t("market.nom")}
              </label>
              <select
                id={id}
                className="champ__saisie"
                value={article.id}
                onChange={(e) => setChoix(e.target.value)}
              >
                {suivis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.name} (${a.stockQty})`}
                  </option>
                ))}
              </select>
            </div>
            {gere && (
              <div className="paire">
                <Reappro key={`r-${article.id}`} article={article} onFait={(n) => varier(article.id, n)} />
                <Ajustement key={`a-${article.id}`} article={article} onFait={(n) => varier(article.id, n)} />
              </div>
            )}
            <Journal key={`j-${article.id}`} article={article} />
          </>
        )}
      </Etat>
    </div>
  );
}
