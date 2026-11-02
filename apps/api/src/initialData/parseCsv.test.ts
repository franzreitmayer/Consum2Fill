import { describe, expect, it } from "vitest";
import { CsvError, parseCsv } from "./parseCsv.js";

function fields(text: string): string[][] {
  return parseCsv(text).map((row) => row.fields);
}

function failure(text: string): CsvError {
  try {
    parseCsv(text);
  } catch (err) {
    if (err instanceof CsvError) return err;
    throw err;
  }
  throw new Error("Expected a CsvError");
}

describe("parseCsv", () => {
  it("removes the BOM from the first field", () => {
    expect(fields("﻿Name;Beschreibung\n")).toEqual([["Name", "Beschreibung"]]);
  });

  it("removes only a leading BOM", () => {
    expect(fields("a;﻿b")).toEqual([["a", "﻿b"]]);
  });

  it.each([
    ["LF", "a;b\nc;d\n"],
    ["CRLF", "a;b\r\nc;d\r\n"],
    ["no line end after the last row", "a;b\r\nc;d"],
  ])("reads rows with %s", (_label, text) => {
    expect(fields(text)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("reads quoted fields before a CRLF", () => {
    expect(fields('"a";"b"\r\n"c";"d"\r\n')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns no rows for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿")).toEqual([]);
  });

  it("keeps a semicolon inside quotes", () => {
    expect(fields('Tubus;"Mit Cuff; 8,0 mm"')).toEqual([["Tubus", "Mit Cuff; 8,0 mm"]]);
  });

  it('reads "" as a quote', () => {
    expect(fields('a;"Das ""Beste""; immer"')).toEqual([["a", 'Das "Beste"; immer']]);
  });

  it("keeps umlauts and other characters", () => {
    expect(fields("Führungsstab Säuglinge;Größe 10 × 10 ß")).toEqual([
      ["Führungsstab Säuglinge", "Größe 10 × 10 ß"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(fields('a;\n"";b\n')).toEqual([
      ["a", ""],
      ["", "b"],
    ]);
  });

  it("reports the line each row starts on, also after a line end inside quotes", () => {
    expect(parseCsv('a;b\n"x\ny";c\nd;e\n').map((row) => row.line)).toEqual([1, 2, 4]);
  });

  it("reports an unclosed quote with the line it opens on", () => {
    const error = failure('a;b\nc;"d\ne;f\n');

    expect(error.line).toBe(2);
    expect(error.message).toMatch(/^Zeile 2: .*nicht geschlossen/);
  });

  it.each([
    ["too few columns", "a;b\nc;d\ne\n"],
    ["too many columns", "a;b\nc;d\ne;f;g\n"],
    ["a trailing separator", "a;b\nc;d\ne;f;\n"],
    ["an empty line in the middle", "a;b\nc;d\n\ne;f\n"],
  ])("reports %s with its line", (_label, text) => {
    const error = failure(text);

    expect(error.line).toBe(3);
    expect(error.message).toMatch(/^Zeile 3: .*Spalten/);
  });

  it("allows only one empty last line", () => {
    expect(failure("a;b\n\n").line).toBe(2);
  });

  it.each([
    ["before a separator", 'a;b\n"c"x;d\n'],
    ["before a line end", 'a;b\nc;"d"x\n'],
    ["at the end of the file", 'a;b\nc;"d"x'],
    ["as a lone carriage return", 'a;b\nc;"d"\r'],
  ])("reports text behind a closing quote %s", (_label, text) => {
    const error = failure(text);

    expect(error.line).toBe(2);
    expect(error.message).toMatch(/^Zeile 2: .*schließenden/);
  });
});
