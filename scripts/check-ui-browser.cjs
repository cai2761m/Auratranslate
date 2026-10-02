const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPreviewServer } = require("./preview-ui.cjs");
const { checkFloatingControl } = require("./check-floating-browser.cjs");

async function main() {
  const server = createPreviewServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.UI_BROWSER || "chrome",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (event) => {
      if (event.type() === "error") errors.push(event.text());
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    const screenshots = path.resolve("node_modules/.cache/ui-screenshots");
    fs.mkdirSync(screenshots, { recursive: true });
    await page.goto(`${url}/options/options.html`);
    await page
      .locator("#detail-name")
      .filter({ hasText: "演示供应方" })
      .waitFor();
    await page.screenshot({
      path: path.join(screenshots, "options-desktop.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: path.join(screenshots, "options-dark.png"), fullPage: true, animations: "disabled" });
    // Assert the intent -- dark mode actually darkens the surface -- instead of
    // pinning one hex value, which made every palette tweak a false regression.
    const darkSurface = await page
      .locator(".panel")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const [r, g, b] = darkSurface.match(/\d+/g).map(Number);
    assert.ok(
      (r + g + b) / 3 < 64,
      `dark mode should paint a dark panel surface, got ${darkSurface}`,
    );
    await page.emulateMedia({ colorScheme: "light" });
    await page.locator("#add-service").click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "service-name",
    );
    await page.locator("#service-name").fill("浏览器验证供应方");
    await page.locator("#service-base-url").fill("https://preview.invalid/v1");
    await page.locator(".model-id").fill("manual");
    await page.locator("#fetch-models").click();
    await page.locator("#model-picker-dialog").waitFor();
    await page.locator('#model-picker-list input[value="demo-new"]').check();
    await page.locator("#model-picker-add").click();
    assert.equal(await page.locator(".model-row").count(), 2);
    assert.equal(
      await page
        .locator("#service-dialog .modal-panel")
        .evaluate((el) => el.inert),
      false,
    );
    await page.locator("#save-service").click();
    await page
      .locator("#detail-name")
      .filter({ hasText: "浏览器验证供应方" })
      .waitFor();
    await page.locator("#detail-test-models").click();
    await page.locator("#start-model-test").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.model-test-result[data-state="success"]')
          .length === 2,
    );
    await page.screenshot({
      path: path.join(screenshots, "model-tests.png"),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement.id === "detail-test-models",
    );
    assert.equal(
      await page.locator("#settings-form").evaluate((el) => el.inert),
      false,
    );
    await page.locator("#tab-realtime-api").click();
    await page
      .locator("#translationServiceId")
      .selectOption({ label: "浏览器验证供应方" });
    await page
      .locator("#status")
      .filter({ hasText: "设置已自动保存" })
      .waitFor();
    await page.reload();
    await page.locator("#translationModelId").waitFor();
    assert.equal(
      await page.locator("#translationModelId").inputValue(),
      "manual",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#tab-translation-services").click();
    await page.screenshot({
      path: path.join(screenshots, "options-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "mobile settings must not overflow the page",
    );
    await page.goto(`${url}/popup/popup.html`);
    await page.locator("#translate-page:enabled").waitFor();
    await page.locator("main").screenshot({ path: path.join(screenshots, "popup-default.png"), animations: "disabled" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.locator("main").screenshot({ path: path.join(screenshots, "popup-dark.png"), animations: "disabled" });
    await page.emulateMedia({ colorScheme: "light" });
    await page.locator("#more-toggle").click();
    await page.locator('[data-site-rule="always"]').click();
    // The site-rule save is confirmed through #status, which the "more" screen
    // hides alongside the translation controls. Wait on its text, not its
    // visibility, so the persistence check still gates the screenshot.
    await page.waitForFunction(
      () => document.querySelector("#status")?.textContent.includes("设置已保存"),
    );
    await page.locator("main").screenshot({ path: path.join(screenshots, "popup-more.png"), animations: "disabled" });
    for (const width of [320, 380]) {
      await page.setViewportSize({ width, height: 600 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "narrow popup has no horizontal overflow");
      assert.ok((await page.locator("main").boundingBox()).height <= 600, "expanded popup fits browser action height");
    }
    await page.locator("#more-toggle").click();
    await page.locator("#display-mode-toggle").click();
    await page.waitForFunction(
      () => document.querySelector("#mode-icon").textContent === "A",
    );
    await page.locator("#translation-service").selectOption("google-free");
    await page.locator("#model-field").waitFor({ state: "hidden" });
    await page.locator("#translate-page").click();
    await page
      .locator("#status")
      .filter({ hasText: "网页翻译已完成" })
      .waitFor();
    await page.locator("main").screenshot({
      path: path.join(screenshots, "popup.png"),
      animations: "disabled",
    });

    // Appearance: the preference cycles system -> light -> dark -> system, an
    // explicit choice overrides the OS, and "system" tracks OS changes live.
    const theme = () =>
      page.evaluate(() => ({
        resolved: document.documentElement.dataset.theme,
        preference: document.documentElement.dataset.themePreference,
      }));
    const stored = () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("auratranslate-ui-preview")).uiTheme,
      );
    // matchMedia change listeners run in the next rendering step, so an
    // assertion straight after emulateMedia would pass for pinned themes
    // without testing anything. Wait until the OS switch has been delivered.
    const setOs = async (scheme) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForFunction(
        (dark) => matchMedia("(prefers-color-scheme: dark)").matches === dark,
        scheme === "dark",
      );
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      );
    };
    const cycleTo = async (preference) => {
      await page.locator("#theme-toggle").click();
      await page.waitForFunction(
        (p) => document.querySelector("#theme-toggle")?.dataset.themePreference === p,
        preference,
      );
    };
    await page.setViewportSize({ width: 400, height: 600 });
    await setOs("light");
    assert.deepEqual(await theme(), { resolved: "light", preference: "system" });
    await cycleTo("light");
    await setOs("dark");
    assert.deepEqual(await theme(), { resolved: "light", preference: "light" }, "pinned light ignores a dark OS");
    await cycleTo("dark");
    await setOs("light");
    assert.deepEqual(await theme(), { resolved: "dark", preference: "dark" }, "pinned dark ignores a light OS");
    assert.equal(await stored(), "dark", "the choice is persisted to extension storage");
    await page.locator("main").screenshot({ path: path.join(screenshots, "popup-pinned-dark.png"), animations: "disabled" });
    // Reload: the localStorage mirror must paint dark before React mounts.
    await page.reload();
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.theme),
      "dark",
      "a reload keeps the pinned theme",
    );
    await page.locator("#translate-page:enabled").waitFor();
    await cycleTo("system");
    assert.deepEqual(await theme(), { resolved: "light", preference: "system" });
    await setOs("dark");
    assert.equal((await theme()).resolved, "dark", "system follows the OS while the page is open");
    await setOs("light");
    assert.equal((await theme()).resolved, "light", "system follows the OS back to light");
    assert.equal(await stored(), "system");

    await page.goto(`${url}/options/options.html`);
    await page.locator("#tab-general-settings").click();
    assert.equal(await page.locator('input[name="uiTheme"]:checked').getAttribute("value"), "system");
    await page.locator('.theme-option:has(input[value="dark"])').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await page.screenshot({ path: path.join(screenshots, "general-pinned-dark.png"), fullPage: true, animations: "disabled" });
    await page.locator('.theme-option:has(input[value="system"])').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
    await page.evaluate(() => dispatchEvent(new Event("pagehide")));
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("auratranslate-ui-preview")).uiTheme === "system",
    );

    await page.goto(`${url}/options/options.html`);
    for (const width of [1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ["translation-services", "realtime-api", "immersive-api", "general-settings"]) {
        await page.locator(`#tab-${tab}`).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tab} fits ${width}px`);
      }
      if (width === 1280 || width === 390) await page.screenshot({ path: path.join(screenshots, `general-${width}.png`), fullPage: true, animations: "disabled" });
    }
    await page.locator("#tab-translation-services").click();
    await page.locator("#add-service").click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile dialog fits page");
    await page.screenshot({ path: path.join(screenshots, "dialog-mobile.png"), fullPage: true, animations: "disabled" });
    await page.keyboard.press("Escape");
    await checkFloatingControl(browser, screenshots);
    assert.deepEqual(errors, [], "no browser errors or CSP violations");
    console.log(
      `Browser UI checks passed (mock storage/provider, production bundles, Chrome). Screenshots: ${screenshots}`,
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
