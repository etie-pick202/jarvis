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
