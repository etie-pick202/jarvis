import { type ReactNode, useLayoutEffect, useRef } from "react";

/**
 * Tableau accessible : légende et en-têtes de colonnes. Avec `cartes`, chaque ligne devient une carte sur
 * téléphone ; les rôles sont alors posés à la main, la mise en bloc pouvant les faire perdre au navigateur.
 */
export function Table({
  caption,
  colonnes,
  cartes = false,
  children,
}: {
  caption: string;
  colonnes: readonly string[];
  cartes?: boolean;
  children: ReactNode;
}) {
  const table = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    if (!cartes || !table.current) return;
    table.current.setAttribute("role", "table");
    for (const ligne of table.current.querySelectorAll("tr")) {
      ligne.setAttribute("role", "row");
      [...ligne.children].forEach((cellule, i) => {
        if (cellule.closest("thead")) cellule.setAttribute("role", "columnheader");
        else {
          cellule.setAttribute("role", cellule.tagName === "TH" ? "rowheader" : "cell");
          cellule.setAttribute("data-label", colonnes[i] ?? "");
        }
      });
    }
  });
  return (
    <div className={cartes ? "tableau tableau--cartes" : "tableau"}>
      <table ref={table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
