const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "..", "dist", "waitrose-content.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function delay(window, ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setAutoSortSetting(window, enabled) {
  window.chrome = {
    storage: {
      local: {
        get: (_key, callback) => callback({ autoSort: enabled }),
        set: () => {},
      },
    },
  };
}

// --- DOM Helpers ---

function createSortContainer(doc) {
  const container = doc.createElement("div");
  container.className = "sortBy___abc123";

  const button = doc.createElement("button");
  button.className = "button___abc dropdownButton___abc";
  const span = doc.createElement("span");
  span.className = "typography___abc paragraphHeading___abc";
  span.textContent = "Sort By, Popularity";
  button.appendChild(span);
  button.appendChild(doc.createElementNS("http://www.w3.org/2000/svg", "svg"));
  container.appendChild(button);

  // Content div (empty when closed)
  const contentWrapper = doc.createElement("div");
  container.appendChild(contentWrapper);

  return { container, button, span, contentWrapper };
}

function createDropdownOptions(doc, radioNames) {
  const content = doc.createElement("div");
  content.className = "content___abc";

  const labels = {
    MOST_POPULAR: "Popularity",
    TOP_RATED: "Top rated",
    A_2_Z: "Alphabetical",
    Z_2_A: "Alphabetical reverse",
    PRICE_LOW_2_HIGH: "Price low to high",
    PRICE_HIGH_2_LOW: "Price high to low",
  };

  for (const name of radioNames) {
    const label = doc.createElement("label");
    label.className = "label___abc item___abc";

    const wrapper = doc.createElement("div");
    wrapper.className = "wrapper___abc";

    const input = doc.createElement("input");
    input.type = "radio";
    input.name = name;
    if (name === radioNames[0]) input.checked = true;
    wrapper.appendChild(input);

    const fakeInput = doc.createElement("div");
    fakeInput.className = "fakeInput fakeInput___abc";
    const checkMark = doc.createElement("div");
    checkMark.className = "checkMark___abc";
    fakeInput.appendChild(checkMark);
    wrapper.appendChild(fakeInput);

    label.appendChild(wrapper);

    const spacer = doc.createElement("span");
    spacer.className = "spacer___abc";
    label.appendChild(spacer);

    const p = doc.createElement("p");
    p.className = "typography___abc paragraphHeading___abc noMargins___abc";
    p.textContent = labels[name] || name;
    label.appendChild(p);

    content.appendChild(label);

    // Add divider after each option
    const divider = doc.createElement("p");
    divider.className = "typography___abc paragraphSmall___abc subtext___abc";
    content.appendChild(divider);
  }

  return content;
}

function createProductGrid(doc, products) {
  const grid = doc.createElement("div");
  grid.className = "flexGrid___abc";

  for (const product of products) {
    const article = doc.createElement("article");
    article.className = "productPod___abc";

    if (product.unitPrice) {
      const priceSpan = doc.createElement("span");
      priceSpan.className = "pricePerUnit___abc priceInfo___abc";

      const srOnly = doc.createElement("p");
      srOnly.className = "sr-only";
      srOnly.textContent = "Price per unit";
      priceSpan.appendChild(srOnly);

      priceSpan.appendChild(doc.createTextNode(product.unitPrice));
      article.appendChild(priceSpan);
    }

    if (product.name) {
      const nameEl = doc.createElement("span");
      nameEl.textContent = product.name;
      article.appendChild(nameEl);
    }

    grid.appendChild(article);
  }

  return grid;
}

function setupDom(bodyHtml = "") {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url: "https://www.waitrose.com/ecom/shop/browse/groceries/fresh_and_chilled",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const warnings = [];
  const logs = [];

  window.console.warn = (...args) => warnings.push(args.join(" "));
  window.console.log = (...args) => logs.push(args.join(" "));
  window.console.error = () => {};

  window.__WAITROSE_VALUE_SORT_TEST_MODE__ = true;
  window.eval(SCRIPT_SOURCE);

  const hooks = window.__WAITROSE_VALUE_SORT_TEST_HOOKS__;
  assert.ok(hooks, "test hooks not initialized");

  return { dom, window, document: window.document, hooks, logs, warnings };
}

// --- Tests ---

test("parseWaitroseUnitPrice parses pounds-per-litre format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit\u00a35.19/litre");
  assert.ok(result);
  assert.equal(result.price, 5.19);
  assert.equal(result.unit, "litre");
});

test("parseWaitroseUnitPrice parses pounds-per-kg format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit\u00a33.32/kg");
  assert.ok(result);
  assert.equal(result.price, 3.32);
  assert.equal(result.unit, "kg");
});

test("parseWaitroseUnitPrice parses pence-each format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit46.7p each");
  assert.ok(result);
  assert.ok(Math.abs(result.price - 0.467) < 0.001, `expected ~0.467, got ${result.price}`);
  assert.equal(result.unit, "each");
});

test("parseWaitroseUnitPrice parses pence-per-100g format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit89p/100g");
  assert.ok(result);
  assert.equal(result.price, 0.89);
  assert.equal(result.unit, "100g");
});

test("parseWaitroseUnitPrice parses pounds-each format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit\u00a31.20 each");
  assert.ok(result);
  assert.equal(result.price, 1.2);
  assert.equal(result.unit, "each");
});

test("parseWaitroseUnitPrice parses no-decimal format", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unit\u00a35/kg");
  assert.ok(result);
  assert.equal(result.price, 5);
  assert.equal(result.unit, "kg");
});

test("parseWaitroseUnitPrice returns null for per-unit-only text", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const result = env.hooks.parseWaitroseUnitPrice("Price per unitper kg");
  assert.equal(result, null);
});

test("findSortContainers finds all sort containers", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const sort1 = createSortContainer(env.document);
  const sort2 = createSortContainer(env.document);
  env.document.body.appendChild(sort1.container);
  env.document.body.appendChild(sort2.container);

  const containers = env.hooks.findSortContainers();
  assert.equal(containers.length, 2);
});

test("injectValueOption adds option when dropdown opens", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  env.hooks.injectValueOption(sort.container);

  // Simulate dropdown opening by adding options content
  const options = createDropdownOptions(env.document, ["MOST_POPULAR", "PRICE_LOW_2_HIGH"]);
  sort.contentWrapper.appendChild(options);

  await delay(env.window, 30);

  const injected = sort.contentWrapper.querySelector('input[name="VALUE_UNIT_PRICE"]');
  assert.ok(injected, "Value option should be injected");

  const label = injected.closest("label");
  const text = label.querySelector('[class*="paragraphHeading___"]');
  assert.equal(text.textContent, "Value (Unit Price)");
});

test("injectValueOption does not duplicate on re-open", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  env.hooks.injectValueOption(sort.container);

  // Open dropdown
  const options = createDropdownOptions(env.document, ["MOST_POPULAR"]);
  sort.contentWrapper.appendChild(options);

  await delay(env.window, 30);

  const firstCount = sort.contentWrapper.querySelectorAll('input[name="VALUE_UNIT_PRICE"]').length;
  assert.equal(firstCount, 1);

  // Simulate re-render: add another option to trigger MutationObserver
  const extra = env.document.createElement("div");
  options.appendChild(extra);

  await delay(env.window, 30);

  const secondCount = sort.contentWrapper.querySelectorAll('input[name="VALUE_UNIT_PRICE"]').length;
  assert.equal(secondCount, 1, "should not duplicate the option");
});

test("sortByUnitPrice sorts products ascending", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [
    { name: "Expensive", unitPrice: "\u00a35.19/litre" },
    { name: "Cheap", unitPrice: "\u00a32.79/litre" },
    { name: "Mid", unitPrice: "\u00a33.50/litre" },
  ]);
  env.document.body.appendChild(grid);

  env.hooks.sortByUnitPrice();

  const cards = grid.querySelectorAll('[class*="productPod___"]');
  const names = Array.from(cards).map((c) => c.querySelector("span:last-child").textContent);
  assert.deepEqual(names, ["Cheap", "Mid", "Expensive"]);
});

test("sortByUnitPrice puts items without unit price at bottom", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [
    { name: "No price" },
    { name: "Cheap", unitPrice: "\u00a32.00/kg" },
    { name: "Per kg only", unitPrice: "per kg" },
  ]);
  env.document.body.appendChild(grid);

  env.hooks.sortByUnitPrice();

  const cards = grid.querySelectorAll('[class*="productPod___"]');
  const names = Array.from(cards).map((c) => c.querySelector("span:last-child").textContent);
  assert.equal(names[0], "Cheap");
});

test("sortByUnitPrice groups different units correctly", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [
    { name: "Litre item", unitPrice: "\u00a35.19/litre" },
    { name: "Kg item", unitPrice: "\u00a33.32/kg" },
    { name: "Each item", unitPrice: "\u00a31.20 each" },
  ]);
  env.document.body.appendChild(grid);

  env.hooks.sortByUnitPrice();

  const cards = grid.querySelectorAll('[class*="productPod___"]');
  const names = Array.from(cards).map((c) => c.querySelector("span:last-child").textContent);
  // kg group first, then litre, then each
  assert.equal(names[0], "Kg item");
  assert.equal(names[1], "Litre item");
  assert.equal(names[2], "Each item");
});

test("observeProductGrid re-sorts when new products are added", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [
    { name: "B", unitPrice: "\u00a35.00/kg" },
    { name: "A", unitPrice: "\u00a32.00/kg" },
  ]);
  env.document.body.appendChild(grid);

  env.hooks.valueSortActive = true;
  env.hooks.sortByUnitPrice();
  env.hooks.observeProductGrid();

  // Add a new product (simulating "Load more")
  const newArticle = env.document.createElement("article");
  newArticle.className = "productPod___abc";
  const priceSpan = env.document.createElement("span");
  priceSpan.className = "pricePerUnit___abc";
  const srOnly = env.document.createElement("p");
  srOnly.className = "sr-only";
  srOnly.textContent = "Price per unit";
  priceSpan.appendChild(srOnly);
  priceSpan.appendChild(env.document.createTextNode("\u00a31.00/kg"));
  newArticle.appendChild(priceSpan);
  const nameSpan = env.document.createElement("span");
  nameSpan.textContent = "New cheap";
  newArticle.appendChild(nameSpan);
  grid.appendChild(newArticle);

  await delay(env.window, 500);

  const cards = grid.querySelectorAll('[class*="productPod___"]');
  const names = Array.from(cards).map((c) => c.querySelector("span:last-child").textContent);
  assert.equal(names[0], "New cheap", "newly added cheap product should be first");
});

test("observeProductGrid does not loop on self-mutations from sorting", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [
    { name: "B", unitPrice: "\u00a35.00/kg" },
    { name: "A", unitPrice: "\u00a32.00/kg" },
  ]);
  env.document.body.appendChild(grid);

  env.hooks.valueSortActive = true;
  env.hooks.observeProductGrid();
  env.hooks.sortByUnitPrice();

  await delay(env.window, 900);

  const sortLogs = env.logs.filter((line) => line.includes("Sorted"));
  assert.equal(sortLogs.length, 1, `expected one sort, got ${sortLogs.length}`);
});

test("clicking value option updates button text", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [{ name: "A", unitPrice: "\u00a32.00/kg" }]);
  env.document.body.appendChild(grid);

  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  env.hooks.injectValueOption(sort.container);

  // Open dropdown
  const options = createDropdownOptions(env.document, ["MOST_POPULAR"]);
  sort.contentWrapper.appendChild(options);

  await delay(env.window, 30);

  // Click the value option
  const valueLabel = sort.contentWrapper
    .querySelector('input[name="VALUE_UNIT_PRICE"]')
    .closest("label");
  valueLabel.click();

  await delay(env.window, 30);

  assert.ok(
    sort.span.textContent.includes("Value (Unit Price)"),
    `button text should include 'Value (Unit Price)', got: ${sort.span.textContent}`,
  );
});

test("init gates injection on product grid appearing", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  env.hooks.init();
  await delay(env.window, 10);

  // Add sort container but no product grid
  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  await delay(env.window, 30);

  // Should NOT have activated value sort yet
  assert.equal(env.hooks.valueSortActive, false);

  // Now add product grid
  const grid = createProductGrid(env.document, [{ name: "A", unitPrice: "\u00a32.00/kg" }]);
  env.document.body.appendChild(grid);

  await delay(env.window, 50);

  // Now value sort should be active
  assert.equal(
    env.hooks.valueSortActive,
    true,
    "valueSortActive should be true after grid appears",
  );
});

test("init does not auto-activate when auto-sort setting is off", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  setAutoSortSetting(env.window, false);

  env.hooks.init();
  await delay(env.window, 10);

  // Add sort container but no product grid
  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  await delay(env.window, 30);
  assert.equal(env.hooks.valueSortActive, false);

  // Now add product grid
  const grid = createProductGrid(env.document, [{ name: "A", unitPrice: "\u00a32.00/kg" }]);
  env.document.body.appendChild(grid);

  await delay(env.window, 50);

  assert.equal(
    env.hooks.valueSortActive,
    false,
    "valueSortActive should remain false when auto-sort setting is off",
  );
});

test("selecting a native sort option clears valueSortActive", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const grid = createProductGrid(env.document, [{ name: "A", unitPrice: "\u00a32.00/kg" }]);
  env.document.body.appendChild(grid);

  const sort = createSortContainer(env.document);
  env.document.body.appendChild(sort.container);

  env.hooks.injectValueOption(sort.container);

  // Open dropdown and inject
  const options = createDropdownOptions(env.document, ["MOST_POPULAR", "PRICE_LOW_2_HIGH"]);
  sort.contentWrapper.appendChild(options);
  await delay(env.window, 30);

  // Click value option first
  const valueLabel = sort.contentWrapper
    .querySelector('input[name="VALUE_UNIT_PRICE"]')
    .closest("label");
  valueLabel.click();
  await delay(env.window, 30);
  assert.equal(env.hooks.valueSortActive, true);

  // Click a native sort option
  const nativeLabel = sort.contentWrapper
    .querySelector('input[name="MOST_POPULAR"]')
    .closest("label");
  nativeLabel.click();
  await delay(env.window, 30);

  assert.equal(env.hooks.valueSortActive, false, "valueSortActive should be cleared");
});

test("extractUnitPrice handles pence format correctly", (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const article = env.document.createElement("article");
  article.className = "productPod___abc";
  const priceSpan = env.document.createElement("span");
  priceSpan.className = "pricePerUnit___abc";
  const srOnly = env.document.createElement("p");
  srOnly.className = "sr-only";
  srOnly.textContent = "Price per unit";
  priceSpan.appendChild(srOnly);
  priceSpan.appendChild(env.document.createTextNode("46.7p each"));
  article.appendChild(priceSpan);

  const result = env.hooks.extractUnitPrice(article);
  assert.ok(result);
  assert.equal(result.unit, "each");
  // 46.7p = 0.467
  assert.ok(Math.abs(result.price - 0.467) < 0.001, `expected ~0.467, got ${result.price}`);
});
