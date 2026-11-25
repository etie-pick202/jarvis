import { useId } from "react";

export type VarianteLogo = "or" | "noir";

interface Props {
  size?: number;
  /** « or » sur fond sombre (principal), « noir » sur fond clair ou jaune. */
  variante?: VarianteLogo;
  /** Texte alternatif ; absent = décoratif (le nom est écrit à côté). */
  titre?: string;
  /** L'étincelle tourne autour du J (coupée si l'utilisateur réduit les animations). */
  animee?: boolean;
}

/** Respecte le réglage « réduire les animations » du système. */
const mouvementReduit = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Identité JARVIS : un J géométrique en or entouré de deux orbites croisées, avec une étincelle.
 * Dessin original de la maquette, reproduit en SVG ; les identifiants de dégradé sont uniques par instance.
 */
export function LogoJarvis({ size = 34, variante = "or", titre, animee = false }: Props) {
  const anime = animee && !mouvementReduit();
  const uid = useId().replace(/:/gu, "");
  const or = variante === "or";
  const orbite = or ? `url(#orb${uid})` : "#111111";
  const lettre = or ? `url(#fl${uid})` : "#111111";
  const etincelle = or ? "#ffffff" : "#111111";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      focusable="false"
      className="logo-jarvis"
      style={{ flex: "none", display: "block", overflow: "visible" }}
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
    >
      {or && (
        <defs>
          <linearGradient id={`fl${uid}`} gradientUnits="userSpaceOnUse" x1="32" y1="24" x2="64" y2="80">
            <stop offset="0" stopColor="#FFE27A" />
            <stop offset=".5" stopColor="#FFC20E" />
            <stop offset="1" stopColor="#E69500" />
          </linearGradient>
          <linearGradient id={`orb${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFC20E" stopOpacity=".25" />
            <stop offset=".5" stopColor="#FFF1A8" />
            <stop offset="1" stopColor="#FFC20E" />
          </linearGradient>
        </defs>
      )}
      <g fill="none" strokeLinecap="round">
        <g transform="rotate(-30 50 50)">
          <path d="M6 50 A45 15.5 0 0 1 94 50" stroke={orbite} strokeWidth="2" opacity=".55" />
        </g>
        <g transform="rotate(30 50 50)">
          <path d="M6 50 A45 15.5 0 0 1 94 50" stroke={orbite} strokeWidth="2" opacity=".55" />
        </g>
        <path
          d="M34 25 H68 M59 25 V57 Q59 77 43 77 Q31 77 27 66"
          stroke={lettre}
          strokeWidth="13"
          strokeLinejoin="round"
        />
        <g transform="rotate(-30 50 50)">
          <path d="M6 50 A45 15.5 0 0 0 94 50" stroke={orbite} strokeWidth="2.6" />
          {anime ? (
            <circle r="3.4" fill={etincelle} className="logo-jarvis__etincelle">
              <animateMotion
                dur="3.6s"
                repeatCount="indefinite"
                path="M6 50 A45 15.5 0 1 1 94 50 A45 15.5 0 1 1 6 50"
              />
            </circle>
          ) : (
            <circle cx="94" cy="50" r="3.4" fill={etincelle} stroke="none" />
          )}
        </g>
        <g transform="rotate(30 50 50)">
          <path d="M6 50 A45 15.5 0 0 0 94 50" stroke={orbite} strokeWidth="2.6" opacity=".8" />
        </g>
      </g>
    </svg>
  );
}

/** Logo et nom : en-tête de la gestion. Le texte « JARVIS » est le nom accessible. */
export function MarqueJarvis({ size = 30, variante = "or", animee = false }: Omit<Props, "titre">) {
  return (
    <span className={`marque-jarvis marque-jarvis--${variante}`}>
      <LogoJarvis size={size} variante={variante} animee={animee} />
      <span className="marque-jarvis__nom" style={{ fontSize: Math.round(size * 0.62) }}>
        JARVIS
      </span>
    </span>
  );
}
