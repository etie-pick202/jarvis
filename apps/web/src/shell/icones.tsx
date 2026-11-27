/** Icônes de trait de la maquette, décoratives (le nom du volet est écrit à côté). */
const TRACES: Record<string, string> = {
  pilot: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 12l4-4",
  vente: "M2 3h3l2.5 12h11l2-8H6M9 20h.01M18 20h.01",
  gaz: "M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z",
  market: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  caisse: "M3 6h18v14H3zM3 10h18M16.5 14.5h.01",
  canal: "M3 5h18v12H3zM8 21h8M12 17v4",
  money: "M7 2h10v20H7zM11 18h2",
  livre: "M2 6h11v10H2zM13 9h4l3 3v4h-7M6 18h.01M17 18h.01",
  rapport: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  config: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3",
  plus: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
};

export function Icone({ id }: { id: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRACES[id] ?? TRACES.plus} />
    </svg>
  );
}
