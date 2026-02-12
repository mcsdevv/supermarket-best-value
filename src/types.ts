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

/** Augment Window for test hooks */
declare global {
  interface Window {
    __TESCO_VALUE_SORT_TEST_MODE__?: boolean;
    __TESCO_VALUE_SORT_TEST_HOOKS__?: {
      VALUE_OPTION_ID: string;
      findSortDropdown: () => HTMLSelectElement | null;
      injectValueOption: (select: HTMLSelectElement) => void;
      observeSelectRerender: (select: HTMLSelectElement) => void;
      waitForElement: (
        selector: string,
        callback: (el: Element) => boolean | void,
        maxWait?: number,
        options?: { warnOnTimeout?: boolean }
      ) => () => void;
      attemptInjection: () => void;
      init: () => void;
      valueSortActive: boolean;
      sortByUnitPrice: () => void;
      observeProductList: () => void;
      getProductList: () => HTMLElement | null;
      resetObservers: () => void;
    };
  }
}
