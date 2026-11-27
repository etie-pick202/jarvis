import { useEffect, useState } from "react";
import { type Article, api, type Client } from "../api/index.js";
import { db } from "../offline/db.js";
import { chercherClients } from "./regles.js";

const CLE_CATALOGUE = "jarvis.catalogue";
const CLE_CLIENTS = "jarvis.clients";
const MAX_MEMOIRE = 200;

function lire<T>(cle: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(cle) ?? "null") as T | null;
  } catch {
    return null;
  }
}

/** Catalogue et clients gardés sur l'appareil : la vente reste possible sans réseau. */
export function useCatalogue(): {
  articles: Article[];
  pret: boolean;
  /** Le catalogue n'a pas pu être lu : la copie de l'appareil sert. */
  hors: boolean;
  consommer: (articleId: string, quantite: number) => void;
} {
  const [articles, setArticles] = useState<Article[]>(() => lire<Article[]>(CLE_CATALOGUE) ?? []);
  const [pret, setPret] = useState(articles.length > 0);
  const [hors, setHors] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .catalogue(controller.signal)
      .then(async (a) => {
        // Les ventes encore en attente ont déjà consommé du stock local : on garde la valeur locale la plus basse.
        const locaux = lire<Article[]>(CLE_CATALOGUE) ?? [];
        const enAttente = (await db.outbox.where("status").equals("pending").count()) > 0;
        const fusion = a.map((x) => {
          const local = locaux.find((l) => l.id === x.id);
          return local && enAttente ? { ...x, stock: Math.min(x.stock, local.stock) } : x;
        });
        localStorage.setItem(CLE_CATALOGUE, JSON.stringify(fusion));
        setArticles(fusion);
      })
      .catch(() => setHors(true)) // hors ligne : on garde la copie locale
      .finally(() => setPret(true));
    return () => controller.abort();
  }, []);

  const consommer = (articleId: string, quantite: number) => setArticles(consommerStock(articleId, quantite));

  return { articles, pret, hors, consommer };
}

/** Retire du stock local ce qui vient d'être vendu, pour refuser la vente suivante à stock nul même hors ligne. */
export function consommerStock(articleId: string, quantite: number): Article[] {
  const liste = (lire<Article[]>(CLE_CATALOGUE) ?? []).map((a) =>
    a.id === articleId ? { ...a, stock: Math.max(0, a.stock - quantite) } : a,
  );
  localStorage.setItem(CLE_CATALOGUE, JSON.stringify(liste));
  return liste;
}

/** Clients déjà vus, gardés sur l'appareil pour la recherche hors ligne. */
function memoriser(nouveaux: readonly Client[]): void {
  const connus = lire<Client[]>(CLE_CLIENTS) ?? [];
  const fusion = [...nouveaux, ...connus.filter((c) => !nouveaux.some((n) => n.id === c.id))];
  localStorage.setItem(CLE_CLIENTS, JSON.stringify(fusion.slice(0, MAX_MEMOIRE)));
}

/** Suggestions de clients dès les premières lettres : le serveur en ligne, la mémoire de l'appareil sinon. */
export function useSuggestions(saisie: string, actif: boolean): Client[] {
  const [liste, setListe] = useState<Client[]>([]);
  useEffect(() => {
    const q = saisie.trim();
    if (!actif || q === "") {
      setListe([]);
      return;
    }
    const controller = new AbortController();
    api
      .clients(q, controller.signal)
      .then((r) => {
        memoriser(r);
        setListe(r);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListe(chercherClients(lire<Client[]>(CLE_CLIENTS) ?? [], q));
      });
    return () => controller.abort();
  }, [saisie, actif]);
  return liste;
}
