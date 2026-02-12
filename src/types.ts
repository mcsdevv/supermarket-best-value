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
  element: HTMLLIElement;
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
}
