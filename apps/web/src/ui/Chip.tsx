import type { ReactNode } from "react";

export type Tone = "neutre" | "alerte" | "ok" | "info" | "attention" | "danger" | "noir";

/** Pastille d'état ou de compteur : la couleur ne porte jamais seule le sens, le texte le dit. */
export function Chip({ tone = "neutre", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={tone === "neutre" ? "pastille" : `pastille pastille--${tone}`}>{children}</span>;
}
