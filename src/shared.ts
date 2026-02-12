import type { ParsedPrice, NormalizedPrice, NormalizationEntry } from "./types";

// --- Constants ---
export const VALUE_OPTION_ID = "value-sort" as const;

// --- Unit price regex ---
// Matches: "£4.34/kg", "89p/100ml", "£1.20/100g DR.WT", "£0.75/each", "30p / ea"
export const UNIT_PRICE_REGEX = /^[£]?([\d.]+)p?\s*\/\s*(.+)$/i;

// --- Normalization map ---
// Converts all units to a base unit for fair comparison
export const NORMALIZATION_MAP: Record<string, NormalizationEntry> = {
  // Weight → per kg
  g: { target: "kg", multiplier: 1000 },
  "100g": { target: "kg", multiplier: 10 },
  kg: { target: "kg", multiplier: 1 },

  // Volume → per litre
  ml: { target: "litre", multiplier: 1000 },
  "10ml": { target: "litre", multiplier: 100 },
  "100ml": { target: "litre", multiplier: 10 },
  cl: { target: "litre", multiplier: 10 },
  "75cl": { target: "litre", multiplier: 1.33333 },
  l: { target: "litre", multiplier: 1 },
  litre: { target: "litre", multiplier: 1 },
  ltr: { target: "litre", multiplier: 1 },

  // Count-based
  each: { target: "each", multiplier: 1 },
  ea: { target: "each", multiplier: 1 },

  // Sheets
  sht: { target: "sht", multiplier: 1 },
  "100sht": { target: "sht", multiplier: 0.01 },

  // Wash/dose
  wash: { target: "wash", multiplier: 1 },
  wsh: { target: "wash", multiplier: 1 },

  // Metre
  m: { target: "m", multiplier: 1 },
  mtr: { target: "m", multiplier: 1 },
};

// Unit group ordering for cross-unit sorting
export const UNIT_GROUP_ORDER: readonly string[] = ["kg", "litre", "each", "wash", "sht", "m"];

// --- Parsing ---

export function parseUnitPrice(text: string): ParsedPrice | null {
  const cleaned = text.trim().replace(/\s*DR\.?WT\.?\s*/gi, "");
  const match = cleaned.match(UNIT_PRICE_REGEX);
  if (!match) return null;

  let price = parseFloat(match[1]);
  const unit = match[2].trim().toLowerCase();

  // Handle pence: "89p/100ml" — no £ sign and original text has 'p' before '/'
  if (!cleaned.startsWith("£") && /^\d+(\.\d+)?p\s*\//i.test(cleaned)) {
    price = price / 100;
  }

  return { price, unit };
}

export function normalizePrice(price: number, unit: string, logPrefix: string): NormalizedPrice {
  const norm = NORMALIZATION_MAP[unit];
  if (!norm) {
    console.warn(`${logPrefix} Unknown unit: "${unit}"`);
    return { price, unit, comparable: false };
  }
  return {
    price: price * norm.multiplier,
    unit: norm.target,
    comparable: true,
  };
}

// --- Sorting comparator ---

export function compareByUnitPrice(aInfo: NormalizedPrice | null, bInfo: NormalizedPrice | null): number {
  if (!aInfo && !bInfo) return 0;
  if (!aInfo) return 1;
  if (!bInfo) return -1;

  if (aInfo.unit === bInfo.unit) {
    return aInfo.price - bInfo.price;
  }

  const aOrder = UNIT_GROUP_ORDER.indexOf(aInfo.unit);
  const bOrder = UNIT_GROUP_ORDER.indexOf(bInfo.unit);
  const aIdx = aOrder === -1 ? 999 : aOrder;
  const bIdx = bOrder === -1 ? 999 : bOrder;

  if (aIdx !== bIdx) return aIdx - bIdx;
  return aInfo.price - bInfo.price;
}

// --- DOM utilities ---

export function waitForElement(
  selector: string,
  callback: (el: Element) => boolean | void,
  maxWait = 10000,
  { warnOnTimeout = true, logPrefix = "[Value Sort]" }: { warnOnTimeout?: boolean; logPrefix?: string } = {}
): () => void {
  let done = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = (observer?: MutationObserver): void => {
    if (done) return;
    done = true;
    if (observer) observer.disconnect();
    if (timeoutId !== null) clearTimeout(timeoutId);
  };

  const runCallbackIfFound = (): boolean => {
    const found = document.querySelector(selector);
    if (!found) return false;
    return callback(found) !== false;
  };

  if (runCallbackIfFound()) {
    done = true;
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (done) return;
    if (runCallbackIfFound()) cleanup(observer);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  timeoutId = setTimeout(() => {
    if (done) return;
    cleanup(observer);
    if (warnOnTimeout) {
      console.warn(
        `${logPrefix} Timed out waiting for "${selector}" after ${maxWait}ms`
      );
    }
  }, maxWait);

  return () => cleanup(observer);
}
