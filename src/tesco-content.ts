import type { SortableProduct } from "./types";
import {
  VALUE_OPTION_ID,
  parseUnitPrice,
  normalizePrice,
  compareByUnitPrice,
  waitForElement,
} from "./shared";

(function () {
  "use strict";

  const LOG_PREFIX = "[Tesco Value Sort]" as const;
  let valueSortActive = false;

  // --- Selectors ---
  const UNIT_PRICE_SELECTOR = '[class*="price__subtext"]';
  const PRODUCT_LIST_SELECTORS = ['[data-auto="product-list"]', "#list-content", "ul.product-list"];

  // --- Extraction ---

  function extractUnitPrice(card: Element) {
    const el = card.querySelector(UNIT_PRICE_SELECTOR);
    if (!el) {
      return null;
    }

    const parsed = parseUnitPrice(el.textContent ?? "");
    if (!parsed) {
      return null;
    }

    return normalizePrice(parsed.price, parsed.unit, LOG_PREFIX);
  }

  // --- DOM finders ---

  function findSortDropdown(): HTMLSelectElement | null {
    // Strategy 1: data-auto or id containing "sort"
    let select = document.querySelector<HTMLSelectElement>(
      'select[id*="sort" i], select[data-auto*="sort" i]',
    );
    if (select) {
      return select;
    }

    // Strategy 2: select near "Sort by" label text
    const textNodes = document.querySelectorAll("label, span, div, p");
    for (const node of textNodes) {
      if (
        node.childElementCount === 0 &&
        node.textContent?.trim().toLowerCase().includes("sort by")
      ) {
        const parent = node.closest("div, form, fieldset, section");
        if (parent) {
          select = parent.querySelector<HTMLSelectElement>("select");
          if (select) {
            return select;
          }
        }
      }
    }

    // Strategy 3: select with sorting-related options
    const selects = document.querySelectorAll<HTMLSelectElement>("select");
    for (const sel of selects) {
      const optTexts = [...sel.options].map((o) => o.textContent?.toLowerCase() ?? "");
      if (optTexts.some((t) => t.includes("relevance") || t.includes("price"))) {
        return sel;
      }
    }

    return null;
  }

  function getProductList(): HTMLElement | null {
    for (const selector of PRODUCT_LIST_SELECTORS) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        return el;
      }
    }
    return null;
  }

  function getProductCards(list: HTMLElement): HTMLLIElement[] {
    return [...list.querySelectorAll<HTMLLIElement>(":scope > li")];
  }

  // --- Sorting ---

  function sortByUnitPrice(): void {
    const list = getProductList();
    if (!list) {
      console.error(`${LOG_PREFIX} Product list not found`);
      return;
    }

    const cards = getProductCards(list);
    if (cards.length === 0) {
      console.warn(`${LOG_PREFIX} No product cards found`);
      return;
    }

    const sortable: SortableProduct[] = cards.map((card) => ({
      element: card,
      priceInfo: extractUnitPrice(card),
    }));

    sortable.sort((a, b) => compareByUnitPrice(a.priceInfo, b.priceInfo));

    // Reorder DOM — appendChild moves existing nodes (no cloning)
    sortable.forEach((item) => list.append(item.element));

    console.log(`${LOG_PREFIX} Sorted ${sortable.length} products by unit price`);
  }

  // --- Observers ---

  let productObserver: MutationObserver | null = null;

  function observeProductList(): void {
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    const list = getProductList();
    if (!list) {
      return;
    }

    let sortTimeout: ReturnType<typeof setTimeout> | null = null;

    productObserver = new MutationObserver((mutations) => {
      const hasNewProducts = mutations.some(
        (m) => m.addedNodes.length > 0 && m.type === "childList",
      );
      if (!hasNewProducts) {
        return;
      }

      const select = findSortDropdown();
      if (!select || select.value !== VALUE_OPTION_ID) {
        return;
      }

      if (sortTimeout !== null) {
        clearTimeout(sortTimeout);
      }
      sortTimeout = setTimeout(() => sortByUnitPrice(), 300);
    });

    productObserver.observe(list, { childList: true });
  }

  // --- Injection ---

  function injectValueOption(select: HTMLSelectElement): void {
    if (select.querySelector(`option[value="${VALUE_OPTION_ID}"]`)) {
      return;
    }

    const option = document.createElement("option");
    option.value = VALUE_OPTION_ID;
    option.textContent = "Value (Unit Price)";
    select.append(option);

    select.addEventListener(
      "change",
      (e) => {
        if (select.value === VALUE_OPTION_ID) {
          valueSortActive = true;
          e.stopImmediatePropagation();
          e.preventDefault();
          sortByUnitPrice();
          observeProductList();
        } else {
          valueSortActive = false;
        }
      },
      true,
    );

    console.log(`${LOG_PREFIX} Injected "Value (Unit Price)" sort option`);

    select.value = VALUE_OPTION_ID;
    sortByUnitPrice();
    observeProductList();
  }

  // --- Attempt injection ---

  const SORT_SELECT_SELECTOR = 'select[id*="sort" i], select[data-auto*="sort" i]';

  let stopSortWatchers: (() => void) | null = null;
  let stopProductListWatch: (() => void) | null = null;

  function attemptInjection(): void {
    if (stopSortWatchers) {
      stopSortWatchers();
      stopSortWatchers = null;
    }

    const select = findSortDropdown();
    if (select) {
      console.log(`${LOG_PREFIX} Sort dropdown found immediately`);
      injectValueOption(select);
      observeSelectRerender(select);
      return;
    }

    console.log(`${LOG_PREFIX} Sort dropdown not found, watching for it...`);

    let stopSpecificWatch = (): void => {};
    let stopFallbackWatch = (): void => {};

    stopSortWatchers = () => {
      stopSpecificWatch();
      stopFallbackWatch();
      stopSortWatchers = null;
    };

    const tryInject = (source: string): boolean => {
      const dropdown = findSortDropdown();
      if (dropdown) {
        if (stopSortWatchers) {
          stopSortWatchers();
        }
        console.log(`${LOG_PREFIX} Sort dropdown found via ${source}`);
        injectValueOption(dropdown);
        observeSelectRerender(dropdown);
        return true;
      }
      return false;
    };

    // Primary: sort-specific attributes
    stopSpecificWatch = waitForElement(
      SORT_SELECT_SELECTOR,
      () => tryInject("sort selector"),
      10_000,
      {
        logPrefix: LOG_PREFIX,
      },
    );

    // Fallback: any select (for pages where sort select lacks sort-specific attrs)
    stopFallbackWatch = waitForElement("select", () => tryInject("select fallback"), 10_000, {
      logPrefix: LOG_PREFIX,
      warnOnTimeout: false,
    });
  }

  // Re-inject if React re-renders the <select> and removes our option
  let selectObserver: MutationObserver | null = null;

  function observeSelectRerender(select: HTMLSelectElement): void {
    if (selectObserver) {
      selectObserver.disconnect();
    }

    let observedSelect = select;
    let syncScheduled = false;

    const syncSelectOption = (): void => {
      const currentSelect = findSortDropdown();
      if (!currentSelect) {
        return;
      }

      if (currentSelect !== observedSelect) {
        observedSelect = currentSelect;
        console.log(`${LOG_PREFIX} Sort dropdown replaced, re-binding`);
      }

      if (!currentSelect.querySelector(`option[value="${VALUE_OPTION_ID}"]`)) {
        console.log(`${LOG_PREFIX} Value option removed by re-render, re-injecting`);
        injectValueOption(currentSelect);
      } else if (currentSelect.value !== VALUE_OPTION_ID) {
        console.log(`${LOG_PREFIX} Value option deselected by re-render, re-selecting`);
        currentSelect.value = VALUE_OPTION_ID;
        sortByUnitPrice();
        observeProductList();
      }

      if (valueSortActive && currentSelect.value !== VALUE_OPTION_ID) {
        currentSelect.value = VALUE_OPTION_ID;
      }
    };

    selectObserver = new MutationObserver(() => {
      if (syncScheduled) {
        return;
      }
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        syncSelectOption();
      });
    });

    selectObserver.observe(document.body, { childList: true, subtree: true });
  }

  // --- Init ---

  function init(): void {
    const loc = document.location;
    console.log(`${LOG_PREFIX} Initializing on ${loc.href}`);

    // Gate on product list to ensure page is sufficiently rendered before
    // Looking for the sort dropdown. waitForElement checks immediately first,
    // So pages where the product list is already in the DOM work without delay.
    const productListSelector = PRODUCT_LIST_SELECTORS.join(", ");
    stopProductListWatch = waitForElement(productListSelector, () => attemptInjection(), 10_000, {
      logPrefix: LOG_PREFIX,
    });

    let lastUrl = loc.href;

    new MutationObserver(() => {
      if (loc.href !== lastUrl) {
        lastUrl = loc.href;
        console.log(`${LOG_PREFIX} SPA navigation to ${loc.href}`);
        valueSortActive = false;
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }
        if (selectObserver) {
          selectObserver.disconnect();
          selectObserver = null;
        }
        if (stopSortWatchers) {
          stopSortWatchers();
          stopSortWatchers = null;
        }
        if (stopProductListWatch) {
          stopProductListWatch();
          stopProductListWatch = null;
        }
        stopProductListWatch = waitForElement(
          productListSelector,
          () => attemptInjection(),
          10_000,
          {
            logPrefix: LOG_PREFIX,
          },
        );
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (globalThis.__TESCO_VALUE_SORT_TEST_MODE__) {
    globalThis.__TESCO_VALUE_SORT_TEST_HOOKS__ = {
      VALUE_OPTION_ID,
      attemptInjection,
      findSortDropdown,
      getProductList,
      init,
      injectValueOption,
      observeProductList,
      observeSelectRerender,
      resetObservers: () => {
        valueSortActive = false;
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }
        if (selectObserver) {
          selectObserver.disconnect();
          selectObserver = null;
        }
        if (stopSortWatchers) {
          stopSortWatchers();
          stopSortWatchers = null;
        }
        if (stopProductListWatch) {
          stopProductListWatch();
          stopProductListWatch = null;
        }
      },
      sortByUnitPrice,
      get valueSortActive() {
        return valueSortActive;
      },
      set valueSortActive(v: boolean) {
        valueSortActive = v;
      },
      waitForElement,
    };
    return;
  }

  init();
})();
