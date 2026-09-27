const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPreviewServer } = require("./preview-ui.cjs");

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
    await page.locator("#more-toggle").click();
    await page.locator('[data-site-rule="always"]').click();
    await page.locator("#status").filter({ hasText: "设置已保存" }).waitFor();
    await page.screenshot({ path: path.join(screenshots, "popup-more.png"), fullPage: true, animations: "disabled" });
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
    await page.screenshot({
      path: path.join(screenshots, "popup.png"),
      fullPage: true,
      animations: "disabled",
    });
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
