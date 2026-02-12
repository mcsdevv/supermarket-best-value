(function () {
  "use strict";

  const LOG_PREFIX = "[Morrisons Value Sort]";
  const TARGET_SORT_VALUE = "pricePerAscending";
  const TARGET_SORT_TEXT = "Price per: Low to High";
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

  // --- Normalization map ---
  const NORMALIZATION_MAP = {
    kilo: { target: "kg", multiplier: 1 },
    kg: { target: "kg", multiplier: 1 },
    "100g": { target: "kg", multiplier: 10 },
    litre: { target: "litre", multiplier: 1 },
    ltr: { target: "litre", multiplier: 1 },
    "100ml": { target: "litre", multiplier: 10 },
    ml: { target: "litre", multiplier: 1000 },
    each: { target: "each", multiplier: 1 },
    ea: { target: "each", multiplier: 1 },
    sht: { target: "sht", multiplier: 1 },
    "100sht": { target: "sht", multiplier: 0.01 },
    wash: { target: "wash", multiplier: 1 },
    m: { target: "m", multiplier: 1 },
    mtr: { target: "m", multiplier: 1 },
  };

  const UNIT_GROUP_ORDER = ["kg", "litre", "each", "wash", "sht", "m"];

  // --- Parsing ---

  function parseUnitPrice(text) {
    const match = text.match(MORRISONS_PRICE_REGEX);
    if (!match) return null;
    return { price: parseFloat(match[1]), unit: match[2].trim().toLowerCase() };
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

    const parsed = parseUnitPrice(el.textContent || "");
    if (!parsed) return null;

    return normalizePrice(parsed.price, parsed.unit);
  }

  // --- DOM finders ---

  function findSortCombobox() {
    // Strategy 1: data-test attribute
    var combobox = document.querySelector(SORT_COMBOBOX_SELECTOR);
    if (combobox) return combobox;

    // Strategy 2: role=combobox near "Sort by" text
    var textNodes = document.querySelectorAll("h2, label, span, div, p");
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      if (
        node.childElementCount === 0 &&
        node.textContent.trim().toLowerCase() === "sort by"
      ) {
        var parent = node.closest("div, form, fieldset, section");
        if (parent) {
          combobox = parent.querySelector('[role="combobox"]');
          if (combobox) return combobox;
        }
      }
    }

    return null;
  }

  function getProductContainer() {
    var firstProduct = document.querySelector(PRODUCT_WRAPPER_SELECTOR);
    return firstProduct ? firstProduct.parentElement : null;
  }

  function getProductWrappers(container) {
    return Array.from(container.querySelectorAll(PRODUCT_WRAPPER_SELECTOR));
  }

  // --- Utilities ---

  function waitForSelector(selector, timeout) {
    if (timeout === undefined) timeout = 10000;

    return new Promise(function (resolve) {
      var existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }

      var done = false;

      var observer = new MutationObserver(function () {
        if (done) return;
        var el = document.querySelector(selector);
        if (el) {
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // --- Combobox Interaction ---

  function selectPricePerOption(combobox) {
    // Check if already selected
    var currentText = (combobox.textContent || "").trim();
    if (currentText.includes(TARGET_SORT_TEXT)) {
      console.log(LOG_PREFIX + " Already sorted by price per unit");
      return Promise.resolve(true);
    }

    // Click combobox to open dropdown
    combobox.click();

    // Wait for listbox to appear
    return waitForSelector(LISTBOX_SELECTOR, 2000).then(function (listbox) {
      if (!listbox) {
        console.warn(LOG_PREFIX + " Listbox did not appear after clicking combobox");
        return false;
      }

      var options = listbox.querySelectorAll(OPTION_SELECTOR);

      // Strategy 1: match by data-value
      for (var i = 0; i < options.length; i++) {
        if (options[i].getAttribute("data-value") === TARGET_SORT_VALUE) {
          options[i].click();
          console.log(LOG_PREFIX + ' Selected "' + TARGET_SORT_TEXT + '"');
          return true;
        }
      }

      // Strategy 2: match by text content
      for (var j = 0; j < options.length; j++) {
        if ((options[j].textContent || "").toLowerCase().includes("price per: low")) {
          options[j].click();
          console.log(LOG_PREFIX + " Selected price-per option by text match");
          return true;
        }
      }

      console.warn(LOG_PREFIX + " Could not find price-per option in listbox");
      return false;
    });
  }

  // --- Sorting ---

  function sortProductsByUnitPrice() {
    var container = getProductContainer();
    if (!container) {
      console.error(LOG_PREFIX + " Product container not found");
      return;
    }

    var wrappers = getProductWrappers(container);
    if (wrappers.length === 0) {
      console.warn(LOG_PREFIX + " No product wrappers found");
      return;
    }

    // Collect skeletons to re-append at end
    var skeletons = Array.from(container.querySelectorAll(SKELETON_SELECTOR));

    var sortable = wrappers.map(function (el) {
      return { element: el, priceInfo: extractUnitPrice(el) };
    });

    sortable.sort(function (a, b) {
      var aInfo = a.priceInfo;
      var bInfo = b.priceInfo;

      // No price → bottom
      if (!aInfo && !bInfo) return 0;
      if (!aInfo) return 1;
      if (!bInfo) return -1;

      // Same unit → compare price directly
      if (aInfo.unit === bInfo.unit) {
        return aInfo.price - bInfo.price;
      }

      // Different units → group by unit type, then sort within group
      var aOrder = UNIT_GROUP_ORDER.indexOf(aInfo.unit);
      var bOrder = UNIT_GROUP_ORDER.indexOf(bInfo.unit);
      var aIdx = aOrder === -1 ? 999 : aOrder;
      var bIdx = bOrder === -1 ? 999 : bOrder;

      if (aIdx !== bIdx) return aIdx - bIdx;
      return aInfo.price - bInfo.price;
    });

    // Reorder DOM: products first, then skeletons
    sortable.forEach(function (item) {
      container.appendChild(item.element);
    });
    skeletons.forEach(function (sk) {
      container.appendChild(sk);
    });

    console.log(
      LOG_PREFIX + " Client-side sorted " + sortable.length + " products"
    );
  }

  // --- Observers ---

  var comboboxObserver = null;
  var productObserver = null;

  function observeComboboxResets() {
    if (comboboxObserver) comboboxObserver.disconnect();

    var syncScheduled = false;

    comboboxObserver = new MutationObserver(function () {
      if (!valueSortActive) return;
      if (syncScheduled) return;
      syncScheduled = true;
      queueMicrotask(function () {
        syncScheduled = false;
        var combobox = findSortCombobox();
        if (!combobox) return;

        var text = (combobox.textContent || "").trim();
        if (!text.includes(TARGET_SORT_TEXT)) {
          console.log(LOG_PREFIX + " Sort reset detected, re-selecting");
          selectPricePerOption(combobox);
        }
      });
    });

    comboboxObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function observeProductLoads() {
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    var container = getProductContainer();
    if (!container) return;

    var sortTimeout = null;

    productObserver = new MutationObserver(function (mutations) {
      if (!valueSortActive) return;

      var hasNewProducts = mutations.some(function (m) {
        return m.addedNodes.length > 0 && m.type === "childList";
      });
      if (!hasNewProducts) return;

      if (sortTimeout !== null) clearTimeout(sortTimeout);
      sortTimeout = setTimeout(function () {
        sortProductsByUnitPrice();
      }, 300);
    });

    productObserver.observe(container, { childList: true });
  }

  // --- Init ---

  function activateSort() {
    var combobox = findSortCombobox();
    if (!combobox) {
      console.warn(LOG_PREFIX + " Sort combobox not found");
      return;
    }

    selectPricePerOption(combobox).then(function (success) {
      if (success) {
        valueSortActive = true;
        observeComboboxResets();
        // Wait for server response to update DOM, then client-side sort
        setTimeout(function () {
          sortProductsByUnitPrice();
          observeProductLoads();
        }, 1000);
      }
    });
  }

  function init() {
    console.log(LOG_PREFIX + " Initializing on " + location.href);

    waitForSelector(PRODUCTS_PAGE_SELECTOR, 10000).then(function (page) {
      if (!page) {
        console.warn(LOG_PREFIX + " Products page not found within 10s");
        return;
      }
      waitForSelector(SORT_COMBOBOX_SELECTOR, 10000).then(function (combobox) {
        if (combobox) activateSort();
      });
    });

    // Watch for SPA navigation
    var lastUrl = location.href;

    new MutationObserver(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log(LOG_PREFIX + " SPA navigation to " + location.href);
        valueSortActive = false;
        if (comboboxObserver) {
          comboboxObserver.disconnect();
          comboboxObserver = null;
        }
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }

        waitForSelector(PRODUCTS_PAGE_SELECTOR, 10000).then(function (page) {
          if (!page) return;
          waitForSelector(SORT_COMBOBOX_SELECTOR, 10000).then(function (combobox) {
            if (combobox) activateSort();
          });
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // --- Test Mode ---

  if (window.__MORRISONS_VALUE_SORT_TEST_MODE__) {
    window.__MORRISONS_VALUE_SORT_TEST_HOOKS__ = {
      findSortCombobox: findSortCombobox,
      selectPricePerOption: selectPricePerOption,
      parseUnitPrice: parseUnitPrice,
      normalizePrice: normalizePrice,
      extractUnitPrice: extractUnitPrice,
      sortProductsByUnitPrice: sortProductsByUnitPrice,
      getProductContainer: getProductContainer,
      observeComboboxResets: observeComboboxResets,
      observeProductLoads: observeProductLoads,
      waitForSelector: waitForSelector,
      activateSort: activateSort,
      init: init,
      get valueSortActive() {
        return valueSortActive;
      },
      set valueSortActive(v) {
        valueSortActive = v;
      },
      resetObservers: function () {
        valueSortActive = false;
        if (comboboxObserver) {
          comboboxObserver.disconnect();
          comboboxObserver = null;
        }
        if (productObserver) {
          productObserver.disconnect();
          productObserver = null;
        }
      },
    };
    return;
  }

  init();
})();
