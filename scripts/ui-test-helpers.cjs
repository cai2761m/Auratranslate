const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const Core = require("../src/shared.js");
const root = path.resolve(__dirname, "..");
const bundles = new Map();

function source(name) {
  if (!bundles.has(name)) {
    const app = name === "options" ? "OptionsApp" : "PopupApp";
    bundles.set(
      name,
      esbuild.buildSync({
        absWorkingDir: root,
        stdin: {
          contents: `import { createRoot } from 'react-dom/client'; import { flushSync } from 'react-dom'; import { ${app} } from './ui/${name}/App.jsx'; const root = createRoot(document.getElementById('root')); globalThis.__ui = { flushSync, unmount: () => root.unmount() }; flushSync(() => root.render(<${app} />));`,
          resolveDir: root,
          loader: "jsx",
        },
        bundle: true,
        write: false,
        format: "iife",
        jsx: "automatic",
        define: { "process.env.NODE_ENV": '"development"' },
      }).outputFiles[0].text,
    );
  }
  return bundles.get(name);
}

async function settle(window) {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.__ui.flushSync(() => {});
  }
}

async function mount(t, name, { storage = {}, hash = "", chrome, fetch } = {}) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, name, `${name}.html`), "utf8"),
    {
      url: `https://extension.test/${name}/${name}.html${hash}`,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    },
  );
  const window = dom.window;
  window.YTBTCore = Core;
  const scrolls = [];
  window.scrollTo = (options) => scrolls.push(options);
  window.chrome = chrome || {
    runtime: {},
    storage: {
      local: {
        get(defaults, done) {
          done(
            defaults === null ? { ...storage } : { ...defaults, ...storage },
          );
        },
        set(values, done) {
          Object.assign(storage, JSON.parse(JSON.stringify(values)));
          done();
        },
        remove(keys, done) {
          for (const key of [].concat(keys)) delete storage[key];
          done();
        },
      },
    },
  };
  if (fetch) window.fetch = fetch;
  window.eval(source(name));
  t.after(() => {
    window.__ui.flushSync(() => window.__ui.unmount());
    window.close();
  });
  await settle(window);
  const document = window.document;
  return {
    window,
    document,
    storage,
    scrolls,
    field: (id) => document.getElementById(id),
    $: (selector) => document.querySelector(selector),
    async save() {
      // Exercise the actual autosave lifecycle; settings no longer has a submit button.
      dispatch(window, new window.Event("pagehide"));
      await settle(window);
    },
  };
}

function dispatch(element, event) {
  const window =
    element.window === element ? element : element.ownerDocument.defaultView;
  // React delegates events to the root, as real browser input events do.
  if (!event.bubbles) Object.defineProperty(event, "bubbles", { value: true });
  window.__ui.flushSync(() => element.dispatchEvent(event));
}
function click(element) {
  element.ownerDocument.defaultView.__ui.flushSync(() => element.click());
}
function setValue(element, value) {
  const window = element.ownerDocument.defaultView;
  if (element.type === "checkbox") {
    if (element.checked !== value) click(element);
    return;
  }
  const prototype =
    element.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  dispatch(
    element,
    new window.Event(element.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
}
module.exports = { mount, settle, dispatch, click, setValue };
