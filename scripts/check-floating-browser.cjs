const assert = require("node:assert/strict");
const path = require("node:path");

// Exercise production controls against a real rendered page; translation and
// storage are simulated so visual checks cannot call a paid provider.
async function checkFloatingControl(browser, screenshots) {
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("https://floating.example/**", (route) => route.fulfill({body: "<!doctype html><html><body></body></html>"}));
    await page.goto("https://floating.example/");
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><style>
      body { margin: 0; background: #faf9fc; color: #292735; font: 16px/1.8 "Microsoft YaHei", sans-serif; }
      body.dark { background: #19191f; color: #eeedf4; }
      article { min-height: 100vh; padding: 90px 80px; box-sizing: border-box; background: transparent; }
      h1 { font-size: 30px; font-weight: 500; } p { max-width: 560px; opacity: .65; }
    </style></head><body><article><h1>让阅读跨越语言</h1><p>在当前网页中阅读、翻译与对照。右侧悬浮按钮根据它所在位置的背景切换颜色。</p></article></body></html>`);
    await page.addStyleTag({ path: path.resolve("src/immersive.css") });
    await page.evaluate(() => {
      const state = {
        preferences: {}, preferencesReady: Promise.resolve(),
        ballDrag: { pointerId: null, active: false, suppressClick: false },
        translated: false, visible: true, ballTopPct: 50,
      };
      window.previewCalls = 0;
      window.previewStorage = {};
      window.YTBTImmersive = {
        state, Core: { DEFAULT_SETTINGS: {} }, DEFAULT_BALL_TOP_PCT: 50,
        clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
        storageGet: async (defaults) => ({ ...defaults, ...window.previewStorage }),
        storageSet: async (patch) => Object.assign(window.previewStorage, patch),
        syncPageIdentity() {},
        async translateCurrentPage() {
          window.previewCalls++;
          window.YTBTImmersive.updateBallMode("translating");
          window.YTBTImmersive.showStatus("正在翻译当前网页…", true);
        },
      };
    });
    await page.addScriptTag({ path: path.resolve("src/immersive-controls.js") });
    await page.evaluate(() => window.YTBTImmersive.mountControls());
    const control = page.locator(".ytbt-immersive-tab");
    const button = page.locator(".ytbt-immersive-ball");
    const panel = page.locator(".ytbt-immersive-panel");
    const theme = (value) => page.waitForFunction((expected) => document.querySelector(".ytbt-immersive-tab").dataset.ytbtTheme === expected, value);
    await theme("light");
    assert.equal(await button.evaluate((el) => getComputedStyle(el).color), "rgb(41, 39, 53)");
    assert.equal(await control.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await control.evaluate((el) => getComputedStyle(el).borderRadius), "50%");
    assert.equal(await control.evaluate((el) => getComputedStyle(el).right), "12px");
    assert.equal(await control.evaluate((el) => getComputedStyle(el, "::before").animationName), "none", "idle aurora stays still while reading");
    await page.screenshot({ path: path.join(screenshots, "floating-light.png"), animations: "disabled" });
    await control.hover();
    assert.equal(await control.evaluate((el) => getComputedStyle(el, "::before").animationName), "ytbt-aurora-drift");
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".ytbt-immersive-tab"), "::after").opacity === "1");
    await page.screenshot({ path: path.join(screenshots, "floating-hover.png"), animations: "disabled" });
    await page.mouse.move(10, 10);
    await page.evaluate(() => document.body.classList.add("dark"));
    await theme("dark");
    assert.equal(await button.evaluate((el) => getComputedStyle(el).color), "rgb(255, 255, 255)");
    assert.equal(await control.evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(41, 39, 53)");
    await page.screenshot({ path: path.join(screenshots, "floating-dark.png"), animations: "disabled" });

    // A translucent layer is painted above the opaque body, not below it.
    await page.evaluate(() => document.querySelector("article").style.background = "rgba(255, 255, 255, .9)");
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await theme("light");
    await page.evaluate(() => document.querySelector("article").style.background = "transparent");
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await theme("dark");

    // The transparent article must inherit the visible body background, and
    // position-based sampling must switch when a light section scrolls under it.
    await page.evaluate(() => {
      const section = document.createElement("section");
      section.style.cssText = "height:100vh;background:#fff";
      document.body.appendChild(section);
      window.scrollTo(0, window.innerHeight);
    });
    await theme("light");
    await page.evaluate(() => window.scrollTo(0, 0));
    await theme("dark");
    await button.focus();
    assert.equal(await button.evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
    await page.keyboard.press("Enter");
    assert.equal(await button.getAttribute("aria-busy"), "true");
    assert.equal(await panel.isVisible(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".ytbt-immersive-tab"), "::after").visibility === "hidden");
    assert.equal(await button.evaluate((el) => getComputedStyle(el, "::before").animationName), "ytbt-immersive-spin");
    await page.screenshot({ path: path.join(screenshots, "floating-translating.png"), animations: "disabled" });
    await page.evaluate(() => {
      const app = window.YTBTImmersive;
      app.state.translated = true;
      app.updateBallMode("done");
      app.showStatus("网页翻译已完成", true);
    });
    assert.equal(await button.getAttribute("aria-label"), "隐藏网页译文");
    assert.notEqual(await button.evaluate((el) => getComputedStyle(el, "::after").content), "none");
    await page.screenshot({ path: path.join(screenshots, "floating-done.png"), animations: "disabled" });
    await page.keyboard.press("Enter");
    assert.equal(await button.getAttribute("aria-label"), "显示网页译文");
    assert.equal(await page.evaluate(() => window.previewCalls), 1, "display changes do not restart translation");
    assert.equal(await control.evaluate((el) => getComputedStyle(el, "::before").animationName), "none", "focus alone does not keep the aurora moving after translation");

    const rect = await control.boundingBox();
    await page.mouse.move(rect.x + 20, rect.y + 20);
    await page.mouse.down();
    await page.mouse.move(rect.x - 80, rect.y + 120, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector(".ytbt-immersive-tab")).right) - 12) < .1);
    assert.ok(await page.evaluate(() => window.previewStorage.immersiveBallTopPct > 60), "dragged position persists");
    assert.equal(await page.evaluate(() => window.previewCalls), 1, "drag does not translate");
    await page.evaluate(() => {
      const app = window.YTBTImmersive;
      app.state.translated = false;
      app.updateBallMode("error");
      app.showStatus("连接失败，请稍后重试。", true);
    });
    await control.hover();
    await page.screenshot({ path: path.join(screenshots, "floating-error.png"), animations: "disabled" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.YTBTImmersive.updateBallMode("translating"));
    assert.equal(await button.evaluate((el) => getComputedStyle(el, "::before").animationName), "none");
    assert.equal(await control.evaluate((el) => getComputedStyle(el, "::before").animationName), "none", "reduced motion also stops the aurora curtain");
    await page.setViewportSize({ width: 320, height: 640 });
    const mobileRect = await control.boundingBox();
    assert.equal(mobileRect.width, 38);
    assert.ok(mobileRect.x >= 0 && mobileRect.x + mobileRect.width <= 320);
    // Saved near-edge positions must remain reachable on short mobile views.
    await page.evaluate(() => {
      window.previewStorage.immersiveBallTopPct = 96;
      window.YTBTImmersive.state.ball.remove();
      window.YTBTImmersive.state.panel.remove();
      window.YTBTImmersive.state.dismissMenu.remove();
      window.YTBTImmersive.state.ball = null;
      window.YTBTImmersive.mountControls();
    });
    await page.setViewportSize({ width: 320, height: 240 });
    await page.waitForFunction(() => document.querySelector(".ytbt-immersive-tab").style.top.includes("96%"));
    const shortRect = await control.boundingBox();
    assert.ok(shortRect.y >= 8 && shortRect.y + shortRect.height <= 232, "saved position respects viewport edges");
    await page.screenshot({ path: path.join(screenshots, "floating-mobile.png"), animations: "disabled" });
    await page.setViewportSize({width: 900, height: 640});
    await page.evaluate(() => window.YTBTImmersive.updateBallMode("idle"));
    await control.hover();
    const dismiss = page.locator(".ytbt-immersive-dismiss");
    const menu = page.locator(".ytbt-immersive-dismiss-menu");
    assert.equal(await dismiss.evaluate((el) => getComputedStyle(el).opacity), "1");
    await dismiss.click();
    assert.equal(await menu.isVisible(), true);
    assert.equal(await panel.isVisible(), false, "status and close menu do not overlap");
    await page.screenshot({path: path.join(screenshots, "floating-dismiss.png"), animations: "disabled"});
    await page.locator('[data-dismiss="session"]').click();
    assert.equal(await control.isVisible(), false);
    assert.equal(await page.evaluate(() => previewStorage.immersiveDisabledSites), undefined);
    await page.evaluate(() => {
      const app = window.YTBTImmersive;
      app.state.controlDismissed = false;
      app.syncControlVisibility();
    });
    assert.equal(await control.isVisible(), true);
    await control.hover();
    await dismiss.click();
    await page.locator('[data-dismiss="site"]').click();
    await page.waitForFunction(() => document.querySelector(".ytbt-immersive-tab").hidden);
    assert.deepEqual(await page.evaluate(() => previewStorage.immersiveDisabledSites), ["floating.example"]);
    await page.evaluate(() => {
      const app = window.YTBTImmersive;
      app.state.preferences.immersiveDisabledSites = [];
      app.syncControlVisibility();
    });
    assert.equal(await control.isVisible(), true, "removing the site restores the control");
    assert.equal(await page.evaluate(() => previewCalls), 1, "close choices never translate");
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

module.exports = { checkFloatingControl };
