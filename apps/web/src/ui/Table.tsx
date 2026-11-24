import type { ReactNode } from "react";

/** Tableau accessible : légende, en-têtes de colonnes, défilement horizontal sur petit écran. */
export function Table({
  caption,
  colonnes,
  children,
}: {
  caption: string;
  colonnes: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="tableau">
      <table>
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
