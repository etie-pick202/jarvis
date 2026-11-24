/** Le J d'or entouré de deux orbites (identité de la maquette). Décoratif : le nom est écrit à côté. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-j" gradientUnits="userSpaceOnUse" x1="32" y1="24" x2="64" y2="80">
          <stop offset="0" stopColor="#FFE27A" />
          <stop offset=".5" stopColor="#FFC20E" />
          <stop offset="1" stopColor="#E69500" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#FFC20E" strokeWidth="2.4" strokeLinecap="round" opacity=".7">
        <ellipse cx="50" cy="50" rx="44" ry="15.5" transform="rotate(-30 50 50)" />
        <ellipse cx="50" cy="50" rx="44" ry="15.5" transform="rotate(30 50 50)" />
      </g>
      <path
        d="M34 25 H68 M59 25 V57 Q59 77 43 77 Q31 77 27 66"
        fill="none"
        stroke="url(#logo-j)"
        strokeWidth="13"
        strokeLinejoin="round"
      />
    </svg>
  );
}
