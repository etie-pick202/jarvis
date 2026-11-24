import { useEffect, useState } from "react";
import { api, type Badges } from "../api/index.js";

/** Pastille de chaque volet : ce qui demande une action (cahier des charges, règles d'affichage). */
export function badgeDuVolet(voletId: string, badges: Badges | null): number {
  if (!badges) return 0;
  switch (voletId) {
    case "vente":
      return badges.commandes;
    case "gaz":
      return badges.stockBas;
    case "canal":
      return badges.echeances;
    case "pilot":
      return badges.validations;
    default:
      return 0;
  }
}

export function useBadges(): Badges | null {
  const [badges, setBadges] = useState<Badges | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .badges(controller.signal)
      .then(setBadges)
      .catch(() => undefined); // hors ligne : on n'affiche simplement pas de pastille
    return () => controller.abort();
  }, []);
  return badges;
}
