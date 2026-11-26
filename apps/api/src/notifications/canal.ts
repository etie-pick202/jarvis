import type { CanalSubscriber, Language } from "@jarvis/shared";

/** Nom provisoire sur les messages : la raison sociale reste à fixer (cahier des charges, « Raison sociale »). */
const SHOP = "COCOSAB";

const frDate = (day: string) => day.split("-").reverse().join("/");

/** Texte de relance d'un abonné, dans la langue choisie. */
export function canalReminderMessage(subscriber: CanalSubscriber, language: Language): string {
  const { name, decoderNumber, formulaName, formulaPrice, expiresOn, daysLeft } = subscriber;
  const date = expiresOn ? frDate(expiresOn) : "";
  const expired = (daysLeft ?? 0) < 0;
  if (language === "en") {
    return `Hello ${name}, your Canal+ subscription (decoder ${decoderNumber}) ${expired ? "expired" : "expires"} on ${date}. Renew at ${SHOP}: ${formulaName}, ${formulaPrice} FCFA.`;
  }
  return `Bonjour ${name}, votre abonnement Canal+ (décodeur ${decoderNumber}) ${expired ? "a expiré" : "expire"} le ${date}. Réabonnez-vous chez ${SHOP} : ${formulaName}, ${formulaPrice} FCFA.`;
}
