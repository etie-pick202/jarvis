import type { NotificationSettings } from "@jarvis/shared";
import { useEffect, useState } from "react";
import { api, type Badges } from "../api/index.js";
import { useSession } from "../auth/SessionProvider.js";
import type { Profil } from "../nav/volets.js";

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

/**
 * Rappels et alertes de stock ne s'affichent qu'aux profils choisis dans CoCoConfig. Sans réglage lisible (profil
 * sans accès, panne), les pastilles restent toutes visibles.
 */
export function selonDestinataires(
  badges: Badges,
  reglage: NotificationSettings | null,
  profils: readonly Profil[],
): Badges {
  if (!reglage) return badges;
  const concerne = (liste: readonly Profil[]) => liste.some((p) => profils.includes(p));
  return {
    ...badges,
    echeances: concerne(reglage.reminders) ? badges.echeances : 0,
    stockBas: concerne(reglage.stockAlerts) ? badges.stockBas : 0,
  };
}

export function useBadges(): Badges | null {
  const { profilsActifs } = useSession();
  const [badges, setBadges] = useState<Badges | null>(null);
  const [reglage, setReglage] = useState<NotificationSettings | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .badges(controller.signal)
      .then(setBadges)
      .catch(() => undefined); // hors ligne : on n'affiche simplement pas de pastille
    api
      .destinataires(controller.signal)
      .then(setReglage)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return badges && selonDestinataires(badges, reglage, profilsActifs);
}
