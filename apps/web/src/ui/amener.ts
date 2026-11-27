import { useEffect, useRef } from "react";

/** Amène un bloc à l'écran et, s'il s'agit d'une saisie, y place le curseur. */
export function allerA(bloc: HTMLElement | null, saisir = true) {
  bloc?.scrollIntoView?.({ block: "nearest" });
  if (saisir) bloc?.querySelector("input")?.focus({ preventScroll: true });
}

/** Même chose pour un bloc qui s'ouvre sous une liste : sans cela il apparaît hors de l'écran. */
export function useAmener<T extends HTMLElement>(saisir = true) {
  const bloc = useRef<T>(null);
  useEffect(() => allerA(bloc.current, saisir), [saisir]);
  return bloc;
}
