const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SCRIPT_PATH = path.join(__dirname, "content.js");
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

function delay(window, ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setupDom(bodyHtml = "") {
  const dom = new JSDOM(
    `<!doctype html><html><body>${bodyHtml}</body></html>`,
    {
      url: "https://www.tesco.com/groceries/en-GB/shop",
      runScripts: "outside-only",
      pretendToBeVisual: true,
    }
  );

  const { window } = dom;
  const warnings = [];

  window.console.warn = (...args) => warnings.push(args.join(" "));
  window.console.log = () => {};
  window.console.error = () => {};

  window.__TESCO_VALUE_SORT_TEST_MODE__ = true;
  window.eval(SCRIPT_SOURCE);

  const hooks = window.__TESCO_VALUE_SORT_TEST_HOOKS__;
  assert.ok(hooks, "test hooks not initialized");

  return { dom, window, document: window.document, hooks, warnings };
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
    30
  );

  await delay(env.window, 5);
  const select = env.document.createElement("select");
  env.document.body.appendChild(select);

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
      if (!sortSelect) return false;
      completeCalls += 1;
      return true;
    },
    120,
    { warnOnTimeout: false }
  );

  const unrelated = env.document.createElement("select");
  unrelated.innerHTML = '<option value="size">Size</option>';
  env.document.body.appendChild(unrelated);

  await delay(env.window, 10);

  const sort = env.document.createElement("select");
  sort.setAttribute("data-role", "sort");
  sort.innerHTML = '<option value="relevance">Relevance</option>';
  env.document.body.appendChild(sort);

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
  env.document.body.appendChild(unrelated);

  await delay(env.window, 10);

  const container = env.document.createElement("div");
  container.innerHTML =
    '<label>Sort by</label>' +
    '<select><option value="relevance">Relevance</option><option value="price-asc">Price: Low to High</option></select>';
  env.document.body.appendChild(container);

  await delay(env.window, 30);

  const sortSelect = container.querySelector("select");
  assert.ok(
    sortSelect.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "expected Value option to be injected into fallback sort select"
  );
});

test("observeSelectRerender re-injects when the sort select node is replaced", async (t) => {
  const env = setupDom(
    '<div id="sort-wrap"><label>Sort by</label><select><option value="relevance">Relevance</option></select></div>'
  );
  t.after(() => {
    env.hooks.resetObservers();
    env.dom.window.close();
  });

  const wrapper = env.document.getElementById("sort-wrap");
  const initialSelect = wrapper.querySelector("select");

  env.hooks.injectValueOption(initialSelect);
  env.hooks.observeSelectRerender(initialSelect);

  const replacement = env.document.createElement("select");
  replacement.innerHTML = '<option value="relevance">Relevance</option>';
  initialSelect.replaceWith(replacement);

  await delay(env.window, 30);

  assert.ok(
    replacement.querySelector(`option[value="${env.hooks.VALUE_OPTION_ID}"]`),
    "expected Value option to be re-injected into replacement select"
  );
});
