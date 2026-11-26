import { crc32 } from "node:zlib";
import type { CsvCell } from "./compute.js";

/**
 * Classeur Excel minimal (une feuille), sans dépendance : un fichier .xlsx est une archive ZIP de fichiers XML.
 * Les textes sont écrits comme chaînes (`inlineStr`), jamais comme formules ; les montants comme nombres.
 */

const escapeXml = (text: string) =>
  text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ces caractères sont interdits en XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Référence de colonne : 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  const head = index >= 26 ? columnName(Math.floor(index / 26) - 1) : "";
  return head + String.fromCharCode(65 + (index % 26));
}

function sheetXml(rows: readonly (readonly CsvCell[])[]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          if (value === null) return "";
          const ref = `${columnName(c)}${r + 1}`;
          return typeof value === "number"
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const PACKAGE = "http://schemas.openxmlformats.org/package/2006";
const OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function parts(sheetName: string, rows: readonly (readonly CsvCell[])[]): [string, string][] {
  return [
    [
      "[Content_Types].xml",
      `${XML_HEAD}<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${MIME}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${MIME}.worksheet+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `${XML_HEAD}<Relationships xmlns="${PACKAGE}/relationships"><Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OFFICE}"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML_HEAD}<Relationships xmlns="${PACKAGE}/relationships"><Relationship Id="rId1" Type="${OFFICE}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ];
}

/** Archive ZIP sans compression (méthode « stored »), noms en UTF-8. */
export function zip(files: readonly (readonly [string, string])[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    // Champs communs aux deux en-têtes : version, drapeau UTF-8, méthode, date (1980-01-01), CRC, tailles.
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0);
    common.writeUInt16LE(0x0800, 2);
    common.writeUInt16LE(0x21, 8);
    common.writeUInt32LE(crc32(data), 10);
    common.writeUInt32LE(data.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(nameBytes.length, 22);
    const header = Buffer.alloc(4);
    header.writeUInt32LE(0x04034b50, 0);
    local.push(header, common, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    common.copy(entry, 6, 0, 26);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + common.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export function toXlsx(
  sheetName: string,
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
): Uint8Array {
  return zip(parts(sheetName, [headers, ...rows]));
}
