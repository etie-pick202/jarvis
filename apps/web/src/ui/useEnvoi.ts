import { useRef, useState } from "react";

/**
 * Double clic et double envoi : tant qu'un envoi est en cours, les appels suivants sont ignorés.
 * (Chaque opération a sa clé d'idempotence ; sans ce garde, deux clics feraient deux opérations.)
 */
export function useEnvoi(action: () => Promise<void>): [() => Promise<void>, boolean] {
  const enCours = useRef(false);
  const [occupe, setOccupe] = useState(false);
  async function lancer() {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    try {
      await action();
    } finally {
      enCours.current = false;
      setOccupe(false);
    }
  }
  return [lancer, occupe];
}

/**
 * Même garde pour un gestionnaire existant : tant qu'un appel court, les suivants sont ignorés. Pour un formulaire,
 * le rechargement de page est empêché même quand l'appel est ignoré.
 */
export function useGarde() {
  const enCours = useRef(false);
  return <A extends unknown[]>(action: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      const premier = args[0] as { preventDefault?: () => void } | undefined;
      premier?.preventDefault?.();
      if (enCours.current) return;
      enCours.current = true;
      try {
        await action(...args);
      } finally {
        enCours.current = false;
      }
    };
}
