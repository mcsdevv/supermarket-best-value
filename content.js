(function () {
  "use strict";

  const LOG_PREFIX = "[Tesco Value Sort]";
  const VALUE_OPTION_ID = "value-sort";
  let valueSortActive = false;

  // --- Selectors ---
  const UNIT_PRICE_SELECTOR = '[class*="price__subtext"]';
  const PRODUCT_LIST_SELECTORS = [
    '[data-auto="product-list"]',
    "#list-content",
    "ul.product-list",
  ];

  // --- Unit price regex ---
  // Matches: "£4.34/kg", "89p/100ml", "£1.20/100g DR.WT", "£0.75/each"
  const UNIT_PRICE_REGEX = /^[£]?([\d.]+)p?\s*\/\s*(.+)$/i;

  // --- Normalization map ---
  // Converts all units to a base unit for fair comparison
  const NORMALIZATION_MAP = {
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
  const UNIT_GROUP_ORDER = ["kg", "litre", "each", "wash", "sht", "m"];

  // --- Parsing ---

  function parseUnitPrice(text) {
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

  function normalizePrice(price, unit) {
    const norm = NORMALIZATION_MAP[unit];
    if (!norm) {
      console.warn(`${LOG_PREFIX} Unknown unit: "${unit}"`);
      return { price, unit, comparable: false };
    }
    return {
      price: price * norm.multiplier,
      unit: norm.target,
      comparable: true,
    };
  }

  function extractUnitPrice(card) {
    const el = card.querySelector(UNIT_PRICE_SELECTOR);
    if (!el) return null;

    const parsed = parseUnitPrice(el.textContent);
    if (!parsed) return null;

    return normalizePrice(parsed.price, parsed.unit);
  }

  // --- DOM finders ---

  function findSortDropdown() {
    // Strategy 1: data-auto or id containing "sort"
    let select = document.querySelector(
      'select[id*="sort" i], select[data-auto*="sort" i]'
    );
    if (select) return select;

    // Strategy 2: select near "Sort by" label text
    const textNodes = document.querySelectorAll("label, span, div, p");
    for (const node of textNodes) {
      if (
        node.childElementCount === 0 &&
        node.textContent.trim().toLowerCase().includes("sort by")
      ) {
        const parent = node.closest("div, form, fieldset, section");
        if (parent) {
          select = parent.querySelector("select");
          if (select) return select;
        }
      }
    }

    // Strategy 3: select with sorting-related options
    const selects = document.querySelectorAll("select");
    for (const sel of selects) {
      const optTexts = Array.from(sel.options).map((o) =>
        o.textContent.toLowerCase()
      );
      if (optTexts.some((t) => t.includes("relevance") || t.includes("price"))) {
        return sel;
      }
    }

    return null;
  }

  function getProductList() {
    for (const selector of PRODUCT_LIST_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function getProductCards(list) {
    return Array.from(list.querySelectorAll(":scope > li"));
  }

  // --- Sorting ---

  function sortByUnitPrice() {
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

    const sortable = cards.map((card) => ({
      element: card,
      priceInfo: extractUnitPrice(card),
    }));

    sortable.sort((a, b) => {
      const aInfo = a.priceInfo;
      const bInfo = b.priceInfo;

      // No price → bottom
      if (!aInfo && !bInfo) return 0;
      if (!aInfo) return 1;
      if (!bInfo) return -1;

      // Same unit → compare price directly
      if (aInfo.unit === bInfo.unit) {
        return aInfo.price - bInfo.price;
      }

      // Different units → group by unit type, then sort within group
      const aOrder = UNIT_GROUP_ORDER.indexOf(aInfo.unit);
      const bOrder = UNIT_GROUP_ORDER.indexOf(bInfo.unit);
      const aIdx = aOrder === -1 ? 999 : aOrder;
      const bIdx = bOrder === -1 ? 999 : bOrder;

      if (aIdx !== bIdx) return aIdx - bIdx;
      return aInfo.price - bInfo.price;
    });

    // Reorder DOM — appendChild moves existing nodes (no cloning)
    sortable.forEach((item) => list.appendChild(item.element));

    console.log(
      `${LOG_PREFIX} Sorted ${sortable.length} products by unit price`
    );
  }

  // --- Observers ---

  let productObserver = null;

  function observeProductList() {
    // Clean up previous observer
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    const list = getProductList();
    if (!list) return;

    let sortTimeout = null;

    productObserver = new MutationObserver((mutations) => {
      const hasNewProducts = mutations.some(
        (m) => m.addedNodes.length > 0 && m.type === "childList"
      );
      if (!hasNewProducts) return;

      // Only re-sort if "Value" is still selected
      const select = findSortDropdown();
      if (!select || select.value !== VALUE_OPTION_ID) return;

      clearTimeout(sortTimeout);
      sortTimeout = setTimeout(() => sortByUnitPrice(), 300);
    });

    productObserver.observe(list, { childList: true });
  }

  // --- Injection ---

  function injectValueOption(select) {
    if (select.querySelector(`option[value="${VALUE_OPTION_ID}"]`)) return;

    const option = document.createElement("option");
    option.value = VALUE_OPTION_ID;
    option.textContent = "Value (Unit Price)";
    select.appendChild(option);

    // Intercept at capture phase to fire before Tesco's React handler
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
      true
    );

    console.log(`${LOG_PREFIX} Injected "Value (Unit Price)" sort option`);

    // Auto-select Value sort on injection
    select.value = VALUE_OPTION_ID;
    sortByUnitPrice();
    observeProductList();
  }

  // --- Utilities ---

  function waitForElement(
    selector,
    callback,
    maxWait = 10000,
    { warnOnTimeout = true } = {}
  ) {
    let done = false;
    let timeoutId = null;

    const cleanup = (observer) => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };

    const runCallbackIfFound = () => {
      const found = document.querySelector(selector);
      if (!found) return false;
      // Returning false keeps the observer active.
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
          `${LOG_PREFIX} Timed out waiting for "${selector}" after ${maxWait}ms`
        );
      }
    }, maxWait);

    return () => cleanup(observer);
  }

  const SORT_SELECT_SELECTOR =
    'select[id*="sort" i], select[data-auto*="sort" i]';

  let stopSortWatchers = null;

  function attemptInjection() {
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

    let stopSpecificWatch = () => {};
    let stopFallbackWatch = () => {};

    stopSortWatchers = () => {
      stopSpecificWatch();
      stopFallbackWatch();
      stopSortWatchers = null;
    };

    const tryInject = (source) => {
      const dropdown = findSortDropdown();
      if (dropdown) {
        if (stopSortWatchers) stopSortWatchers();
        console.log(`${LOG_PREFIX} Sort dropdown found via ${source}`);
        injectValueOption(dropdown);
        observeSelectRerender(dropdown);
        return true;
      } else {
        return false;
      }
    };

    // Primary: sort-specific attributes
    stopSpecificWatch = waitForElement(
      SORT_SELECT_SELECTOR,
      () => tryInject("sort selector")
    );

    // Fallback: any select (for pages where sort select lacks sort-specific attrs)
    stopFallbackWatch = waitForElement(
      "select",
      () => tryInject("select fallback"),
      10000,
      { warnOnTimeout: false }
    );
  }

  // Re-inject if React re-renders the <select> and removes our option
  let selectObserver = null;

  function observeSelectRerender(select) {
    if (selectObserver) selectObserver.disconnect();

    let observedSelect = select;
    let syncScheduled = false;

    const syncSelectOption = () => {
      const currentSelect = findSortDropdown();
      if (!currentSelect) return;

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
      if (syncScheduled) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        syncSelectOption();
      });
    });

    selectObserver.observe(document.body, { childList: true, subtree: true });
  }

  // --- Init ---

  function init() {
    console.log(`${LOG_PREFIX} Initializing on ${location.href}`);
    attemptInjection();

    // Watch for SPA navigation (URL changes without full reload)
    let lastUrl = location.href;

    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log(`${LOG_PREFIX} SPA navigation to ${location.href}`);
        valueSortActive = false;
        // Clean up observers from previous page
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
        waitForElement(PRODUCT_LIST_SELECTORS[0], () => attemptInjection());
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (window.__TESCO_VALUE_SORT_TEST_MODE__) {
    window.__TESCO_VALUE_SORT_TEST_HOOKS__ = {
      VALUE_OPTION_ID,
      findSortDropdown,
      injectValueOption,
      observeSelectRerender,
      waitForElement,
      attemptInjection,
      get valueSortActive() { return valueSortActive; },
      set valueSortActive(v) { valueSortActive = v; },
      sortByUnitPrice,
      observeProductList,
      getProductList,
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
      },
    };
    return;
  }

  init();
})();
