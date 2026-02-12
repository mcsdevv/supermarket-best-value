import type { NormalizationEntry, NormalizedPrice, ParsedPrice } from "./types";

// --- Constants ---
export const VALUE_OPTION_ID = "value-sort" as const;

// --- Unit price regex ---
// Matches: "£4.34/kg", "89p/100ml", "£1.20/100g DR.WT", "£0.75/each", "30p / ea"
export const UNIT_PRICE_REGEX = /^[£]?([\d.]+)p?\s*\/\s*(.+)$/i;

// --- Normalization map ---
// Converts all units to a base unit for fair comparison
export const NORMALIZATION_MAP: Record<string, NormalizationEntry> = {
  // Weight → per kg
  mg: { target: "kg", multiplier: 1_000_000 },
  g: { target: "kg", multiplier: 1000 },
  kg: { target: "kg", multiplier: 1 },
  oz: { target: "kg", multiplier: 35.273_962 },
  lb: { target: "kg", multiplier: 2.204_623 },

  // Volume → per litre
  ml: { target: "litre", multiplier: 1000 },
  cl: { target: "litre", multiplier: 100 },
  dl: { target: "litre", multiplier: 10 },
  litre: { target: "litre", multiplier: 1 },
  pt: { target: "litre", multiplier: 1.759_754 },
  floz: { target: "litre", multiplier: 35.195_08 },

  // Count-based
  each: { target: "each", multiplier: 1 },
  pack: { target: "pack", multiplier: 1 },
  roll: { target: "roll", multiplier: 1 },
  tablet: { target: "tablet", multiplier: 1 },
  capsule: { target: "capsule", multiplier: 1 },
  pod: { target: "pod", multiplier: 1 },
  bag: { target: "bag", multiplier: 1 },
  pair: { target: "pair", multiplier: 1 },
  bottle: { target: "bottle", multiplier: 1 },
  can: { target: "can", multiplier: 1 },
  jar: { target: "jar", multiplier: 1 },
  tub: { target: "tub", multiplier: 1 },
  tray: { target: "tray", multiplier: 1 },
  sachet: { target: "sachet", multiplier: 1 },
  stick: { target: "stick", multiplier: 1 },
  serving: { target: "serving", multiplier: 1 },
  portion: { target: "portion", multiplier: 1 },
  dozen: { target: "each", multiplier: 1 / 12 },

  // Sheets
  sht: { target: "sht", multiplier: 1 },

  // Wash/dose
  wash: { target: "wash", multiplier: 1 },

  // Metre
  m: { target: "m", multiplier: 1 },
  cm: { target: "m", multiplier: 100 },
  mm: { target: "m", multiplier: 1000 },
  ft: { target: "m", multiplier: 3.280_84 },
  yd: { target: "m", multiplier: 1.093_613 },
  inch: { target: "m", multiplier: 39.370_079 },

  // Area
  sqm: { target: "sqm", multiplier: 1 },
  sqft: { target: "sqm", multiplier: 10.763_91 },
};

// Unit group ordering for cross-unit sorting
export const UNIT_GROUP_ORDER: readonly string[] = [
  "kg",
  "litre",
  "each",
  "pack",
  "roll",
  "tablet",
  "capsule",
  "pod",
  "bag",
  "pair",
  "bottle",
  "can",
  "jar",
  "tub",
  "tray",
  "sachet",
  "stick",
  "serving",
  "portion",
  "wash",
  "sht",
  "m",
  "sqm",
];

const UNIT_ALIASES: Record<string, string> = {
  // Weight aliases
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  gram: "g",
  grams: "g",
  ounce: "oz",
  ounces: "oz",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",

  // Volume aliases
  l: "litre",
  liters: "litre",
  liter: "litre",
  litres: "litre",
  ltr: "litre",
  millilitre: "ml",
  millilitres: "ml",
  milliliter: "ml",
  milliliters: "ml",
  centilitre: "cl",
  centilitres: "cl",
  centiliter: "cl",
  centiliters: "cl",
  decilitre: "dl",
  decilitres: "dl",
  deciliter: "dl",
  deciliters: "dl",
  pint: "pt",
  pints: "pt",
  fluidounce: "floz",
  fluidounces: "floz",

  // Count aliases
  ea: "each",
  item: "each",
  unit: "each",
  pk: "pack",
  pkt: "pack",
  packet: "pack",
  packets: "pack",
  rolls: "roll",
  tab: "tablet",
  tabs: "tablet",
  tablets: "tablet",
  cap: "capsule",
  caps: "capsule",
  capsules: "capsule",
  pods: "pod",
  bags: "bag",
  pairs: "pair",
  bottles: "bottle",
  cans: "can",
  jars: "jar",
  tubs: "tub",
  trays: "tray",
  sachets: "sachet",
  sticks: "stick",
  servings: "serving",
  portions: "portion",
  doz: "dozen",

  // Sheets/wash aliases
  sheet: "sht",
  sheets: "sht",
  washes: "wash",
  wsh: "wash",
  dose: "wash",
  doses: "wash",

  // Length aliases
  mtr: "m",
  metre: "m",
  metres: "m",
  meter: "m",
  meters: "m",
  centimetre: "cm",
  centimetres: "cm",
  centimeter: "cm",
  centimeters: "cm",
  millimetre: "mm",
  millimetres: "mm",
  millimeter: "mm",
  millimeters: "mm",
  foot: "ft",
  feet: "ft",
  yard: "yd",
  yards: "yd",
  in: "inch",
  inches: "inch",

  // Area aliases
  m2: "sqm",
  sqmt: "sqm",
  sqfeet: "sqft",
  squarefoot: "sqft",
  squarefeet: "sqft",
  squaremeter: "sqm",
  squaremeters: "sqm",
  squaremetre: "sqm",
  squaremetres: "sqm",
};

// --- Parsing ---

export function parseUnitPrice(text: string): ParsedPrice | null {
  const cleaned = text.trim().replaceAll(/\s*DR\.?WT\.?\s*/gi, "");
  const match = cleaned.match(UNIT_PRICE_REGEX);
  if (!match) {
    return null;
  }

  let price = parseFloat(match[1]);
  const unit = match[2].trim().toLowerCase();

  // Handle pence: "89p/100ml" — no £ sign and original text has 'p' before '/'
  if (!cleaned.startsWith("£") && /^\d+(\.\d+)?p\s*\//i.test(cleaned)) {
    price /= 100;
  }

  return { price, unit };
}

function canonicalizeUnit(rawUnit: string): string {
  return rawUnit
    .trim()
    .toLowerCase()
    .replace(/^per\s+/i, "")
    .replaceAll(/\s+/g, "")
    .replaceAll(/\.$/g, "");
}

function resolveNormalizationEntry(rawUnit: string): NormalizationEntry | null {
  const unit = canonicalizeUnit(rawUnit);
  const directKey = UNIT_ALIASES[unit] ?? unit;
  const direct = NORMALIZATION_MAP[directKey];
  if (direct) {
    return direct;
  }

  const amountUnit = directKey.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
  if (!amountUnit) {
    return null;
  }

  const amount = parseFloat(amountUnit[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const baseUnit = UNIT_ALIASES[amountUnit[2]] ?? amountUnit[2];
  const baseNorm = NORMALIZATION_MAP[baseUnit];
  if (!baseNorm) {
    return null;
  }

  return {
    target: baseNorm.target,
    multiplier: baseNorm.multiplier / amount,
  };
}

export function normalizePrice(price: number, unit: string, logPrefix: string): NormalizedPrice {
  const norm = resolveNormalizationEntry(unit);
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

export function compareByUnitPrice(
  aInfo: NormalizedPrice | null,
  bInfo: NormalizedPrice | null,
): number {
  const aComparable = aInfo?.comparable ? aInfo : null;
  const bComparable = bInfo?.comparable ? bInfo : null;

  if (!aComparable && !bComparable) {
    return 0;
  }
  if (!aComparable) {
    return 1;
  }
  if (!bComparable) {
    return -1;
  }

  if (aComparable.unit === bComparable.unit) {
    return aComparable.price - bComparable.price;
  }

  const aOrder = UNIT_GROUP_ORDER.indexOf(aComparable.unit);
  const bOrder = UNIT_GROUP_ORDER.indexOf(bComparable.unit);
  const aIdx = aOrder === -1 ? 999 : aOrder;
  const bIdx = bOrder === -1 ? 999 : bOrder;

  if (aIdx !== bIdx) {
    return aIdx - bIdx;
  }
  return aComparable.price - bComparable.price;
}

// --- DOM utilities ---

function runSelectorCallback(selector: string, callback: (el: Element) => boolean | void): boolean {
  const found = document.querySelector(selector);
  if (!found) {
    return false;
  }
  return callback(found) !== false;
}

export function waitForElement(
  selector: string,
  callback: (el: Element) => boolean | void,
  maxWait = 10_000,
  {
    warnOnTimeout = true,
    logPrefix = "[Value Sort]",
  }: { warnOnTimeout?: boolean; logPrefix?: string } = {},
): () => void {
  let done = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const cleanup = (observer?: MutationObserver): void => {
    if (done) {
      return;
    }
    done = true;
    if (observer) {
      observer.disconnect();
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
  if (runSelectorCallback(selector, callback)) {
    done = true;
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (done) {
      return;
    }
    if (runSelectorCallback(selector, callback)) {
      cleanup(observer);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  timeoutId = setTimeout(() => {
    if (done) {
      return;
    }
    cleanup(observer);
    if (warnOnTimeout) {
      console.warn(`${logPrefix} Timed out waiting for "${selector}" after ${maxWait}ms`);
    }
  }, maxWait);
  return () => cleanup(observer);
}
