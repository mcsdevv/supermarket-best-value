const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "..", "dist", "morrisons-content.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

// --- HTML Helpers ---

function morrisonsProduct(price, unit, id) {
  if (!unit) unit = "kilo";
  if (!id) id = Math.random().toString(36).slice(2, 10);
  return (
    '<div data-test="fop-wrapper:' +
    id +
    '">' +
    '<div class="product-card-container">' +
    '<div data-test="fop-body">' +
    '<span data-test="fop-price-per-unit">(£' +
    price +
    " per " +
    unit +
    ")</span>" +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

function morrisonsProductNoPrice(id) {
  if (!id) id = Math.random().toString(36).slice(2, 10);
  return (
    '<div data-test="fop-wrapper:' +
    id +
    '">' +
    '<div class="product-card-container">' +
    '<div data-test="fop-body">' +
    "<span>No unit price</span>" +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

function morrisonsSkeleton() {
  return '<div data-test="fop-skeleton"></div>';
}

function morrisonsSortCombobox(selectedText) {
  if (!selectedText) selectedText = "Favourites First";
  return (
    '<div data-test="sort-button" role="combobox" tabindex="0">' +
    "<span>" +
    selectedText +
    "</span>" +
    "</div>"
  );
}

function morrisonsListbox() {
  return (
    '<div role="listbox">' +
    '<div role="option" data-value="favorite" data-name="Favourites First">Favourites First</div>' +
    '<div role="option" data-value="pricePerAscending" data-name="Price per: Low to High">Price per: Low to High</div>' +
    '<div role="option" data-value="pricePerDescending" data-name="Price per: High to Low">Price per: High to Low</div>' +
    '<div role="option" data-value="priceAscending" data-name="Total Price: Low to High">Total Price: Low to High</div>' +
    '<div role="option" data-value="priceDescending" data-name="Total Price: High to Low">Total Price: High to Low</div>' +
    '<div role="option" data-value="customerRating" data-name="Customer rating">Customer rating</div>' +
    "</div>"
  );
}

// Note: jsdom's runScripts:"outside-only" + window.eval is the established
// pattern in this project for loading content scripts in tests. See content.test.js.
function setupDom(bodyHtml) {
  if (!bodyHtml) bodyHtml = "";

  const dom = new JSDOM("<!doctype html><html><body>" + bodyHtml + "</body></html>", {
    url: "https://groceries.morrisons.com/categories/meat-fish/179549",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const warnings = [];

  window.console.warn = function () {
    warnings.push(Array.prototype.join.call(arguments, " "));
  };
  window.console.log = function () {};
  window.console.error = function () {};

  window.__MORRISONS_VALUE_SORT_TEST_MODE__ = true;
  window.eval(SCRIPT_SOURCE);

  const hooks = window.__MORRISONS_VALUE_SORT_TEST_HOOKS__;
  assert.ok(hooks, "test hooks not initialized");

  return { dom, window, document: window.document, hooks, warnings };
}

// --- Unit Price Parsing Tests ---

test("parseUnitPrice parses (£20.45 per kilo)", function () {
  const env = setupDom();
  try {
    const result = env.hooks.parseUnitPrice("(£20.45 per kilo)");
    assert.ok(result);
    assert.equal(result.price, 20.45);
    assert.equal(result.unit, "kilo");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("parseUnitPrice parses (£1.50 per litre)", function () {
  const env = setupDom();
  try {
    const result = env.hooks.parseUnitPrice("(£1.50 per litre)");
    assert.ok(result);
    assert.equal(result.price, 1.5);
    assert.equal(result.unit, "litre");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("parseUnitPrice parses (£0.15 per 100ml)", function () {
  const env = setupDom();
  try {
    const result = env.hooks.parseUnitPrice("(£0.15 per 100ml)");
    assert.ok(result);
    assert.equal(result.price, 0.15);
    assert.equal(result.unit, "100ml");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("parseUnitPrice parses (£3.25 per each)", function () {
  const env = setupDom();
  try {
    const result = env.hooks.parseUnitPrice("(£3.25 per each)");
    assert.ok(result);
    assert.equal(result.price, 3.25);
    assert.equal(result.unit, "each");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("parseUnitPrice returns null for malformed input", function () {
  const env = setupDom();
  try {
    assert.equal(env.hooks.parseUnitPrice("No price"), null);
    assert.equal(env.hooks.parseUnitPrice(""), null);
    assert.equal(env.hooks.parseUnitPrice("£5.00"), null);
    assert.equal(env.hooks.parseUnitPrice("just text"), null);
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

// --- Normalization Tests ---

test("normalizePrice converts kilo to kg", function () {
  const env = setupDom();
  try {
    const result = env.hooks.normalizePrice(6.3, "kilo");
    assert.equal(result.price, 6.3);
    assert.equal(result.unit, "kg");
    assert.equal(result.comparable, true);
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("normalizePrice converts 100ml to litre", function () {
  const env = setupDom();
  try {
    const result = env.hooks.normalizePrice(0.15, "100ml");
    assert.equal(result.price, 1.5);
    assert.equal(result.unit, "litre");
    assert.equal(result.comparable, true);
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("normalizePrice returns comparable:false for unknown unit", function () {
  const env = setupDom();
  try {
    const result = env.hooks.normalizePrice(2.0, "slice");
    assert.equal(result.price, 2.0);
    assert.equal(result.unit, "slice");
    assert.equal(result.comparable, false);
    assert.ok(env.warnings.length > 0);
    assert.ok(env.warnings[0].includes("slice"));
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

// --- Sorting Tests ---

test("sortProductsByUnitPrice sorts products ascending by price", function () {
  const env = setupDom(
    '<div data-test="products-page">' +
      "<div>" +
      morrisonsProduct("5.00", "kilo", "a") +
      morrisonsProduct("2.00", "kilo", "b") +
      morrisonsProduct("3.00", "kilo", "c") +
      "</div>" +
      "</div>",
  );
  try {
    env.hooks.sortProductsByUnitPrice();

    const wrappers = env.document.querySelectorAll('[data-test^="fop-wrapper:"]');
    const prices = Array.from(wrappers).map(function (w) {
      return w.querySelector('[data-test="fop-price-per-unit"]').textContent;
    });
    assert.equal(prices[0], "(£2.00 per kilo)");
    assert.equal(prices[1], "(£3.00 per kilo)");
    assert.equal(prices[2], "(£5.00 per kilo)");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("sortProductsByUnitPrice puts no-price products last", function () {
  const env = setupDom(
    '<div data-test="products-page">' +
      "<div>" +
      morrisonsProductNoPrice("x") +
      morrisonsProduct("3.00", "kilo", "a") +
      morrisonsProduct("1.00", "kilo", "b") +
      "</div>" +
      "</div>",
  );
  try {
    env.hooks.sortProductsByUnitPrice();

    const wrappers = env.document.querySelectorAll('[data-test^="fop-wrapper:"]');
    assert.equal(wrappers.length, 3);
    // First two should have prices, last should be the no-price one
    assert.ok(wrappers[0].querySelector('[data-test="fop-price-per-unit"]'));
    assert.ok(wrappers[1].querySelector('[data-test="fop-price-per-unit"]'));
    assert.ok(!wrappers[2].querySelector('[data-test="fop-price-per-unit"]'));
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("sortProductsByUnitPrice preserves skeletons at end", function () {
  const env = setupDom(
    '<div data-test="products-page">' +
      "<div>" +
      morrisonsProduct("5.00", "kilo", "a") +
      morrisonsSkeleton() +
      morrisonsProduct("2.00", "kilo", "b") +
      morrisonsSkeleton() +
      "</div>" +
      "</div>",
  );
  try {
    env.hooks.sortProductsByUnitPrice();

    const container = env.document.querySelector('[data-test^="fop-wrapper:"]').parentElement;
    const children = Array.from(container.children);

    // Last two children should be skeletons
    assert.equal(children[children.length - 1].getAttribute("data-test"), "fop-skeleton");
    assert.equal(children[children.length - 2].getAttribute("data-test"), "fop-skeleton");

    // First two should be products sorted by price
    var price0 = children[0].querySelector('[data-test="fop-price-per-unit"]').textContent;
    var price1 = children[1].querySelector('[data-test="fop-price-per-unit"]').textContent;
    assert.equal(price0, "(£2.00 per kilo)");
    assert.equal(price1, "(£5.00 per kilo)");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("sortProductsByUnitPrice groups by unit type", function () {
  const env = setupDom(
    '<div data-test="products-page">' +
      "<div>" +
      morrisonsProduct("5.00", "each", "a") +
      morrisonsProduct("8.00", "kilo", "b") +
      morrisonsProduct("3.00", "kilo", "c") +
      morrisonsProduct("2.00", "each", "d") +
      "</div>" +
      "</div>",
  );
  try {
    env.hooks.sortProductsByUnitPrice();

    const wrappers = env.document.querySelectorAll('[data-test^="fop-wrapper:"]');
    const prices = Array.from(wrappers).map(function (w) {
      return w.querySelector('[data-test="fop-price-per-unit"]').textContent;
    });
    // kg group first (sorted), then each group (sorted)
    assert.equal(prices[0], "(£3.00 per kilo)");
    assert.equal(prices[1], "(£8.00 per kilo)");
    assert.equal(prices[2], "(£2.00 per each)");
    assert.equal(prices[3], "(£5.00 per each)");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

// --- Combobox Interaction Tests ---

test("selectPricePerOption returns true if already selected", async function (t) {
  const env = setupDom(
    '<div data-test="products-page">' + morrisonsSortCombobox("Price per: Low to High") + "</div>",
  );
  t.after(function () {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const combobox = env.document.querySelector('[data-test="sort-button"]');
  const result = await env.hooks.selectPricePerOption(combobox);
  assert.equal(result, true);
});

test("selectPricePerOption clicks combobox and selects option", async function (t) {
  const env = setupDom(
    '<div data-test="products-page">' + morrisonsSortCombobox("Favourites First") + "</div>",
  );
  t.after(function () {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const combobox = env.document.querySelector('[data-test="sort-button"]');
  let clickedOption = null;

  // Simulate React behavior: when combobox is clicked, append listbox
  combobox.addEventListener("click", function () {
    const listboxHtml = morrisonsListbox();
    const div = env.document.createElement("div");
    div.innerHTML = listboxHtml;
    env.document.body.appendChild(div.firstChild);

    // Track which option gets clicked
    var options = env.document.querySelectorAll('[role="option"]');
    options.forEach(function (opt) {
      opt.addEventListener("click", function () {
        clickedOption = opt.getAttribute("data-value");
        // Simulate React updating the combobox text
        combobox.querySelector("span").textContent = opt.textContent;
      });
    });
  });

  const result = await env.hooks.selectPricePerOption(combobox);
  assert.equal(result, true);
  assert.equal(clickedOption, "pricePerAscending");
});

test("selectPricePerOption falls back to text match when data-value missing", async function (t) {
  const env = setupDom(
    '<div data-test="products-page">' + morrisonsSortCombobox("Favourites First") + "</div>",
  );
  t.after(function () {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const combobox = env.document.querySelector('[data-test="sort-button"]');
  let clickedOption = null;

  // Append listbox without data-value attributes
  combobox.addEventListener("click", function () {
    const listbox = env.document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.innerHTML =
      '<div role="option">Favourites First</div>' +
      '<div role="option">Price per: Low to High</div>' +
      '<div role="option">Price per: High to Low</div>';
    env.document.body.appendChild(listbox);

    var options = listbox.querySelectorAll('[role="option"]');
    options.forEach(function (opt) {
      opt.addEventListener("click", function () {
        clickedOption = opt.textContent;
      });
    });
  });

  const result = await env.hooks.selectPricePerOption(combobox);
  assert.equal(result, true);
  assert.equal(clickedOption, "Price per: Low to High");
});

test("selectPricePerOption returns false when listbox never appears", async function (t) {
  const env = setupDom(
    '<div data-test="products-page">' + morrisonsSortCombobox("Favourites First") + "</div>",
  );
  t.after(function () {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const combobox = env.document.querySelector('[data-test="sort-button"]');
  // Do NOT append listbox on click — simulating a broken dropdown

  const result = await env.hooks.selectPricePerOption(combobox);
  assert.equal(result, false);
  assert.ok(
    env.warnings.some(function (w) {
      return w.includes("Listbox did not appear");
    }),
  );
});

// --- findSortCombobox Tests ---

test("findSortCombobox finds by data-test attribute", function () {
  const env = setupDom(morrisonsSortCombobox());
  try {
    const combobox = env.hooks.findSortCombobox();
    assert.ok(combobox);
    assert.equal(combobox.getAttribute("data-test"), "sort-button");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("findSortCombobox falls back to role=combobox near Sort by text", function () {
  const env = setupDom(
    "<div>" +
      "<h2>Sort by</h2>" +
      '<div role="combobox" tabindex="0"><span>Favourites First</span></div>' +
      "</div>",
  );
  try {
    const combobox = env.hooks.findSortCombobox();
    assert.ok(combobox);
    assert.equal(combobox.getAttribute("role"), "combobox");
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});

test("findSortCombobox returns null when no combobox exists", function () {
  const env = setupDom("<div>No sort here</div>");
  try {
    const combobox = env.hooks.findSortCombobox();
    assert.equal(combobox, null);
  } finally {
    env.hooks.resetObservers();
    env.dom.window.close();
  }
});
