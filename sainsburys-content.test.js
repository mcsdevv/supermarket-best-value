const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "dist", "sainsburys-content.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function delay(window, ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setupDom(bodyHtml = "") {
  const dom = new JSDOM(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
    {
      url: "https://www.sainsburys.co.uk/gol-ui/groceries/fruit-and-vegetables/fresh-fruit/apples/c:1034099",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }
  );

  const { window } = dom;
  const warnings = [];

  window.console.warn = (...args) => warnings.push(args.join(" "));
  window.console.log = () => {};
  window.console.error = () => {};

  window.__SAINSBURYS_VALUE_SORT_TEST_MODE__ = true;
  window.eval(SCRIPT_SOURCE);

  const hooks = window.__SAINSBURYS_VALUE_SORT_TEST_HOOKS__;
  assert.ok(hooks, "test hooks not initialized");

  return { dom, window, document: window.document, hooks, warnings };
}

// --- Helpers for building Sainsbury's DOM ---

function makeSortDropdown() {
  return (
    '<div class="ds-c-select filter-toolbar--sorting-select">' +
      '<label class="ds-c-select--label ds-c-select--sr-only">Sort by</label>' +
      '<select class="ds-c-select__select">' +
        '<option value="-relevance">Relevance</option>' +
        '<option value="price">Price - Low to High</option>' +
        '<option value="-price">Price - High to Low</option>' +
      '</select>' +
    '</div>'
  );
}

function makeProduct(unitPriceText) {
  return (
    '<li class="pt-grid-item ln-o-grid__item">' +
      '<div data-testid="pt-retail-price-and-unit">' +
        '<span data-testid="pt-retail-price">£1.00</span>' +
        `<span data-testid="pt-unit-price" class="pt__cost__unit-price-per-measure">${unitPriceText}</span>` +
      '</div>' +
    '</li>'
  );
}

function makeProductList(prices) {
  return (
    '<ul class="ln-o-grid ln-o-grid--matrix ln-o-grid--equal-height">' +
      prices.map(makeProduct).join("") +
    '</ul>'
  );
}

// --- Tests ---

test("findSortDropdown finds Sainsbury's Fable select component", (t) => {
  const env = setupDom(makeSortDropdown());
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  assert.ok(select, "should find the sort dropdown");
  assert.ok(select.classList.contains("ds-c-select__select"));
});

test("findSortDropdown falls back to label-based search", (t) => {
  // Remove the specific class, keep the label
  const html =
    '<div class="some-wrapper">' +
      '<label>Sort by</label>' +
      '<select>' +
        '<option value="-relevance">Relevance</option>' +
        '<option value="price">Price - Low to High</option>' +
      '</select>' +
    '</div>';
  const env = setupDom(html);
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  assert.ok(select, "should find dropdown via label strategy");
});

test("findSortDropdown falls back to option-value sniffing", (t) => {
  // No label, no specific class — just a select with Sainsbury's option values
  const html =
    '<div>' +
      '<select>' +
        '<option value="-relevance">Relevance</option>' +
        '<option value="price">Price - Low to High</option>' +
      '</select>' +
    '</div>';
  const env = setupDom(html);
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  assert.ok(select, "should find dropdown via option value sniffing");
});

test("injectValueOption auto-selects Value sort and sorts products", (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£5.00 / kg", "£2.00 / kg", "£3.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);

  assert.equal(select.value, "value-sort");

  const items = env.document.querySelectorAll("ul.ln-o-grid > li");
  const prices = Array.from(items).map(
    (li) => li.querySelector('[data-testid="pt-unit-price"]').textContent
  );
  assert.equal(prices[0], "£2.00 / kg");
  assert.equal(prices[1], "£3.00 / kg");
  assert.equal(prices[2], "£5.00 / kg");
});

test("injectValueOption sorts Sainsbury's pence format correctly", (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["63p / ea", "17p / ea", "30p / ea"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);

  const items = env.document.querySelectorAll("ul.ln-o-grid > li");
  const prices = Array.from(items).map(
    (li) => li.querySelector('[data-testid="pt-unit-price"]').textContent
  );
  assert.equal(prices[0], "17p / ea");
  assert.equal(prices[1], "30p / ea");
  assert.equal(prices[2], "63p / ea");
});

test("injectValueOption handles mixed unit types", (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["30p / ea", "£2.50 / kg", "£1.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);

  const items = env.document.querySelectorAll("ul.ln-o-grid > li");
  const prices = Array.from(items).map(
    (li) => li.querySelector('[data-testid="pt-unit-price"]').textContent
  );
  // kg group comes before each group
  assert.equal(prices[0], "£1.00 / kg");
  assert.equal(prices[1], "£2.50 / kg");
  assert.equal(prices[2], "30p / ea");
});

test("injectValueOption skips when option already exists", (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£5.00 / kg", "£2.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);
  assert.equal(select.value, "value-sort");

  // Manually switch to another value
  select.value = "-relevance";

  // Call again — should early-return, NOT re-select
  env.hooks.injectValueOption(select);
  assert.equal(select.value, "-relevance");
});

test("selecting a different sort option clears valueSortActive", (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£1.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);

  // Select value-sort first
  select.value = env.hooks.VALUE_OPTION_ID;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  assert.equal(env.hooks.valueSortActive, true);

  // Switch to a different sort
  select.value = "-relevance";
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  assert.equal(env.hooks.valueSortActive, false);
});

test("observeSelectRerender re-injects when sort select node is replaced", async (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£1.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const wrapper = env.document.querySelector(".filter-toolbar--sorting-select");
  const initialSelect = wrapper.querySelector("select");

  env.hooks.injectValueOption(initialSelect);
  env.hooks.observeSelectRerender(initialSelect);

  // Replace the select (simulating React re-render)
  const replacement = env.document.createElement("select");
  replacement.className = "ds-c-select__select";
  replacement.innerHTML =
    '<option value="-relevance">Relevance</option>' +
    '<option value="price">Price - Low to High</option>';
  initialSelect.replaceWith(replacement);

  await delay(env.window, 30);

  assert.ok(
    replacement.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "Value option should be re-injected into replacement select"
  );
});

test("selecting Value (Unit Price) persists selection after React re-render", async (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£1.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();

  env.hooks.injectValueOption(select);
  env.hooks.observeSelectRerender(select);

  // Select value-sort
  select.value = env.hooks.VALUE_OPTION_ID;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));

  assert.equal(select.value, env.hooks.VALUE_OPTION_ID);
  assert.equal(env.hooks.valueSortActive, true);

  // Simulate React re-render: remove our option, reset value
  const opt = select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`);
  if (opt) opt.remove();
  select.value = "-relevance";

  await delay(env.window, 30);

  assert.ok(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "Value option should be re-injected"
  );
  assert.equal(
    select.value,
    env.hooks.VALUE_OPTION_ID,
    "select value should be restored"
  );
});

test("observeSelectRerender re-selects after React resets value", async (t) => {
  const env = setupDom(
    makeSortDropdown() +
    makeProductList(["£5.00 / kg", "£2.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);
  env.hooks.observeSelectRerender(select);

  assert.equal(select.value, "value-sort");

  // Simulate React resetting value without removing option
  select.value = "-relevance";
  env.document.body.appendChild(env.document.createElement("div"));

  await delay(env.window, 30);

  assert.equal(select.value, "value-sort");
});

test("attemptInjection falls back when sort select has no specific attributes", async (t) => {
  const env = setupDom(makeProductList(["£1.00 / kg"]));
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  env.hooks.attemptInjection();

  // Add an unrelated select first
  const unrelated = env.document.createElement("select");
  unrelated.innerHTML = '<option value="size">Size</option>';
  env.document.body.appendChild(unrelated);

  await delay(env.window, 10);

  // Now add a select with Sainsbury's sort options but no specific class
  const container = env.document.createElement("div");
  container.innerHTML =
    '<label>Sort by</label>' +
    '<select><option value="-relevance">Relevance</option><option value="price">Price - Low to High</option></select>';
  env.document.body.appendChild(container);

  await delay(env.window, 30);

  const sortSelect = container.querySelector("select");
  assert.ok(
    sortSelect.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "expected Value option to be injected"
  );
});

test("attemptInjection auto-selects after deferred dropdown discovery", async (t) => {
  const env = setupDom(
    makeProductList(["£4.00 / kg", "£1.00 / kg"])
  );
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  env.hooks.attemptInjection();

  await delay(env.window, 10);

  // Add Sainsbury's sort dropdown dynamically
  const wrapper = env.document.createElement("div");
  wrapper.className = "ds-c-select filter-toolbar--sorting-select";
  const label = env.document.createElement("label");
  label.className = "ds-c-select--label ds-c-select--sr-only";
  label.textContent = "Sort by";
  wrapper.appendChild(label);
  const sel = env.document.createElement("select");
  sel.className = "ds-c-select__select";
  sel.innerHTML =
    '<option value="-relevance">Relevance</option>' +
    '<option value="price">Price - Low to High</option>';
  wrapper.appendChild(sel);
  env.document.body.appendChild(wrapper);

  await delay(env.window, 30);

  assert.equal(sel.value, "value-sort");

  const items = env.document.querySelectorAll("ul.ln-o-grid > li");
  const prices = Array.from(items).map(
    (li) => li.querySelector('[data-testid="pt-unit-price"]').textContent
  );
  assert.equal(prices[0], "£1.00 / kg");
  assert.equal(prices[1], "£4.00 / kg");
});

test("init gates injection on product list appearing", async (t) => {
  const env = setupDom();
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  // Call init on an empty page
  env.hooks.init();

  await delay(env.window, 10);

  // Add sort dropdown but no product list
  const wrapper = env.document.createElement("div");
  wrapper.className = "ds-c-select filter-toolbar--sorting-select";
  const label = env.document.createElement("label");
  label.className = "ds-c-select--label ds-c-select--sr-only";
  label.textContent = "Sort by";
  wrapper.appendChild(label);
  const select = env.document.createElement("select");
  select.className = "ds-c-select__select";
  select.innerHTML = '<option value="-relevance">Relevance</option>';
  wrapper.appendChild(select);
  env.document.body.appendChild(wrapper);

  await delay(env.window, 30);

  assert.equal(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    null,
    "should not inject before product list appears"
  );

  // Now add the product list
  const productList = env.document.createElement("ul");
  productList.className = "ln-o-grid ln-o-grid--matrix ln-o-grid--equal-height";
  const li = env.document.createElement("li");
  li.className = "pt-grid-item";
  li.innerHTML =
    '<div data-testid="pt-retail-price-and-unit">' +
      '<span data-testid="pt-unit-price">£1.00 / kg</span>' +
    '</div>';
  productList.appendChild(li);
  env.document.body.appendChild(productList);

  await delay(env.window, 30);

  assert.ok(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "should inject after product list appears"
  );
});

test("products without unit price are sorted to the bottom", (t) => {
  const productListHtml =
    '<ul class="ln-o-grid ln-o-grid--matrix ln-o-grid--equal-height">' +
      '<li class="pt-grid-item"><div>No price info</div></li>' +
      '<li class="pt-grid-item"><div data-testid="pt-retail-price-and-unit"><span data-testid="pt-unit-price">£3.00 / kg</span></div></li>' +
      '<li class="pt-grid-item"><div data-testid="pt-retail-price-and-unit"><span data-testid="pt-unit-price">£1.00 / kg</span></div></li>' +
    '</ul>';
  const env = setupDom(makeSortDropdown() + productListHtml);
  t.after(() => { env.hooks.resetObservers(); env.dom.window.close(); });

  const select = env.hooks.findSortDropdown();
  env.hooks.injectValueOption(select);

  const items = env.document.querySelectorAll("ul.ln-o-grid > li");
  const texts = Array.from(items).map((li) => {
    const unitEl = li.querySelector('[data-testid="pt-unit-price"]');
    return unitEl ? unitEl.textContent : "no-price";
  });
  assert.equal(texts[0], "£1.00 / kg");
  assert.equal(texts[1], "£3.00 / kg");
  assert.equal(texts[2], "no-price");
});
