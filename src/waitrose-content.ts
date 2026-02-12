import type { ParsedPrice, NormalizedPrice, SortableProduct } from "./types";
import { normalizePrice, compareByUnitPrice, waitForElement } from "./shared";

(function () {
  "use strict";

  const LOG_PREFIX = "[Waitrose Value Sort]" as const;
  const VALUE_OPTION_NAME = "VALUE_UNIT_PRICE" as const;
  let valueSortActive = false;

  // --- Selectors (partial class match for resilience to CSS hash changes) ---
  const UNIT_PRICE_SELECTOR = '[class*="pricePerUnit___"]';
  const PRODUCT_GRID_SELECTOR = '[class*="flexGrid___"]';
  const PRODUCT_CARD_SELECTOR = 'article[class*="productPod___"]';
  const SORT_CONTAINER_SELECTOR = '[class*="sortBy___"]';
  const SORT_BUTTON_SELECTOR = '[class*="dropdownButton___"]';

  // --- Waitrose unit price regex ---
  // Handles: "£5.19/litre", "£3.32/kg", "46.7p each", "£1.20 each"
  // The text from the DOM includes "Price per unit" prefix which must be stripped first.
  const WAITROSE_UNIT_PRICE_REGEX = /^[£]?([\d.]+)p?\s*(?:\/|\s+)(.+)$/i;

  // --- Parsing ---

  function parseWaitroseUnitPrice(text: string): ParsedPrice | null {
    // Strip "Price per unit" sr-only prefix
    const cleaned = text.replace(/Price per unit/i, "").trim();

    // "per kg" with no numeric value → unparseable
    if (/^per\s+/i.test(cleaned)) return null;

    const match = cleaned.match(WAITROSE_UNIT_PRICE_REGEX);
    if (!match) return null;

    let price = parseFloat(match[1]);
    const unit = match[2].trim().toLowerCase();

    // Handle pence: "46.7p each" — no £ sign and text has 'p' before separator
    if (!cleaned.startsWith("£") && /^\d+(\.\d+)?p(?:\s*\/|\s+)/i.test(cleaned)) {
      price /= 100;
    }

    return { price, unit };
  }

  function extractUnitPrice(card: Element): NormalizedPrice | null {
    const el = card.querySelector(UNIT_PRICE_SELECTOR);
    if (!el) return null;

    const parsed = parseWaitroseUnitPrice(el.textContent ?? "");
    if (!parsed) return null;

    return normalizePrice(parsed.price, parsed.unit, LOG_PREFIX);
  }

  // --- DOM finders ---

  function findSortContainers(): Element[] {
    return [...document.querySelectorAll(SORT_CONTAINER_SELECTOR)];
  }

  function getProductGrid(): HTMLElement | null {
    return document.querySelector<HTMLElement>(PRODUCT_GRID_SELECTOR);
  }

  function getProductCards(grid: HTMLElement): HTMLElement[] {
    return [...grid.querySelectorAll<HTMLElement>(PRODUCT_CARD_SELECTOR)];
  }

  // --- Sorting ---

  function sortByUnitPrice(): void {
    const grid = getProductGrid();
    if (!grid) {
      console.error(`${LOG_PREFIX} Product grid not found`);
      return;
    }

    const cards = getProductCards(grid);
    if (cards.length === 0) {
      console.warn(`${LOG_PREFIX} No product cards found`);
      return;
    }

    const sortable: SortableProduct[] = cards.map((card) => ({
      element: card,
      priceInfo: extractUnitPrice(card),
    }));

    sortable.sort((a, b) => compareByUnitPrice(a.priceInfo, b.priceInfo));

    // Reorder DOM — appendChild moves existing nodes (no cloning).
    // Pause observation while reordering to avoid self-triggered sort loops.
    const observerToResume = valueSortActive ? productObserver : null;
    if (observerToResume) {
      observerToResume.disconnect();
    }

    try {
      for (const item of sortable) {
        grid.appendChild(item.element);
      }
    } finally {
      if (observerToResume) {
        const currentGrid = getProductGrid();
        if (currentGrid) {
          observerToResume.observe(currentGrid, { childList: true, subtree: true });
        }
      }
    }

    console.log(`${LOG_PREFIX} Sorted ${sortable.length} products by unit price`);
  }

  // --- Observers ---

  let productObserver: MutationObserver | null = null;

  function observeProductGrid(): void {
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }

    const grid = getProductGrid();
    if (!grid) return;

    let sortTimeout: ReturnType<typeof setTimeout> | null = null;

    const mutationAddsProductCard = (mutation: MutationRecord): boolean => {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) {
        return false;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }
        if (node.matches(PRODUCT_CARD_SELECTOR) || node.querySelector(PRODUCT_CARD_SELECTOR)) {
          return true;
        }
      }
      return false;
    };

    productObserver = new MutationObserver((mutations) => {
      const hasNewProducts = mutations.some((mutation) => mutationAddsProductCard(mutation));
      if (!hasNewProducts || !valueSortActive) {
        return;
      }

      if (sortTimeout !== null) clearTimeout(sortTimeout);
      sortTimeout = setTimeout(() => sortByUnitPrice(), 300);
    });

    productObserver.observe(grid, { childList: true, subtree: true });
  }

  // --- Button text management ---

  function getButtonTextSpan(container: Element): Element | null {
    const btn = container.querySelector(SORT_BUTTON_SELECTOR);
    if (!btn) return null;
    return btn.querySelector('[class*="typography___"]');
  }

  function updateButtonText(container: Element, sortName: string): void {
    const span = getButtonTextSpan(container);
    if (span) {
      span.textContent = `Sort By, ${sortName}`;
    }
  }

  function updateAllButtonTexts(sortName: string): void {
    for (const container of findSortContainers()) {
      updateButtonText(container, sortName);
    }
  }

  // --- Button text observer (fights React re-renders) ---

  let buttonObserver: MutationObserver | null = null;

  function observeButtonRerender(): void {
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }

    let syncScheduled = false;

    buttonObserver = new MutationObserver(() => {
      if (!valueSortActive || syncScheduled) return;
      syncScheduled = true;
      queueMicrotask(() => {
        syncScheduled = false;
        if (!valueSortActive) return;

        for (const container of findSortContainers()) {
          const span = getButtonTextSpan(container);
          if (span && !span.textContent?.includes("Value (Unit Price)")) {
            updateButtonText(container, "Value (Unit Price)");
          }
        }
      });
    });

    buttonObserver.observe(document.body, { childList: true, subtree: true });
  }

  // --- Dropdown injection ---

  const dropdownObservers: MutationObserver[] = [];

  function createValueOption(templateLabel: Element): Element {
    const label = templateLabel.cloneNode(true) as HTMLElement;

    // Update radio input
    const radio = label.querySelector('input[type="radio"]') as HTMLInputElement | null;
    if (radio) {
      radio.name = VALUE_OPTION_NAME;
      radio.checked = false;
    }

    // Update text
    const textEl = label.querySelector('[class*="paragraphHeading___"]');
    if (textEl) {
      textEl.textContent = "Value (Unit Price)";
    }

    // Handle click - capture phase to fire before Waitrose's React handler
    label.addEventListener(
      "click",
      (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();

        valueSortActive = true;

        // Uncheck other radios in all sort containers
        for (const container of findSortContainers()) {
          for (const r of container.querySelectorAll('input[type="radio"]')) {
            (r as HTMLInputElement).checked = false;
          }
        }

        // Check our radio
        if (radio) radio.checked = true;

        // Sort products
        sortByUnitPrice();
        observeProductGrid();

        // Update button text across all containers
        updateAllButtonTexts("Value (Unit Price)");

        // Close dropdown by clicking the button
        const sortContainer = label.closest(SORT_CONTAINER_SELECTOR);
        if (sortContainer) {
          const btn = sortContainer.querySelector<HTMLElement>(SORT_BUTTON_SELECTOR);
          if (btn) btn.click();
        }

        // Watch for React re-renders of button text
        observeButtonRerender();
      },
      true,
    );

    return label;
  }

  function injectValueOption(container: Element): void {
    // Find the content div (second child, holds options when dropdown is open)
    const btn = container.querySelector(SORT_BUTTON_SELECTOR);
    if (!btn) return;

    // The content div is a sibling of the button (or a child of the container)
    const contentDivs = container.querySelectorAll(":scope > div");
    let contentDiv: Element | null = null;
    for (const div of contentDivs) {
      if (div !== btn && div !== btn.parentElement) {
        contentDiv = div;
        break;
      }
    }
    if (!contentDiv) return;

    // Set up observer for when dropdown opens (content div gets children)
    const observer = new MutationObserver(() => {
      injectIntoOpenDropdown(container, contentDiv!);
    });

    observer.observe(contentDiv, { childList: true, subtree: true });
    dropdownObservers.push(observer);

    // Also inject immediately if dropdown is already open
    injectIntoOpenDropdown(container, contentDiv);

    // Listen for native sort option clicks to deactivate our sort
    observeNativeSortClicks(container);

    console.log(`${LOG_PREFIX} Set up dropdown injection observer`);
  }

  function injectIntoOpenDropdown(_container: Element, contentDiv: Element): void {
    // Find the options container (div with label children)
    const labels = contentDiv.querySelectorAll('label[class*="label___"]');
    if (labels.length === 0) return;

    // Check if already injected
    const existing = contentDiv.querySelector(`input[name="${VALUE_OPTION_NAME}"]`);
    if (existing) return;

    const optionsContainer = labels[0].parentElement;
    if (!optionsContainer) return;

    // Clone last label as template
    const templateLabel = labels[labels.length - 1];
    const valueOption = createValueOption(templateLabel);

    // Add divider (empty <p> element like the others)
    const dividers = optionsContainer.querySelectorAll(':scope > p[class*="subtext___"]');
    if (dividers.length > 0) {
      const divider = dividers[0].cloneNode(true);
      optionsContainer.appendChild(divider);
    }

    optionsContainer.appendChild(valueOption);

    // If value sort was active, check our radio
    if (valueSortActive) {
      const radio = valueOption.querySelector('input[type="radio"]') as HTMLInputElement | null;
      if (radio) radio.checked = true;

      // Uncheck other radios
      for (const r of optionsContainer.querySelectorAll('input[type="radio"]')) {
        if ((r as HTMLInputElement).name !== VALUE_OPTION_NAME) {
          (r as HTMLInputElement).checked = false;
        }
      }
    }

    console.log(`${LOG_PREFIX} Injected "Value (Unit Price)" option into dropdown`);
  }

  // --- Handle native sort option clicks (deactivate our sort) ---

  function observeNativeSortClicks(container: Element): void {
    container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const label = target.closest?.('label[class*="label___"]');
      if (!label) return;

      const radio = label.querySelector('input[type="radio"]') as HTMLInputElement | null;
      if (!radio || radio.name === VALUE_OPTION_NAME) return;

      // User clicked a native sort option
      valueSortActive = false;
      if (buttonObserver) {
        buttonObserver.disconnect();
        buttonObserver = null;
      }
    });
  }

  // --- Injection orchestration ---

  let stopSortWatchers: (() => void) | null = null;
  let stopProductGridWatch: (() => void) | null = null;

  function attemptInjection(): void {
    if (stopSortWatchers) {
      stopSortWatchers();
      stopSortWatchers = null;
    }

    const containers = findSortContainers();
    if (containers.length > 0) {
      console.log(`${LOG_PREFIX} Found ${containers.length} sort container(s)`);
      for (const container of containers) {
        injectValueOption(container);
      }

      // Auto-activate value sort
      valueSortActive = true;
      sortByUnitPrice();
      observeProductGrid();
      updateAllButtonTexts("Value (Unit Price)");
      observeButtonRerender();
      return;
    }

    console.log(`${LOG_PREFIX} Sort container not found, watching...`);

    stopSortWatchers = waitForElement(
      SORT_CONTAINER_SELECTOR,
      () => {
        const found = findSortContainers();
        if (found.length === 0) return false;

        console.log(`${LOG_PREFIX} Sort container(s) appeared`);
        for (const container of found) {
          injectValueOption(container);
        }

        // Auto-activate value sort
        valueSortActive = true;
        sortByUnitPrice();
        observeProductGrid();
        updateAllButtonTexts("Value (Unit Price)");
        observeButtonRerender();
        return true;
      },
      10000,
      { logPrefix: LOG_PREFIX },
    );
  }

  // --- Init ---

  function init(): void {
    const loc = document.location;
    console.log(`${LOG_PREFIX} Initializing on ${loc.href}`);

    // Gate on product grid before looking for sort controls
    stopProductGridWatch = waitForElement(PRODUCT_GRID_SELECTOR, () => attemptInjection(), 10000, {
      logPrefix: LOG_PREFIX,
    });

    // Watch for SPA navigation
    let lastUrl = loc.href;

    new MutationObserver(() => {
      if (loc.href !== lastUrl) {
        lastUrl = loc.href;
        console.log(`${LOG_PREFIX} SPA navigation to ${loc.href}`);
        resetObservers();
        stopProductGridWatch = waitForElement(
          PRODUCT_GRID_SELECTOR,
          () => attemptInjection(),
          10000,
          { logPrefix: LOG_PREFIX },
        );
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function resetObservers(): void {
    valueSortActive = false;
    if (productObserver) {
      productObserver.disconnect();
      productObserver = null;
    }
    if (buttonObserver) {
      buttonObserver.disconnect();
      buttonObserver = null;
    }
    for (const obs of dropdownObservers) {
      obs.disconnect();
    }
    dropdownObservers.length = 0;
    if (stopSortWatchers) {
      stopSortWatchers();
      stopSortWatchers = null;
    }
    if (stopProductGridWatch) {
      stopProductGridWatch();
      stopProductGridWatch = null;
    }
  }

  // --- Test mode ---

  if (globalThis.__WAITROSE_VALUE_SORT_TEST_MODE__) {
    globalThis.__WAITROSE_VALUE_SORT_TEST_HOOKS__ = {
      VALUE_OPTION_NAME,
      attemptInjection,
      extractUnitPrice,
      findSortContainers,
      getProductGrid,
      init,
      injectValueOption,
      observeDropdownOpen: injectValueOption,
      observeProductGrid,
      parseWaitroseUnitPrice,
      resetObservers,
      sortByUnitPrice,
      get valueSortActive() {
        return valueSortActive;
      },
      set valueSortActive(v: boolean) {
        valueSortActive = v;
      },
      waitForElement: (
        selector: string,
        callback: (el: Element) => boolean | void,
        maxWait?: number,
        options?: { warnOnTimeout?: boolean },
      ) => waitForElement(selector, callback, maxWait, { ...options, logPrefix: LOG_PREFIX }),
    };
    return;
  }

  init();
})();
