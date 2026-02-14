import {
  VALUE_OPTION_ID,
  compareByUnitPrice,
  getAutoSortSetting,
  normalizePrice,
  parseUnitPrice,
  waitForElement,
} from "./shared";
import type { SortableProduct } from "./types";

(function () {
  "use strict";

  const LOG_PREFIX = "[Tesco Unit Value]" as const;
  const VALUE_OPTION_TEXT = "Value (Unit Price)" as const;
  let valueSortActive = false;

  // --- Selectors ---
  const UNIT_PRICE_SELECTOR = '[class*="price__subtext"]';
  const CLUBCARD_UNIT_PRICE_SELECTOR = '[class*="value-bar__content-subtext"]';
  const PRODUCT_LIST_SELECTORS = ['[data-auto="product-list"]', "#list-content", "ul.product-list"];
  const DROPDOWN_LABEL_SELECTOR = ".ddsweb-dropdown__select-span";

  // --- Extraction ---

  function parseAndNormalize(text: string) {
    const parsed = parseUnitPrice(text);
    if (!parsed) {
      return null;
    }
    return normalizePrice(parsed.price, parsed.unit, LOG_PREFIX);
  }

  function extractUnitPrice(card: Element) {
    const regularEl = card.querySelector(UNIT_PRICE_SELECTOR);
    const clubcardEl = card.querySelector(CLUBCARD_UNIT_PRICE_SELECTOR);

    const regularPrice = regularEl ? parseAndNormalize(regularEl.textContent ?? "") : null;
    const clubcardPrice = clubcardEl
      ? parseAndNormalize(clubcardEl.textContent?.replaceAll(/[()]/g, "") ?? "")
      : null;

    if (clubcardPrice && regularPrice) {
      if (clubcardPrice.unit === regularPrice.unit) {
        return clubcardPrice.price <= regularPrice.price ? clubcardPrice : regularPrice;
      }
      return clubcardPrice;
    }

    return clubcardPrice ?? regularPrice ?? null;
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

  function updateDropdownLabel(select: HTMLSelectElement, text: string): void {
    const label = select.parentElement?.querySelector(DROPDOWN_LABEL_SELECTOR);
    if (label) {
      label.textContent = text;
    }
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

  let productObserver: MutationObserver | null = null;
  let productSortTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearPendingProductSort(): void {
    if (productSortTimeout !== null) {
      clearTimeout(productSortTimeout);
      productSortTimeout = null;
    }
  }

  function deactivateValueSort(): void {
    valueSortActive = false;
    clearPendingProductSort();
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }
  }

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

    // Pause observation while reordering to avoid self-triggered loops.
    const observerToResume = valueSortActive ? productObserver : null;
    if (observerToResume) {
      observerToResume.disconnect();
    }

    try {
      for (const item of sortable) {
        list.append(item.element);
      }
    } finally {
      if (observerToResume && valueSortActive) {
        const currentList = getProductList();
        if (currentList) {
          observerToResume.observe(currentList, { childList: true });
        }
      }
    }

    console.log(`${LOG_PREFIX} Sorted ${sortable.length} products by unit price`);
  }

  // --- Observers ---

  function observeProductList(): void {
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    const list = getProductList();
    if (!list) {
      return;
    }
    clearPendingProductSort();

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

      clearPendingProductSort();
      productSortTimeout = setTimeout(() => {
        productSortTimeout = null;
        if (valueSortActive) {
          sortByUnitPrice();
        }
      }, 300);
    });

    productObserver.observe(list, { childList: true });
  }

  // --- Injection ---

  const boundSelects = new WeakSet<HTMLSelectElement>();

  function injectValueOption(
    select: HTMLSelectElement,
    { autoActivate = true }: { autoActivate?: boolean } = {},
  ): void {
    const hasValueOption = Boolean(select.querySelector(`option[value="${VALUE_OPTION_ID}"]`));
    if (!hasValueOption) {
      const option = document.createElement("option");
      option.value = VALUE_OPTION_ID;
      option.textContent = VALUE_OPTION_TEXT;
      select.append(option);
      console.log(`${LOG_PREFIX} Injected "${VALUE_OPTION_TEXT}" sort option`);
    }

    if (!boundSelects.has(select)) {
      select.addEventListener(
        "change",
        (e) => {
          if (select.value === VALUE_OPTION_ID) {
            valueSortActive = true;
            e.stopImmediatePropagation();
            e.preventDefault();
            updateDropdownLabel(select, VALUE_OPTION_TEXT);
            sortByUnitPrice();
            observeProductList();
          } else {
            deactivateValueSort();
          }
        },
        true,
      );
      boundSelects.add(select);
    }

    if (autoActivate && !valueSortActive) {
      void (async () => {
        const autoSort = await getAutoSortSetting();
        if (!autoSort || valueSortActive) {
          return;
        }
        valueSortActive = true;
        select.value = VALUE_OPTION_ID;
        updateDropdownLabel(select, VALUE_OPTION_TEXT);
        sortByUnitPrice();
        observeProductList();
      })();
    }
  }

  // --- Attempt injection ---

  const SORT_SELECT_SELECTOR = 'select[id*="sort" i], select[data-auto*="sort" i]';

  let stopSortWatchers: (() => void) | null = null;
  let stopProductListWatch: (() => void) | null = null;

  function bindSortDropdown(select: HTMLSelectElement, source: string): void {
    console.log(`${LOG_PREFIX} Sort dropdown ${source}`);
    injectValueOption(select);
    observeSelectRerender(select);
    observeLabelRerender();
  }

  function watchForSortDropdown(): void {
    let stopSpecificWatch = (): void => {};
    let stopFallbackWatch = (): void => {};

    stopSortWatchers = () => {
      stopSpecificWatch();
      stopFallbackWatch();
      stopSortWatchers = null;
    };

    const tryInject = (source: string): boolean => {
      const dropdown = findSortDropdown();
      if (!dropdown) {
        return false;
      }

      if (stopSortWatchers) {
        stopSortWatchers();
      }
      bindSortDropdown(dropdown, `found via ${source}`);
      return true;
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

  function attemptInjection(): void {
    if (stopSortWatchers) {
      stopSortWatchers();
      stopSortWatchers = null;
    }

    const select = findSortDropdown();
    if (select) {
      bindSortDropdown(select, "found immediately");
      return;
    }

    console.log(`${LOG_PREFIX} Sort dropdown not found, watching for it...`);
    watchForSortDropdown();
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
        injectValueOption(currentSelect, { autoActivate: valueSortActive });
      }

      if (valueSortActive && currentSelect.value !== VALUE_OPTION_ID) {
        console.log(`${LOG_PREFIX} Value option deselected by re-render, re-selecting`);
        currentSelect.value = VALUE_OPTION_ID;
        updateDropdownLabel(currentSelect, VALUE_OPTION_TEXT);
        sortByUnitPrice();
        observeProductList();
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

    // Body-level observer is required: React may replace any ancestor of the select.
    // Value property changes (not attributes) can only be caught indirectly.
    // The syncScheduled flag batches callbacks to at most once per microtask.
    selectObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Re-apply visible label text after React re-renders the dropdown span
  let labelObserver: MutationObserver | null = null;

  function observeLabelRerender(): void {
    if (labelObserver) {
      labelObserver.disconnect();
      labelObserver = null;
    }

    let syncScheduled = false;

    labelObserver = new MutationObserver(() => {
      if (!valueSortActive || syncScheduled) {
        return;
      }
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        if (!valueSortActive) {
          return;
        }

        const currentSelect = findSortDropdown();
        if (!currentSelect) {
          return;
        }

        const label = currentSelect.parentElement?.querySelector(DROPDOWN_LABEL_SELECTOR);
        if (label && !label.textContent?.includes(VALUE_OPTION_TEXT)) {
          label.textContent = VALUE_OPTION_TEXT;
        }
      });
    });

    // Body-level observer: same rationale as observeSelectRerender above.
    labelObserver.observe(document.body, { childList: true, subtree: true });
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
        deactivateValueSort();
        if (selectObserver) {
          selectObserver.disconnect();
          selectObserver = null;
        }
        if (labelObserver) {
          labelObserver.disconnect();
          labelObserver = null;
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
      observeLabelRerender,
      observeSelectRerender,
      updateDropdownLabel,
      resetObservers: () => {
        deactivateValueSort();
        if (selectObserver) {
          selectObserver.disconnect();
          selectObserver = null;
        }
        if (labelObserver) {
          labelObserver.disconnect();
          labelObserver = null;
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
      extractUnitPrice,
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
