// A small parser for the semicolon separated files in resources/data.

export interface CsvRow {
  // Line of the file on which the row starts
  line: number;
  fields: string[];
}

export class CsvError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`Zeile ${line}: ${message}`);
  }
}

const SEPARATOR = ";";
const QUOTE = '"';

// A lone carriage return is not a line end, it stays part of the field.
function lineEndLength(text: string, position: number): number {
  if (text[position] === "\n") return 1;
  return text[position] === "\r" && text[position + 1] === "\n" ? 2 : 0;
}

// Every row must have as many fields as the first one. A line end after the last row is optional.
export function parseCsv(input: string): CsvRow[] {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let position = 0;
  let line = 1;

  function readQuotedField(): string {
    const startLine = line;
    let value = "";
    position += 1;
    for (;;) {
      const char = text[position];
      if (char === undefined) {
        throw new CsvError(startLine, "Ein Anführungszeichen wird nicht geschlossen.");
      }
      if (char === QUOTE && text[position + 1] === QUOTE) {
        value += QUOTE;
        position += 2;
      } else if (char === QUOTE) {
        position += 1;
        break;
      } else {
        if (char === "\n") line += 1;
        value += char;
        position += 1;
      }
    }
    const next = text[position];
    if (next !== undefined && next !== SEPARATOR && lineEndLength(text, position) === 0) {
      throw new CsvError(line, "Hinter einem schließenden Anführungszeichen steht weiterer Text.");
    }
    return value;
  }

  function readPlainField(): string {
    const start = position;
    while (
      position < text.length &&
      text[position] !== SEPARATOR &&
      lineEndLength(text, position) === 0
    ) {
      // Mostly a missing separator: read as text, it would import a wrong row without any notice.
      if (text[position] === QUOTE) {
        throw new CsvError(line, "Ein Anführungszeichen steht mitten in einem Feld.");
      }
      position += 1;
    }
    return text.slice(start, position);
  }

  while (position < text.length) {
    const row: CsvRow = { line, fields: [] };
    for (;;) {
      row.fields.push(text[position] === QUOTE ? readQuotedField() : readPlainField());
      if (text[position] !== SEPARATOR) break;
      position += 1;
    }
    position += lineEndLength(text, position);
    line += 1;

    const expected = rows[0]?.fields.length ?? row.fields.length;
    if (row.fields.length !== expected) {
      throw new CsvError(
        row.line,
        `Es werden ${expected} Spalten erwartet, gefunden wurden ${row.fields.length}.`,
      );
    }
    rows.push(row);
  }
  return rows;
}
