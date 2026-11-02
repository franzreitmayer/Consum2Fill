import { describe, expect, it } from "vitest";
import {
  addQuantities,
  formatQuantity,
  MAX_QUANTITY,
  parseQuantity,
  stepQuantity,
} from "./quantity";

describe("formatQuantity", () => {
  it.each<[number, string]>([
    [1, "1"],
    [1.5, "1,5"],
    [0.30000000000000004, "0,3"],
    [1234.5, "1234,5"],
    [0.125, "0,125"],
  ])("shows %d as %s", (value, text) => {
    expect(formatQuantity(value)).toBe(text);
  });
});

describe("parseQuantity", () => {
  it.each<[string, number]>([
    ["1", 1],
    ["1,5", 1.5],
    ["1.5", 1.5],
    [" 2,25 ", 2.25],
    [",5", 0.5],
    ["5,", 5],
    ["1,500", 1.5],
    ["0,001", 0.001],
    ["1,5000", 1.5],
    ["1,000", 1],
    ["0.125", 0.125],
    ["12.5", 12.5],
    ["1.50", 1.5],
    [String(MAX_QUANTITY), MAX_QUANTITY],
  ])("accepts %j", (text, value) => {
    expect(parseQuantity(text)).toEqual({ ok: true, value });
  });

  it.each<[string, RegExp]>([
    ["", /Bitte eine Menge/],
    ["   ", /Bitte eine Menge/],
    ["abc", /muss eine Zahl sein/],
    ["1,2,3", /muss eine Zahl sein/],
    ["1.2,3", /muss eine Zahl sein/],
    ["1e5", /muss eine Zahl sein/],
    [",", /muss eine Zahl sein/],
    ["0", /größer als 0/],
    ["0,0", /größer als 0/],
    ["-1", /größer als 0/],
    ["1,2345", /Nachkommastellen/],
    ["1.000", /Tausenderpunkt/],
    ["12.345", /Tausenderpunkt/],
    ["999.999", /Tausenderpunkt/],
    ["1.000.000", /Tausenderpunkt/],
    ["1.000,5", /Tausenderpunkt/],
    ["1.000,", /Tausenderpunkt/],
    [String(MAX_QUANTITY + 1), /höchstens/],
  ])("rejects %j", (text, message) => {
    const result = parseQuantity(text);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toMatch(message);
  });
});

describe("addQuantities", () => {
  it.each<[number, number, number]>([
    [0.1, 0.2, 0.3],
    [1.5, 1, 2.5],
    [1.1, 1, 2.1],
    [2.3, -1, 1.3],
    [1.005, 1, 2.005],
    [0.7, 0.1, 0.8],
    [0.30000000000000004, 1, 1.3],
  ])("%d + %d = %d exactly", (a, b, sum) => {
    expect(addQuantities(a, b)).toBe(sum);
  });
});

describe("stepQuantity", () => {
  it.each<[string, number, string]>([
    ["1", 1, "2"],
    ["2", -1, "1"],
    ["1,5", 1, "2,5"],
    ["1.5", 1, "2,5"],
    ["1,5", -1, "0,5"],
    ["1,1", 1, "2,1"],
    ["0,5", 1, "1,5"],
    ["0", 1, "1"],
    ["", 1, "1"],
    ["1,000", 1, "2"],
    ["1,5000", 1, "2,5"],
    ["1,234", 1, "2,234"],
  ])("changes %j by %d to %s", (text, delta, result) => {
    expect(stepQuantity(text, delta)).toBe(result);
  });

  it.each<[string, number]>([
    ["1", -1],
    ["0,5", -1],
    ["0", -1],
    ["", -1],
    ["-3", 1],
    ["abc", 1],
    ["1,2,3", 1],
    ["1.000", 1],
    ["1.000,5", -1],
    ["1,23456", 1],
    ["1,23456", -1],
    [String(MAX_QUANTITY), 1],
  ])("blocks %j with %d", (text, delta) => {
    expect(stepQuantity(text, delta)).toBeNull();
  });
});
