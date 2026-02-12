/** Raw parsed unit price from text like "(£6.30 per kilo)" */
export interface MorrisonsParsedPrice {
  price: number;
  unit: string;
}

/** Normalized price for comparison */
export interface MorrisonsNormalizedPrice {
  price: number;
  unit: string;
  comparable: boolean;
}

/** Entry in the normalization map */
export interface MorrisonsNormalizationEntry {
  target: string;
  multiplier: number;
}

/** Product wrapper with extracted price info for sorting */
export interface MorrisonsSortableProduct {
  element: HTMLElement;
  priceInfo: MorrisonsNormalizedPrice | null;
}

/** Test hook types */
interface MorrisonsValueSortTestHooks {
  findSortCombobox: () => HTMLElement | null;
  selectPricePerOption: (combobox: HTMLElement) => Promise<boolean>;
  parseUnitPrice: (text: string) => MorrisonsParsedPrice | null;
  normalizePrice: (price: number, unit: string) => MorrisonsNormalizedPrice;
  extractUnitPrice: (card: Element) => MorrisonsNormalizedPrice | null;
  sortProductsByUnitPrice: () => void;
  getProductContainer: () => HTMLElement | null;
  observeComboboxResets: () => void;
  observeProductLoads: () => void;
  waitForSelector: (selector: string, timeout?: number) => Promise<HTMLElement | null>;
  activateSort: () => void;
  init: () => void;
  valueSortActive: boolean;
  resetObservers: () => void;
}

/** Augment globalThis for test hooks */
declare global {
  // eslint-disable-next-line no-var
  var __MORRISONS_VALUE_SORT_TEST_MODE__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __MORRISONS_VALUE_SORT_TEST_HOOKS__: MorrisonsValueSortTestHooks | undefined;
}
