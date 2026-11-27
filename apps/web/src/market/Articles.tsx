import type { Article, CreateArticleInput, UpdateArticleInput } from "@jarvis/shared";
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
import { usePagination, VoirPlus } from "../ui/listes.js";
import { Table } from "../ui/Table.js";
import { useEnvoi } from "../ui/useEnvoi.js";
import { formatFcfa } from "../vente/regles.js";
import { filtrerArticles, lirePrix, nomDejaPris } from "./regles.js";

function Fiche({
  article,
  existants,
  onValider,
  onAnnuler,
}: Readonly<{
  /** Absent : nouvel article. */
  article?: Article;
  existants: readonly Article[];
  onValider: (saisie: CreateArticleInput) => Promise<void>;
  onAnnuler: () => void;
}>) {
  const { t } = useI18n();
  const [nom, setNom] = useState(article?.name ?? "");
  const [prix, setPrix] = useState(article ? String(article.price) : "");
  const [cout, setCout] = useState(article ? String(article.purchaseCost) : "");
  const [suivi, setSuivi] = useState(article?.trackStock ?? false);
  const [ok, setOk] = useState(false);
  const vente = lirePrix(prix);
  const achat = cout.trim() === "" ? 0 : lirePrix(cout);
  const pris = nomDejaPris(nom, existants, article?.id);
  const valide = nom.trim() !== "" && vente !== null && achat !== null && !pris;
  const titre = article ? `${t("canal.modifier")} ${article.name}` : t("market.nouveau");

  const [enregistrer, occupe] = useEnvoi(async () => {
    if (vente === null || achat === null) return;
    await onValider({ name: nom.trim(), price: vente, purchaseCost: achat, trackStock: suivi });
    if (!article) {
      setNom("");
      setPrix("");
      setCout("");
      setSuivi(false);
      setOk(true);
    }
  });

  function envoyer(event: FormEvent) {
    event.preventDefault();
    if (valide) void enregistrer();
  }

  const saisir = (f: (v: string) => void) => (e: { target: { value: string } }) => {
    f(e.target.value);
    setOk(false);
  };

  return (
    <form className="carte" onSubmit={envoyer} aria-label={titre}>
      <h2>{titre}</h2>
      <Field label={t("market.nom")} maxLength={120} value={nom} onChange={saisir(setNom)} />
      {pris && (
        <p role="alert" className="connexion__erreur">
          {t("market.nom.pris")}
        </p>
      )}
      <Field label={t("canal.prix")} inputMode="numeric" value={prix} onChange={saisir(setPrix)} />
      <Field label={t("market.cout")} inputMode="numeric" value={cout} onChange={saisir(setCout)} />
      {(prix !== "" && vente === null) || achat === null ? (
        <p role="alert" className="connexion__erreur">
          {t("market.montant.invalide")}
        </p>
      ) : null}
      {vente !== null && achat !== null && vente < achat && (
        <output className="bloc">{t("market.perte")}</output>
      )}
      {/* Le suivi du stock se choisit à la création : le serveur ne permet pas de le changer ensuite. */}
      {!article && (
        <label className="vente__bascule">
          <input type="checkbox" checked={suivi} onChange={(e) => setSuivi(e.target.checked)} />
          {t("market.suivre")}
        </label>
      )}
      <div className="vente__actions">
        <Button type="submit" disabled={!valide || occupe}>
          {t(article ? "market.enregistrer" : "market.ajouter")}
        </Button>
        {article && (
          <Button variant="contour" onClick={onAnnuler}>
            {t("vente.retour")}
          </Button>
        )}
      </div>
      {ok && <output className="bloc">{t("market.ajoute")}</output>}
    </form>
  );
}

/** Articles hors gaz : liste, recherche, ajout et modification (PDG et gérant), consultation pour le caissier. */
export function Articles() {
  const { t } = useI18n();
  const { profilsActifs } = useSession();
  const lecture = useCached("market-articles", api.articlesLibres, []);
  const { data, modifier } = lecture;
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const gere = profilsActifs.includes("pdg") || profilsActifs.includes("gerant");
  const trouves = filtrerArticles(data, recherche);
  const { visibles, restants, plus } = usePagination(trouves);
  const choisi = data.find((a) => a.id === edition);

  async function ajouter(body: CreateArticleInput) {
    await ecrire({
      method: "POST",
      path: "/catalogue/articles",
      label: `${t("market.nouveau")} : ${body.name}`,
      body,
    });
    modifier((l) => [...l, { ...body, id: crypto.randomUUID(), stockQty: 0, active: true }]);
  }

  async function changer(article: Article, body: UpdateArticleInput) {
    await ecrire({
      method: "PATCH",
      path: `/catalogue/articles/${article.id}`,
      label: `${t("canal.modifier")} : ${article.name}`,
      body,
    });
    modifier((l) => l.map((a) => (a.id === article.id ? { ...a, ...body } : a)));
    setEdition(null);
  }

  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.market.articles")}</h1>
        <Field
          label={t("market.recherche")}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <Etat {...lecture} vide={trouves.length === 0} messageVide={t("market.aucun")}>
          <Table
            caption={t("rub.market.articles")}
            colonnes={[t("market.nom"), t("canal.prix"), t("market.cout"), t("rub.market.stock"), ""]}
          >
            {visibles.map((a) => (
              <tr key={a.id}>
                <th scope="row">
                  {a.name} {!a.active && <Chip>{t("canal.inactif")}</Chip>}
                </th>
                <td>{formatFcfa(a.price)}</td>
                <td>{formatFcfa(a.purchaseCost)}</td>
                <td>{a.trackStock ? a.stockQty : t("market.non.suivi")}</td>
                <td>
                  {gere && (
                    <div className="vente__actions">
                      <Button
                        variant="contour"
                        aria-label={`${t("canal.modifier")} ${a.name}`}
                        onClick={() => setEdition(a.id)}
                      >
                        {t("canal.modifier")}
                      </Button>
                      <Button
                        variant="contour"
                        aria-label={`${t(a.active ? "canal.desactiver" : "canal.reactiver")} ${a.name}`}
                        onClick={() => void changer(a, { active: !a.active })}
                      >
                        {t(a.active ? "canal.desactiver" : "canal.reactiver")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
        </Etat>
      </section>
      {gere && (
        <Fiche
          key={choisi?.id ?? "nouveau"}
          article={choisi}
          existants={data}
          onValider={(s) =>
            choisi
              ? changer(choisi, { name: s.name, price: s.price, purchaseCost: s.purchaseCost })
              : ajouter(s)
          }
          onAnnuler={() => setEdition(null)}
        />
      )}
    </div>
  );
}

/** Stock des articles suivis : les ruptures d'abord. */
export function StockArticles() {
  const { t } = useI18n();
  const lecture = useCached("market-articles", api.articlesLibres, []);
  const suivis = lecture.data
    .filter((a) => a.active && a.trackStock)
    .sort((a, b) => a.stockQty - b.stockQty || a.name.localeCompare(b.name));
  const { visibles, restants, plus } = usePagination(suivis);
  return (
    <div className="page">
      <section className="carte">
        <h1>{t("rub.market.stock")}</h1>
        <Etat {...lecture} vide={suivis.length === 0} messageVide={t("market.aucun.suivi")}>
          <Table caption={t("rub.market.stock")} colonnes={[t("market.nom"), t("market.quantite"), ""]}>
            {visibles.map((a) => (
              <tr key={a.id}>
                <th scope="row">{a.name}</th>
                <td>{a.stockQty}</td>
                <td>{a.stockQty <= 0 && <Chip tone="danger">{t("gaz.rupture")}</Chip>}</td>
              </tr>
            ))}
          </Table>
          <VoirPlus restants={restants} plus={plus} />
        </Etat>
      </section>
    </div>
  );
}
