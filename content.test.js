const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "dist", "content.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function delay(window, ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setupDom(bodyHtml = "") {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://www.tesco.com/groceries/en-GB/shop",
  });

  const { window } = dom;
  const warnings = [];

  window.console.warn = (...args) => warnings.push(args.join(" "));
  window.console.log = () => {};
  window.console.error = () => {};

  window.__TESCO_VALUE_SORT_TEST_MODE__ = true;
  window.eval(SCRIPT_SOURCE);

  const hooks = window.__TESCO_VALUE_SORT_TEST_HOOKS__;
  assert.ok(hooks, "test hooks not initialized");

  return { document: window.document, dom, hooks, warnings, window };
}

test("waitForElement clears timeout after a successful match", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  let called = 0;
  env.hooks.waitForElement(
    "select",
    () => {
      called += 1;
      return true;
    },
    30,
  );

  await delay(env.window, 5);
  const select = env.document.createElement("select");
  env.document.body.append(select);

  await delay(env.window, 60);

  assert.equal(called, 1);
  assert.equal(env.warnings.length, 0);
});

test("waitForElement keeps observing when callback returns false", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  let callbackCalls = 0;
  let completeCalls = 0;

  env.hooks.waitForElement(
    "select",
    () => {
      callbackCalls += 1;
      const sortSelect = env.document.querySelector('select[data-role="sort"]');
      if (!sortSelect) {
        return false;
      }
      completeCalls += 1;
      return true;
    },
    120,
    { warnOnTimeout: false },
  );

  const unrelated = env.document.createElement("select");
  unrelated.innerHTML = '<option value="size">Size</option>';
  env.document.body.append(unrelated);

  await delay(env.window, 10);

  const sort = env.document.createElement("select");
  sort.dataset.role = "sort";
  sort.innerHTML = '<option value="relevance">Relevance</option>';
  env.document.body.append(sort);

  await delay(env.window, 40);

  assert.ok(callbackCalls >= 2);
  assert.equal(completeCalls, 1);
});

test("attemptInjection falls back when sort select has no sort attributes", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  env.hooks.attemptInjection();

  const unrelated = env.document.createElement("select");
  unrelated.innerHTML = '<option value="size">Size</option>';
  env.document.body.append(unrelated);

  await delay(env.window, 10);

  const container = env.document.createElement("div");
  container.innerHTML =
    "<label>Sort by</label>" +
    '<select><option value="relevance">Relevance</option><option value="price-asc">Price: Low to High</option></select>';
  env.document.body.append(container);

  await delay(env.window, 30);

  const sortSelect = container.querySelector("select");
  assert.ok(
    sortSelect.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "expected Value option to be injected into fallback sort select",
  );
});

test("observeSelectRerender re-injects when the sort select node is replaced", async (t) => {
  const env = setupDom(
    '<div id="sort-wrap"><label>Sort by</label><select><option value="relevance">Relevance</option></select></div>',
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const wrapper = env.document.querySelector("#sort-wrap");
  const initialSelect = wrapper.querySelector("select");

  env.hooks.injectValueOption(initialSelect);
  env.hooks.observeSelectRerender(initialSelect);

  const replacement = env.document.createElement("select");
  replacement.innerHTML = '<option value="relevance">Relevance</option>';
  initialSelect.replaceWith(replacement);

  await delay(env.window, 30);

  assert.ok(
    replacement.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "expected Value option to be re-injected into replacement select",
  );
});

test("selecting Value (Unit Price) persists selection after React re-render", async (t) => {
  const env = setupDom(
    '<div id="sort-wrap"><label>Sort by</label>' +
      '<select><option value="relevance">Relevance</option></select></div>' +
      '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">\u00A31.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const wrapper = env.document.querySelector("#sort-wrap");
  const select = wrapper.querySelector("select");

  env.hooks.injectValueOption(select);
  env.hooks.observeSelectRerender(select);

  // Simulate selecting "Value (Unit Price)"
  select.value = env.hooks.VALUE_OPTION_ID;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));

  assert.equal(select.value, env.hooks.VALUE_OPTION_ID, "select should show value-sort");
  assert.equal(env.hooks.valueSortActive, true, "valueSortActive flag should be set");

  // Simulate React re-render: remove our option, reset value
  const opt = select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`);
  if (opt) {
    opt.remove();
  }
  select.value = "relevance";

  await delay(env.window, 30);

  // Observer should have re-injected the option AND restored the selection
  assert.ok(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "Value option should be re-injected after re-render",
  );
  assert.equal(
    select.value,
    env.hooks.VALUE_OPTION_ID,
    "select value should be restored to value-sort after re-render",
  );
});

test("selecting a different sort option clears valueSortActive", async (t) => {
  const env = setupDom(
    '<div id="sort-wrap"><label>Sort by</label>' +
      '<select><option value="relevance">Relevance</option></select></div>' +
      '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">\u00A31.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const select = env.document.querySelector("select");
  env.hooks.injectValueOption(select);

  // Select value-sort first
  select.value = env.hooks.VALUE_OPTION_ID;
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  assert.equal(env.hooks.valueSortActive, true);

  // Switch to a different sort
  select.value = "relevance";
  select.dispatchEvent(new env.window.Event("change", { bubbles: true }));
  assert.equal(env.hooks.valueSortActive, false, "valueSortActive should be cleared");
});

test("injectValueOption auto-selects Value sort and sorts products", async (t) => {
  const env = setupDom(
    '<select id="sort"><option value="relevance">Relevance</option></select>' +
      '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">£5.00/kg</span></li>' +
      '<li><span class="price__subtext">£2.00/kg</span></li>' +
      '<li><span class="price__subtext">£3.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const select = env.document.querySelector("#sort");
  env.hooks.injectValueOption(select);

  assert.equal(select.value, "value-sort");

  const items = env.document.querySelectorAll('[data-auto="product-list"] > li');
  const prices = [...items].map((li) => li.textContent);
  assert.equal(prices[0], "£2.00/kg");
  assert.equal(prices[1], "£3.00/kg");
  assert.equal(prices[2], "£5.00/kg");
});

test("injectValueOption skips when option already exists", async (t) => {
  const env = setupDom(
    '<select id="sort"><option value="relevance">Relevance</option></select>' +
      '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">£5.00/kg</span></li>' +
      '<li><span class="price__subtext">£2.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const select = env.document.querySelector("#sort");
  env.hooks.injectValueOption(select);
  assert.equal(select.value, "value-sort");

  // Manually switch to another value
  select.value = "relevance";

  // Call again — should early-return, NOT re-select
  env.hooks.injectValueOption(select);
  assert.equal(select.value, "relevance");
});

test("observeSelectRerender re-selects after React resets value", async (t) => {
  const env = setupDom(
    '<div id="sort-wrap"><label>Sort by</label>' +
      '<select><option value="relevance">Relevance</option></select></div>' +
      '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">£5.00/kg</span></li>' +
      '<li><span class="price__subtext">£2.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const select = env.document.querySelector("select");
  env.hooks.injectValueOption(select);
  env.hooks.observeSelectRerender(select);

  assert.equal(select.value, "value-sort");

  // Simulate React resetting value without removing option
  select.value = "relevance";
  env.document.body.append(env.document.createElement("div"));

  await delay(env.window, 30);

  assert.equal(select.value, "value-sort");
});

test("attemptInjection auto-selects after deferred dropdown discovery", async (t) => {
  const env = setupDom(
    '<ul data-auto="product-list">' +
      '<li><span class="price__subtext">£4.00/kg</span></li>' +
      '<li><span class="price__subtext">£1.00/kg</span></li>' +
      "</ul>",
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  env.hooks.attemptInjection();

  await delay(env.window, 10);
  const container = env.document.createElement("div");
  const label = env.document.createElement("label");
  label.textContent = "Sort by";
  container.append(label);
  const sel = env.document.createElement("select");
  sel.id = "sort";
  const opt = env.document.createElement("option");
  opt.value = "relevance";
  opt.textContent = "Relevance";
  sel.append(opt);
  container.append(sel);
  env.document.body.append(container);

  await delay(env.window, 30);

  const select = container.querySelector("select");
  assert.equal(select.value, "value-sort");

  const items = env.document.querySelectorAll('[data-auto="product-list"] > li');
  const prices = [...items].map((li) => li.textContent);
  assert.equal(prices[0], "£1.00/kg");
  assert.equal(prices[1], "£4.00/kg");
});

test("init gates injection on product list appearing", async (t) => {
  const env = setupDom();
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  // Call init on an empty page — no product list, no sort dropdown
  env.hooks.init();

  await delay(env.window, 10);

  // Sort dropdown added but no product list yet — should NOT inject
  const sortWrap = env.document.createElement("div");
  const label = env.document.createElement("label");
  label.textContent = "Sort by";
  const select = env.document.createElement("select");
  const opt = env.document.createElement("option");
  opt.value = "relevance";
  opt.textContent = "Relevance";
  select.append(opt);
  sortWrap.append(label);
  sortWrap.append(select);
  env.document.body.append(sortWrap);

  await delay(env.window, 30);

  assert.equal(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    null,
    "should not inject before product list appears",
  );

  // Now add the product list — injection should trigger
  const productList = env.document.createElement("ul");
  productList.dataset.auto = "product-list";
  const li = env.document.createElement("li");
  li.textContent = "Product 1";
  productList.append(li);
  env.document.body.append(productList);

  await delay(env.window, 30);

  assert.ok(
    select.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "should inject after product list appears",
  );
});
