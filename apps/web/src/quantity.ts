/** Limits for typed quantities. Older records with more decimals stay usable, see the dialog. */
export const MAX_QUANTITY_DECIMALS = 3;
export const MAX_QUANTITY = 999_999_999;

// Enough for older values, and few enough to hide the rounding rest of a binary number.
const MAX_PRECISION_DECIMALS = 6;

export type ParsedQuantity = { ok: true; value: number } | { ok: false; message: string };

/** German notation without thousands separators, the same as in the input field. */
export function formatQuantity(value: number): string {
  return value.toLocaleString("de-DE", {
    useGrouping: false,
    maximumFractionDigits: MAX_PRECISION_DECIMALS,
  });
}

/** Comma or point as the separator. A point is never a thousands separator. */
function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(trimmed)) return null;
  return Number(trimmed.replace(",", "."));
}

function countDecimals(text: string): number {
  const fraction = text.trim().split(/[.,]/)[1] ?? "";
  return fraction.replace(/0+$/, "").length;
}

/** Validates a typed quantity for sending. */
export function parseQuantity(text: string): ParsedQuantity {
  if (text.trim() === "") return { ok: false, message: "Bitte eine Menge eingeben." };
  const value = parseDecimal(text);
  if (value === null) {
    return { ok: false, message: "Die Menge muss eine Zahl sein, zum Beispiel 1,5." };
  }
  if (value <= 0) return { ok: false, message: "Die Menge muss größer als 0 sein." };
  if (value > MAX_QUANTITY) {
    return { ok: false, message: `Die Menge darf höchstens ${MAX_QUANTITY} sein.` };
  }
  if (countDecimals(text) > MAX_QUANTITY_DECIMALS) {
    return {
      ok: false,
      message: `Die Menge darf höchstens ${MAX_QUANTITY_DECIMALS} Nachkommastellen haben.`,
    };
  }
  return { ok: true, value };
}

function decimalPlaces(value: number): number {
  const text = value.toString();
  if (text.includes("e")) return MAX_PRECISION_DECIMALS;
  return Math.min(text.split(".")[1]?.length ?? 0, MAX_PRECISION_DECIMALS);
}

/** Adds in whole units of the last decimal, so that 0.1 + 0.2 stays 0.3. */
export function addQuantities(a: number, b: number): number {
  const scale = 10 ** Math.max(decimalPlaces(a), decimalPlaces(b));
  return (Math.round(a * scale) + Math.round(b * scale)) / scale;
}

/**
 * The text after a press on + or −, or null when the step is not possible: the result would be 0 or
 * smaller or too big, or the text is no number. An empty field can only go up, to 1.
 */
export function stepQuantity(text: string, delta: number): string | null {
  if (text.trim() === "") return delta > 0 ? formatQuantity(delta) : null;
  const value = parseDecimal(text);
  if (value === null) return null;
  const result = addQuantities(value, delta);
  return result > 0 && result <= MAX_QUANTITY ? formatQuantity(result) : null;
}
