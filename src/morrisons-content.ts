import type { ParsedPrice, NormalizedPrice, SortableProduct } from "./types";
import { normalizePrice, compareByUnitPrice } from "./shared";

(function () {
  "use strict";

  const LOG_PREFIX = "[Morrisons Value Sort]" as const;
  const TARGET_SORT_VALUE = "pricePerAscending" as const;
  const TARGET_SORT_TEXT = "Price per: Low to High" as const;
  let valueSortActive = false;

  // --- Selectors ---
  const SORT_COMBOBOX_SELECTOR = '[data-test="sort-button"]';
  const LISTBOX_SELECTOR = '[role="listbox"]';
  const OPTION_SELECTOR = '[role="option"]';
  const PRODUCT_WRAPPER_SELECTOR = '[data-test^="fop-wrapper:"]';
  const UNIT_PRICE_SELECTOR = '[data-test="fop-price-per-unit"]';
  const PRODUCTS_PAGE_SELECTOR = '[data-test="products-page"]';
  const SKELETON_SELECTOR = '[data-test="fop-skeleton"]';

  // --- Unit price regex ---
  // Matches: "(£6.30 per kilo)", "(£1.50 per litre)", "(£0.15 per 100ml)"
  const MORRISONS_PRICE_REGEX = /\(£([\d.]+)\s+per\s+(.+?)\)/i;

  // --- Parsing ---

  function parseUnitPrice(text: string): ParsedPrice | null {
    const match = text.match(MORRISONS_PRICE_REGEX);
    if (!match) return null;
    return { price: parseFloat(match[1]), unit: match[2].trim().toLowerCase() };
  }

  function extractUnitPrice(card: Element): NormalizedPrice | null {
    const el = card.querySelector(UNIT_PRICE_SELECTOR);
    if (!el) return null;

    const parsed = parseUnitPrice(el.textContent ?? "");
    if (!parsed) return null;

    return normalizePrice(parsed.price, parsed.unit, LOG_PREFIX);
  }

  // --- DOM finders ---

  function findSortCombobox(): HTMLElement | null {
    // Strategy 1: data-test attribute
    let combobox = document.querySelector<HTMLElement>(SORT_COMBOBOX_SELECTOR);
    if (combobox) return combobox;

    // Strategy 2: role=combobox near "Sort by" text
    const textNodes = document.querySelectorAll("h2, label, span, div, p");
    for (const node of textNodes) {
      if (node.childElementCount === 0 && node.textContent?.trim().toLowerCase() === "sort by") {
        const parent = node.closest("div, form, fieldset, section");
        if (parent) {
          combobox = parent.querySelector<HTMLElement>('[role="combobox"]');
          if (combobox) return combobox;
        }
      }
    }

    return null;
  }

  function getProductContainer(): HTMLElement | null {
    const firstProduct = document.querySelector<HTMLElement>(PRODUCT_WRAPPER_SELECTOR);
    return firstProduct?.parentElement ?? null;
  }

  function getProductWrappers(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(PRODUCT_WRAPPER_SELECTOR));
  }

  // --- Utilities ---

  function waitForSelector(selector: string, timeout = 10000): Promise<HTMLElement | null> {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const ac = new AbortController();

      const observer = new MutationObserver(() => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          ac.abort();
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        if (!ac.signal.aborted) {
          observer.disconnect();
          resolve(null);
        }
      }, timeout);
    });
  }

  // --- Combobox Interaction ---

  function selectPricePerOption(combobox: HTMLElement): Promise<boolean> {
    // Check if already selected
    const currentText = (combobox.textContent ?? "").trim();
    if (currentText.includes(TARGET_SORT_TEXT)) {
      console.log(`${LOG_PREFIX} Already sorted by price per unit`);
      return Promise.resolve(true);
    }

    // Click combobox to open dropdown
    combobox.click();

    // Wait for listbox to appear
    return waitForSelector(LISTBOX_SELECTOR, 2000).then((listbox) => {
      if (!listbox) {
        console.warn(`${LOG_PREFIX} Listbox did not appear after clicking combobox`);
        return false;
      }

      const options = listbox.querySelectorAll<HTMLElement>(OPTION_SELECTOR);

      // Strategy 1: match by data-value
      for (const option of options) {
        if (option.getAttribute("data-value") === TARGET_SORT_VALUE) {
          option.click();
          console.log(`${LOG_PREFIX} Selected "${TARGET_SORT_TEXT}"`);
          return true;
        }
      }

      // Strategy 2: match by text content
      for (const option of options) {
        if ((option.textContent ?? "").toLowerCase().includes("price per: low")) {
          option.click();
          console.log(`${LOG_PREFIX} Selected price-per option by text match`);
          return true;
        }
      }

      console.warn(`${LOG_PREFIX} Could not find price-per option in listbox`);
      return false;
    });
  }

  // --- Sorting ---

  function sortProductsByUnitPrice(): void {
    const container = getProductContainer();
    if (!container) {
      console.error(`${LOG_PREFIX} Product container not found`);
      return;
    }

    const wrappers = getProductWrappers(container);
    if (wrappers.length === 0) {
      console.warn(`${LOG_PREFIX} No product wrappers found`);
      return;
    }

    // Collect skeletons to re-append at end
    const skeletons = Array.from(container.querySelectorAll<HTMLElement>(SKELETON_SELECTOR));

    const sortable: SortableProduct[] = wrappers.map((el) => ({
      element: el,
      priceInfo: extractUnitPrice(el),
    }));

    sortable.sort((a, b) => compareByUnitPrice(a.priceInfo, b.priceInfo));

    // Pause observation while reordering to avoid self-triggered sort loops.
    if (productObserver) productObserver.disconnect();

    try {
      sortable.forEach((item) => container.appendChild(item.element));
      skeletons.forEach((sk) => container.appendChild(sk));
    } finally {
      if (productObserver) {
        const currentContainer = getProductContainer();
        if (currentContainer) {
          productObserver.observe(currentContainer, { childList: true });
        }
      }
    }

    console.log(`${LOG_PREFIX} Client-side sorted ${sortable.length} products`);
  }

  // --- Observers ---

  let comboboxObserver: MutationObserver | null = null;
  let productObserver: MutationObserver | null = null;
  let spaObserver: MutationObserver | null = null;

  function observeComboboxResets(): void {
    if (comboboxObserver) comboboxObserver.disconnect();

    let syncScheduled = false;

    comboboxObserver = new MutationObserver(() => {
      if (!valueSortActive) return;
      if (syncScheduled) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        const combobox = findSortCombobox();
        if (!combobox) return;

        const text = (combobox.textContent ?? "").trim();
        if (!text.includes(TARGET_SORT_TEXT)) {
          console.log(`${LOG_PREFIX} Sort reset detected, re-selecting`);
          selectPricePerOption(combobox);
        }
      });
    });

    comboboxObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function observeProductLoads(): void {
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    const container = getProductContainer();
    if (!container) return;

    let sortTimeout: ReturnType<typeof setTimeout> | null = null;

    productObserver = new MutationObserver((mutations) => {
      if (!valueSortActive) return;

      const hasNewProducts = mutations.some(
        (m) => m.addedNodes.length > 0 && m.type === "childList",
      );
      if (!hasNewProducts) return;

      if (sortTimeout !== null) clearTimeout(sortTimeout);
      sortTimeout = setTimeout(() => sortProductsByUnitPrice(), 300);
    });

    productObserver.observe(container, { childList: true });
  }

  // --- Init ---

  async function activateSort(): Promise<void> {
    const combobox = findSortCombobox();
    if (!combobox) {
      console.warn(`${LOG_PREFIX} Sort combobox not found`);
      return;
    }

    const success = await selectPricePerOption(combobox);
    if (success) {
      valueSortActive = true;
      observeComboboxResets();
      // Wait for server response to update DOM, then client-side sort
      setTimeout(() => {
        sortProductsByUnitPrice();
        observeProductLoads();
      }, 1000);
    }
  }

  function init(): void {
    const loc = document.location;
    console.log(`${LOG_PREFIX} Initializing on ${loc.href}`);

    void (async () => {
      const page = await waitForSelector(PRODUCTS_PAGE_SELECTOR, 10000);
      if (!page) {
        console.warn(`${LOG_PREFIX} Products page not found within 10s`);
        return;
      }
      const combobox = await waitForSelector(SORT_COMBOBOX_SELECTOR, 10000);
      if (combobox) activateSort();
    })();

    // Watch for SPA navigation
    let lastUrl = loc.href;

    if (spaObserver) spaObserver.disconnect();

    spaObserver = new MutationObserver(() => {
      if (loc.href !== lastUrl) {
        lastUrl = loc.href;
        console.log(`${LOG_PREFIX} SPA navigation to ${loc.href}`);
        valueSortActive = false;
        if (comboboxObserver) {
          comboboxObserver.disconnect();
          comboboxObserver = null;
        }
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }

        void (async () => {
          const page = await waitForSelector(PRODUCTS_PAGE_SELECTOR, 10000);
          if (!page) return;
          const combobox = await waitForSelector(SORT_COMBOBOX_SELECTOR, 10000);
          if (combobox) activateSort();
        })();
      }
    });

    spaObserver.observe(document.body, { childList: true, subtree: true });
  }

  // --- Test Mode ---

  if (globalThis.__MORRISONS_VALUE_SORT_TEST_MODE__) {
    globalThis.__MORRISONS_VALUE_SORT_TEST_HOOKS__ = {
      findSortCombobox,
      selectPricePerOption,
      parseUnitPrice,
      normalizePrice: (price: number, unit: string) => normalizePrice(price, unit, LOG_PREFIX),
      extractUnitPrice,
      sortProductsByUnitPrice,
      getProductContainer,
      observeComboboxResets,
      observeProductLoads,
      waitForSelector,
      activateSort,
      init,
      get valueSortActive() {
        return valueSortActive;
      },
      set valueSortActive(v: boolean) {
        valueSortActive = v;
      },
      resetObservers: () => {
        valueSortActive = false;
        if (comboboxObserver) {
          comboboxObserver.disconnect();
          comboboxObserver = null;
        }
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }
        if (spaObserver) {
          spaObserver.disconnect();
          spaObserver = null;
        }
      },
    };
    return;
  }

  init();
})();
