const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const Core = require("../src/shared.js");
const { mount, click } = require("../scripts/ui-test-helpers.cjs");

test("appearance accepts the three preferences and falls back to following the system", () => {
  assert.deepEqual(Core.UI_THEMES, ["system", "light", "dark"]);
  assert.equal(Core.DEFAULT_SETTINGS.uiTheme, "system");
  for (const theme of Core.UI_THEMES) assert.equal(Core.normalizeUiTheme(theme), theme);
  for (const invalid of [undefined, null, "", "Dark", "auto", 1, true])
    assert.equal(Core.normalizeUiTheme(invalid), "system");
});

test("settings page saves the appearance choice and restores it on reopen", async (t) => {
  const storage = { uiTheme: "bogus" };
  const page = await mount(t, "options", { storage, hash: "#general-settings" });
  const painted = [];
  page.window.AuraTheme = { apply: (theme) => painted.push(theme) };
  const checked = () => page.$('input[name="uiTheme"]:checked').value;
  assert.equal(checked(), "system", "an invalid stored value shows as following the system");
  click(page.$('input[name="uiTheme"][value="dark"]'));
  assert.equal(checked(), "dark");
  assert.deepEqual(painted, ["dark"]);
  await page.save();
  assert.equal(storage.uiTheme, "dark");
  const reopened = await mount(t, "options", { storage, hash: "#general-settings" });
  assert.equal(reopened.$('input[name="uiTheme"]:checked').value, "dark");
});

// theme-boot.js decides the first frame, so exercise it directly rather than
// through React.
function boot(t, { mirror, osDark = false, stored } = {}) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: "https://extension.test/popup/popup.html",
    runScripts: "outside-only",
  });
  const { window } = dom;
  t.after(() => window.close());
  const listeners = [];
  const media = {
    matches: osDark,
    addEventListener: (_type, listener) => listeners.push(listener),
  };
  window.matchMedia = () => media;
  if (mirror !== undefined) window.localStorage.setItem("auratranslate:uiTheme", mirror);
  const changed = [];
  if (stored !== undefined)
    window.chrome = {
      runtime: {},
      storage: {
        local: { get: (_defaults, done) => done({ uiTheme: stored }) },
        onChanged: { addListener: (listener) => changed.push(listener) },
      },
    };
  window.eval(fs.readFileSync(path.join(__dirname, "../ui/shared/theme-boot.js"), "utf8"));
  const root = window.document.documentElement;
  return {
    window,
    resolved: () => root.dataset.theme,
    preference: () => root.dataset.themePreference,
    setOs(dark) {
      media.matches = dark;
      for (const listener of listeners) listener();
    },
    loaded: () => window.document.dispatchEvent(new window.Event("DOMContentLoaded")),
    storageChange: (value) =>
      changed.forEach((listener) => listener({ uiTheme: { newValue: value } }, "local")),
  };
}

test("the boot script paints the mirrored preference before the page loads", (t) => {
  assert.equal(boot(t, { mirror: "dark", osDark: false }).resolved(), "dark");
  assert.equal(boot(t, { mirror: "light", osDark: true }).resolved(), "light");
  assert.equal(boot(t, { osDark: true }).resolved(), "dark", "no mirror follows the OS");
  assert.equal(boot(t, { mirror: "garbage", osDark: false }).preference(), "system");
});

test("following the system tracks OS changes, a pinned theme ignores them", (t) => {
  const system = boot(t, { mirror: "system" });
  system.setOs(true);
  assert.equal(system.resolved(), "dark");
  system.setOs(false);
  assert.equal(system.resolved(), "light");
  const pinned = boot(t, { mirror: "light" });
  pinned.setOs(true);
  assert.equal(pinned.resolved(), "light");
});

test("extension storage corrects a stale mirror and follows changes from other pages", (t) => {
  const page = boot(t, { mirror: "light", stored: "dark" });
  assert.equal(page.resolved(), "light", "the mirror decides the first frame");
  page.loaded();
  assert.equal(page.resolved(), "dark", "chrome.storage is the source of truth");
  assert.equal(page.window.localStorage.getItem("auratranslate:uiTheme"), "dark");
  page.storageChange("system");
  assert.equal(page.preference(), "system");
});
