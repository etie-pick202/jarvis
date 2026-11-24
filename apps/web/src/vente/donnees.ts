import { useEffect, useState } from "react";
import { type Article, api, type Client } from "../api/index.js";
import { db } from "../offline/db.js";

const CLE_CATALOGUE = "jarvis.catalogue";
const CLE_CLIENTS = "jarvis.clients";

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
  clients: Client[];
  pret: boolean;
  consommer: (articleId: string, quantite: number) => void;
} {
  const [articles, setArticles] = useState<Article[]>(() => lire<Article[]>(CLE_CATALOGUE) ?? []);
  const [clients, setClients] = useState<Client[]>(() => lire<Client[]>(CLE_CLIENTS) ?? []);
  const [pret, setPret] = useState(articles.length > 0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.catalogue(controller.signal), api.clients(controller.signal)])
      .then(async ([a, c]) => {
        // Les ventes encore en attente ont déjà consommé du stock local : on garde la valeur locale la plus basse.
        const locaux = lire<Article[]>(CLE_CATALOGUE) ?? [];
        const enAttente = (await db.outbox.where("status").equals("pending").count()) > 0;
        const fusion = a.map((x) => {
          const local = locaux.find((l) => l.id === x.id);
          return local && enAttente ? { ...x, stock: Math.min(x.stock, local.stock) } : x;
        });
        localStorage.setItem(CLE_CATALOGUE, JSON.stringify(fusion));
        localStorage.setItem(CLE_CLIENTS, JSON.stringify(c));
        setArticles(fusion);
        setClients(c);
      })
      .catch(() => undefined) // hors ligne : on garde la copie locale
      .finally(() => setPret(true));
    return () => controller.abort();
  }, []);

  const consommer = (articleId: string, quantite: number) => setArticles(consommerStock(articleId, quantite));

  return { articles, clients, pret, consommer };
}

/** Retire du stock local ce qui vient d'être vendu, pour refuser la vente suivante à stock nul même hors ligne. */
export function consommerStock(articleId: string, quantite: number): Article[] {
  const liste = (lire<Article[]>(CLE_CATALOGUE) ?? []).map((a) =>
    a.id === articleId ? { ...a, stock: Math.max(0, a.stock - quantite) } : a,
  );
  localStorage.setItem(CLE_CATALOGUE, JSON.stringify(liste));
  return liste;
}
