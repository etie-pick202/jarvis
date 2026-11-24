/** Reçu en PDF, sans dépendance : une page de texte (Helvetica) assez légère pour un téléphone d'entrée de gamme. */
export function recuPdf(lignes: readonly string[]): Uint8Array {
  const echapper = (t: string) => t.replace(/[\\()]/gu, (c) => `\\${c}`);
  const contenu = [
    "BT /F1 12 Tf 50 790 Td 16 TL",
    ...lignes.map((l, i) => `${i === 0 ? "" : "T* "}(${echapper(l)}) Tj`),
    "ET",
  ].join("\n");
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${latin1(contenu).length} >>\nstream\n${contenu}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let sortie = "%PDF-1.4\n";
  const positions: number[] = [];
  objets.forEach((o, i) => {
    positions.push(latin1(sortie).length);
    sortie += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = latin1(sortie).length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const p of positions) sortie += `${String(p).padStart(10, "0")} 00000 n \n`;
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return latin1(sortie);
}

/** WinAnsi ≈ Latin-1 pour le français : un octet par caractère. */
function latin1(texte: string): Uint8Array {
  return Uint8Array.from(texte, (c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63));
}
