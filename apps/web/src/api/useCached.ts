import { useCallback, useEffect, useState } from "react";

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

/** Lit une ressource et en garde une copie sur l'appareil : l'écran reste utilisable hors ligne. */
export function useCached<T>(
  cle: string,
  charger: (signal: AbortSignal) => Promise<T>,
  defaut: T,
): { data: T; pret: boolean; hors: boolean; modifier: (f: (d: T) => T) => void } {
  const [data, setData] = useState<T>(() => lire(`${PREFIXE}${cle}`, defaut));
  const [pret, setPret] = useState(false);
  const [hors, setHors] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    charger(controller.signal)
      .then((d) => {
        localStorage.setItem(`${PREFIXE}${cle}`, JSON.stringify(d));
        setData(d);
        setHors(false);
      })
      .catch(() => setHors(true)) // hors ligne : on garde la copie locale
      .finally(() => setPret(true));
    return () => controller.abort();
  }, [cle, charger]);

  /** Modification locale immédiate (écriture déjà rangée dans la file d'envoi). */
  const modifier = useCallback(
    (f: (d: T) => T) =>
      setData((d) => {
        const suivant = f(d);
        localStorage.setItem(`${PREFIXE}${cle}`, JSON.stringify(suivant));
        return suivant;
      }),
    [cle],
  );

  return { data, pret, hors, modifier };
}
