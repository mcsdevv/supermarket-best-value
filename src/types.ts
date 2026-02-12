/** Raw parsed unit price from text like "£4.34/kg" or "89p/100ml" */
export interface ParsedPrice {
  price: number;
  unit: string;
}

/** Normalized price for comparison */
export interface NormalizedPrice {
  price: number;
  unit: string;
  comparable: boolean;
}

/** Entry in the normalization map */
export interface NormalizationEntry {
  target: string;
  multiplier: number;
}

/** Product card with extracted price info for sorting */
export interface SortableProduct {
  element: HTMLElement;
  priceInfo: NormalizedPrice | null;
}

/** Common test hook shape shared by all site scripts */
interface SiteTestHooks {
  VALUE_OPTION_ID: string;
  findSortDropdown: () => HTMLSelectElement | null;
  injectValueOption: (select: HTMLSelectElement) => void;
  observeSelectRerender: (select: HTMLSelectElement) => void;
  waitForElement: (
    selector: string,
    callback: (el: Element) => boolean | void,
    maxWait?: number,
    options?: { warnOnTimeout?: boolean; logPrefix?: string },
  ) => () => void;
  attemptInjection: () => void;
  init: () => void;
  valueSortActive: boolean;
  sortByUnitPrice: () => void;
  observeProductList: () => void;
  getProductList: () => HTMLElement | null;
  resetObservers: () => void;
}

interface MorrisonsValueSortTestHooks {
  findSortCombobox: () => HTMLElement | null;
  selectPricePerOption: (combobox: HTMLElement) => Promise<boolean>;
  parseUnitPrice: (text: string) => ParsedPrice | null;
  normalizePrice: (price: number, unit: string) => NormalizedPrice;
  extractUnitPrice: (card: Element) => NormalizedPrice | null;
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

interface WaitroseValueSortTestHooks {
  VALUE_OPTION_NAME: string;
  findSortContainers: () => Element[];
  injectValueOption: (container: Element) => void;
  observeDropdownOpen: (container: Element) => void;
  waitForElement: (
    selector: string,
    callback: (el: Element) => boolean | void,
    maxWait?: number,
    options?: { warnOnTimeout?: boolean },
  ) => () => void;
  attemptInjection: () => void;
  init: () => void;
  valueSortActive: boolean;
  sortByUnitPrice: () => void;
  observeProductGrid: () => void;
  getProductGrid: () => HTMLElement | null;
  parseWaitroseUnitPrice: (text: string) => ParsedPrice | null;
  extractUnitPrice: (card: Element) => NormalizedPrice | null;
  resetObservers: () => void;
}

/** Augment globalThis for test hooks */
declare global {
  // eslint-disable-next-line no-var
  var __TESCO_VALUE_SORT_TEST_MODE__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __TESCO_VALUE_SORT_TEST_HOOKS__: SiteTestHooks | undefined;
  // eslint-disable-next-line no-var
  var __SAINSBURYS_VALUE_SORT_TEST_MODE__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __SAINSBURYS_VALUE_SORT_TEST_HOOKS__: SiteTestHooks | undefined;
  // eslint-disable-next-line no-var
  var __MORRISONS_VALUE_SORT_TEST_MODE__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __MORRISONS_VALUE_SORT_TEST_HOOKS__: MorrisonsValueSortTestHooks | undefined;
  // eslint-disable-next-line no-var
  var __WAITROSE_VALUE_SORT_TEST_MODE__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __WAITROSE_VALUE_SORT_TEST_HOOKS__: WaitroseValueSortTestHooks | undefined;
}
