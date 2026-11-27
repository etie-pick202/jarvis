/**
 * PDF de texte, sans dépendance : police à chasse fixe (colonnes alignées), autant de pages que nécessaire.
 * Assez léger pour être partagé depuis un téléphone d'entrée de gamme.
 */

export interface PdfOptions {
  /** A4 à l'italienne pour les tableaux. */
  landscape?: boolean;
}

/** Caractères fréquents hors Latin-1, remplacés par un équivalent. */
const REPLACEMENTS: Record<string, string> = {
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "–": "-",
  "—": "-",
  "→": "->",
  œ: "oe",
  Œ: "OE",
  " ": " ",
};

/** WinAnsi ≈ Latin-1 pour le français : un octet par caractère, « ? » pour le reste. */
function latin1(text: string): Buffer {
  const plain = [...text].map((c) => REPLACEMENTS[c] ?? ((c.codePointAt(0) ?? 0) < 256 ? c : "?")).join("");
  return Buffer.from(plain, "latin1");
}

const escapeText = (text: string) => text.replace(/[\r\n\t]+/g, " ").replace(/[\\()]/g, (c) => `\\${c}`);

export function toPdf(lines: readonly string[], options: PdfOptions = {}): Uint8Array {
  const [width, height, size] = options.landscape ? [842, 595, 8] : [595, 842, 10];
  const leading = size + 4;
  const margin = 36;
  const perPage = Math.floor((height - 2 * margin) / leading);
  const pages: (readonly string[])[] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += perPage) pages.push(lines.slice(i, i + perPage));

  // Objets : 1 catalogue, 2 arbre des pages, 3 police, puis une page et son contenu pour chaque page.
  const pageId = (i: number) => 4 + i * 2;
  const objects: Buffer[] = [
    latin1("<< /Type /Catalog /Pages 2 0 R >>"),
    latin1(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
    latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"),
  ];
  for (const [i, page] of pages.entries()) {
    objects.push(
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      ),
    );
    const body = latin1(
      [
        `BT /F1 ${size} Tf ${margin} ${height - margin - size} Td ${leading} TL`,
        ...page.map((line, n) => `${n === 0 ? "" : "T* "}(${escapeText(line)}) Tj`),
        "ET",
      ].join("\n"),
    );
    objects.push(
      Buffer.concat([latin1(`<< /Length ${body.length} >>\nstream\n`), body, latin1("\nendstream")]),
    );
  }

  const header = latin1("%PDF-1.4\n");
  const chunks: Buffer[] = [header];
  let offset = header.length;
  const positions: number[] = [];
  for (const [i, object] of objects.entries()) {
    positions.push(offset);
    const chunk = Buffer.concat([latin1(`${i + 1} 0 obj\n`), object, latin1("\nendobj\n")]);
    chunks.push(chunk);
    offset += chunk.length;
  }
  const table = positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  chunks.push(
    latin1(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`,
    ),
  );
  return Buffer.concat(chunks);
}
