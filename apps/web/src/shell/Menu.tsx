import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useI18n } from "../i18n/index.js";
import { Icone } from "./icones.js";

/** Réglages rares (langue, déconnexion) rangés derrière un seul bouton : la barre tient sur une ligne. */
export function Menu({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [ouvertSur, setOuvertSur] = useState<string | null>(null);
  const ouvert = ouvertSur === pathname;
  const zone = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!ouvert) return;
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvertSur(null);
      bouton.current?.focus();
    };
    const dehors = (e: PointerEvent) => {
      if (!zone.current?.contains(e.target as Node)) setOuvertSur(null);
    };
    document.addEventListener("keydown", clavier);
    document.addEventListener("pointerdown", dehors);
    return () => {
      document.removeEventListener("keydown", clavier);
      document.removeEventListener("pointerdown", dehors);
    };
  }, [ouvert]);

  return (
    <div className="menu" ref={zone}>
      <button
        ref={bouton}
        type="button"
        className="menu__bouton"
        aria-label={t("nav.menu")}
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={() => setOuvertSur(ouvert ? null : pathname)}
      >
        <Icone id="menu" />
      </button>
      {ouvert && (
        <div className="menu__panneau" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}
