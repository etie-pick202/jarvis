import type { ReactNode } from "react";

export type GenreIllustration =
  | "vide"
  | "hors-ligne"
  | "erreur"
  | "introuvable"
  | "interdit"
  | "session"
  | "conflit"
  | "marque";

/** Les deux orbites de l'identité, en fond de chaque illustration. */
function Orbites() {
  return (
    <g fill="none" stroke="var(--jaune)" strokeWidth="2" strokeLinecap="round" opacity=".7">
      <ellipse cx="60" cy="48" rx="52" ry="17" transform="rotate(-24 60 48)" />
      <ellipse cx="60" cy="48" rx="52" ry="17" transform="rotate(24 60 48)" />
    </g>
  );
}

/** Le motif propre à chaque situation, dessiné en trait noir sur pastille jaune (lisible sur fond clair ou sombre). */
const MOTIFS: Record<GenreIllustration, ReactNode> = {
  vide: <path d="M38 40l22-10 22 10v26l-22 10-22-10zM38 40l22 10 22-10M60 50v26" />,
  "hors-ligne": (
    <>
      <path d="M42 62a12 12 0 0 1 2-23 17 17 0 0 1 32 4 10 10 0 0 1-2 19z" />
      <path d="M40 80L82 22" />
    </>
  ),
  erreur: <path d="M60 28L88 74H32zM60 46v14M60 67h.01" />,
  introuvable: <path d="M54 62a16 16 0 1 0 0-32 16 16 0 0 0 0 32zM66 56l16 18M48 46h12" />,
  interdit: <path d="M44 52h32v24H44zM50 52V42a10 10 0 0 1 20 0v10M60 62v6" />,
  session: (
    <path d="M46 28h28M46 78h28M48 28c0 16 24 16 24 25S48 62 48 78M72 28c0 16-24 16-24 25s24 9 24 25" />
  ),
  conflit: <path d="M34 44h44l-9-9M86 62H42l9 9" />,
  marque: <path d="M52 28h16v8l7 8v32a4 4 0 0 1-4 4H49a4 4 0 0 1-4-4V44l7-8zM45 56h30" />,
};

/** Illustration originale d'un état (liste vide, hors ligne, erreur…). Décorative : le titre du bloc dit l'essentiel. */
export function Illustration({ genre }: { genre: GenreIllustration }) {
  return (
    <svg
      className="illustration"
      width="132"
      height="104"
      viewBox="0 0 120 96"
      aria-hidden="true"
      focusable="false"
    >
      <Orbites />
      <circle cx="60" cy="52" r="34" fill="var(--jaune)" />
      <g fill="none" stroke="var(--noir)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {MOTIFS[genre]}
      </g>
    </svg>
  );
}

/** Bloc d'état : illustration, titre, explication et action éventuelle. */
export function EtatVide({
  genre,
  titre,
  texte,
  niveau = 2,
  role,
  children,
}: {
  genre: GenreIllustration;
  titre: string;
  texte?: string;
  niveau?: 1 | 2;
  role?: "alert" | "status";
  children?: ReactNode;
}) {
  const Titre = niveau === 1 ? "h1" : "h2";
  return (
    <div className="etat-vide" role={role}>
      <Illustration genre={genre} />
      <Titre className="etat-vide__titre">{titre}</Titre>
      {texte && <p className="etat-vide__texte">{texte}</p>}
      {children}
    </div>
  );
}
