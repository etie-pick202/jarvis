import { useCallback, useEffect, useState } from "react";
import { classerProbleme, type Probleme } from "./problemes.js";

/** À changer quand la forme d'un modèle de vue change : l'ancienne copie locale est alors ignorée. */
const PREFIXE = "jarvis.cache.v2.";

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle);
    return brut === null ? defaut : (JSON.parse(brut) as T);
  } catch {
    return defaut;
  }
}

export interface Lecture<T> {
  data: T;
  /** La première tentative est terminée (réussie ou non). */
  pret: boolean;
  /** Une réponse du serveur ou une copie locale existe. */
  charge: boolean;
  hors: boolean;
  probleme: Probleme | null;
  recharger: () => void;
  /** Modification locale immédiate (écriture déjà rangée dans la file d'envoi). */
  modifier: (f: (d: T) => T) => void;
}

/** Lit une ressource et en garde une copie sur l'appareil : l'écran reste utilisable hors ligne. */
export function useCached<T>(
  cle: string,
  charger: (signal: AbortSignal) => Promise<T>,
  defaut: T,
): Lecture<T> {
  const [data, setData] = useState<T>(() => lire(`${PREFIXE}${cle}`, defaut));
  const [charge, setCharge] = useState(() => localStorage.getItem(`${PREFIXE}${cle}`) !== null);
  const [pret, setPret] = useState(false);
  const [probleme, setProbleme] = useState<Probleme | null>(null);
  const [essai, setEssai] = useState(0);
  const recharger = useCallback(() => setEssai((n) => n + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `essai` relance volontairement la lecture
  useEffect(() => {
    const controller = new AbortController();
    charger(controller.signal)
      .then((d) => {
        localStorage.setItem(`${PREFIXE}${cle}`, JSON.stringify(d));
        setData(d);
        setCharge(true);
        setProbleme(null);
      })
      .catch((e: unknown) => {
        // On garde la copie locale et on dit pourquoi la lecture a échoué.
        if (!controller.signal.aborted) setProbleme(classerProbleme(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPret(true);
      });
    return () => controller.abort();
  }, [cle, charger, essai]);

  // Au retour du réseau, une lecture restée en échec est retentée toute seule.
  useEffect(() => {
    if (probleme?.genre !== "hors-ligne") return;
    window.addEventListener("online", recharger);
    return () => window.removeEventListener("online", recharger);
  }, [probleme, recharger]);

  const modifier = useCallback(
    (f: (d: T) => T) =>
      setData((d) => {
        const suivant = f(d);
        localStorage.setItem(`${PREFIXE}${cle}`, JSON.stringify(suivant));
        return suivant;
      }),
    [cle],
  );

  return { data, pret, charge, hors: probleme?.genre === "hors-ligne", probleme, recharger, modifier };
}
