// Capture documentation from production UI/renderers with synthetic text and
// mocked extension APIs. Never reads a real browser profile or API credential.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createPreviewServer } = require("./preview-ui.cjs");
const scripts = require("./extension-scripts.cjs");
const root = path.resolve(__dirname, "..");
const assets = path.join(root, "docs/assets");
const frames = path.join(root, "node_modules/.cache/readme-frames");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const errors = [];
const chromeMock = () => {
  const data = {};
  window.chrome = {
    runtime: { getManifest: () => ({ version: "demo" }), onMessage: { addListener() {} } },
    storage: { local: {
      get: (defaults, done) => done({ ...defaults, ...data }),
      set: (patch, done) => { Object.assign(data, patch); done?.(); },
    }, onChanged: { addListener() {} } },
  };
};
const shell = (title, body, css = "") => `<!doctype html><html lang="en"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:#f8f8fb;color:#292735;font:16px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}
  .demo-bar{height:52px;padding:0 28px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5e3ec;color:#817b90;font-size:12px}
  .dots{color:#a99ec8;letter-spacing:5px}.demo-label{font-size:11px;letter-spacing:1px}
  .demo-step{position:fixed;bottom:20px;left:28px;padding:7px 13px;border:1px solid #ddd7ef;border-radius:20px;background:#f2eefb;color:#675591;font-size:12px;z-index:2}
  ${css}</style><body><header class="demo-bar" translate="no"><span><b class="dots">● ● ●</b> &nbsp; ${title}</span><span class="demo-label">AURATRANSLATE · DEMO</span></header>${body}</body></html>`;

async function newPage(browser, viewport = { width: 960, height: 650 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("pageerror", e => errors.push(e.message));
  // Only the local preview server is reachable during media generation.
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1"
    ? route.continue() : route.abort());
  return page;
}
async function record(page, name, count, action) {
  const dir = path.join(frames, name);
  fs.mkdirSync(dir, { recursive: true });
  for (let index = 0; index < count; index++) {
    await action(index);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(dir, `${String(index).padStart(3, "0")}.png`) });
  }
  fs.writeFileSync(path.join(dir, "sequence.json"), JSON.stringify({ count, duration: 125 }));
}

async function captureReading(browser, base) {
  const page = await newPage(browser);
  const html = shell("Reading notes / Asynchronous code", `<main><article>
    <div class="eyebrow" translate="no">THE READING ROOM &nbsp; / &nbsp; 01</div>
    <h1>Stay in the flow.</h1>
    <p>Keep the original nearby. Let the translation bring the meaning closer.</p>
    <h2>Small details. Better reading.</h2>
    <p>Use <code>async</code> and <code>await</code> to keep asynchronous code readable.</p>
    <p>Open <a href="#guide">the guide</a> and keep reading on the same page.</p>
  </article></main><div class="demo-step" translate="no" data-ytbt-immersive-root="true">01 · Click to translate / 点击翻译</div>`, `
    article{max-width:770px;margin:36px auto;padding:0 34px}.eyebrow{font-size:11px;letter-spacing:2px;color:#9a8fb0}
    h1{font-size:36px;line-height:1.2;letter-spacing:-1px;margin:18px 0}h2{font-size:21px;margin:23px 0 10px}p{font-size:17px;line-height:1.65;margin:14px 0;color:#66616f}
    code{font-size:14px;border:1px solid #ddd7ea;border-radius:5px;background:#f0ecf7;color:#7056a1;padding:2px 6px}a{color:#7056a1;text-underline-offset:3px}
  `);
  await page.route(`${base}/readme-demo`, route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(`${base}/readme-demo`);
  await page.addStyleTag({ path: path.join(root, "src/immersive.css") });
  await page.evaluate(chromeMock);
  await page.addScriptTag({ content: scripts.source("shared") });
  await page.evaluate(() => {
    window.demoRequests = 0;
    chrome.runtime.sendMessage = (message, done) => {
      if (message.cacheOnly) return done({ ok: true, items: [] });
      window.demoRequests++;
      const translate = (item) => {
        if (item.sourceText === "Stay in the flow.") return "让阅读，保持流畅。";
        if (item.sourceText.startsWith("Keep the original")) return "原文就在身边，译文让理解更进一步。";
        if (item.sourceText.startsWith("Small details")) return "细节到位，阅读更轻松。";
        if (item.sourceText.startsWith("Use ")) return item.formattedText.replace("Use ", "使用 ").replace(" and ", " 和 ").replace(" to keep asynchronous code readable.", "，让异步代码更易读。");
        if (item.sourceText.startsWith("Open ")) return item.formattedText.replace("Open ", "打开").replace("the guide", "指南").replace(" and keep reading on the same page.", "，继续在当前页面阅读。");
        throw new Error(`Unmapped demo text: ${item.sourceText}`);
      };
      setTimeout(() => done({ ok: true, items: message.items.map(item => ({ id: item.id, translatedText: translate(item) })) }), 550);
    };
  });
  await page.addScriptTag({ content: scripts.source("immersive") });
  const ball = page.locator(".ytbt-immersive-ball");
  await record(page, "immersive", 80, async index => {
    if (index === 8) await ball.click();
    if (index === 10) await page.mouse.move(500, 80);
    if (index === 28) {
      assert.equal(await page.locator('[data-ytbt-immersive-translation][data-ytbt-state="done"]').count(), 5);
      assert.equal(await page.locator('.ytbt-immersive-text code').count(), 2);
      assert.equal(await page.locator('.ytbt-immersive-text a[href="#guide"]').count(), 1);
      await page.screenshot({ path: path.join(assets, "immersive-preview.png") });
    }
    if (index === 20) await page.evaluate(() => {
      document.querySelector(".demo-step").textContent = "02 · Original + translation / 双语对照";
    });
    if (index === 44) {
      await ball.click();
      await page.mouse.move(500, 80);
      await page.evaluate(() => document.querySelector(".demo-step").textContent = "03 · Click to hide / 点击隐藏译文");
      assert.equal(await page.locator(".ytbt-immersive-text").first().isVisible(), false);
    }
    if (index === 60) {
      await ball.click();
      await page.mouse.move(500, 80);
      await page.evaluate(() => document.querySelector(".demo-step").textContent = "04 · Click to show / 点击恢复译文");
    }
  });
  assert.equal(await page.evaluate(() => demoRequests), 2, "show/hide must reuse the existing translations");
  await page.close();
  console.log("Captured webpage demo with production extraction, rendering and controls.");
}

async function captureSubtitles(browser) {
  const page = await newPage(browser, { width: 960, height: 570 });
  await page.setContent(shell("A short lesson / Bilingual subtitles", `<div id="movie_player" class="html5-video-player"><div class="lesson" translate="no"><span>LEARN SOMETHING NEW</span><h1>Make room<br>for understanding.</h1><div class="ribbon"></div><p>A short lesson, with both languages in view.</p></div><div class="timeline"><span>▶</span><span>00:08 / 02:00</span><i></i><span>HD</span></div></div>`, `
    #movie_player{height:518px;position:relative;background:radial-gradient(ellipse at 92% 20%,#403659,transparent 65%),radial-gradient(ellipse at 0 100%,#1c5458,transparent 65%),#19252f;overflow:hidden;color:#fff}.lesson{padding:43px 58px}.lesson>span{font-size:11px;letter-spacing:3px;color:#91c3c6}.lesson h1{font-size:43px;line-height:1.16;letter-spacing:-1px;font-weight:500;margin:17px 0}.lesson p{font-size:14px;color:#a7bcc4;margin-top:21px}.ribbon{position:absolute;right:-35px;top:36px;width:400px;height:210px;border:2px solid #81d9c880;border-radius:50%;transform:rotate(-26deg);box-shadow:0 10px 60px #89d5e022,inset 0 0 65px #94a2fb22}.timeline{position:absolute;bottom:17px;left:34px;right:34px;display:flex;align-items:center;gap:19px;font-size:11px;color:#bccbd8}.timeline i{height:3px;flex:1;background:linear-gradient(90deg,#a392da 9%,#ffffff25 9%)}
  `));
  await page.addStyleTag({ path: path.join(root, "src/overlay.css") });
  await page.evaluate(chromeMock);
  await page.addScriptTag({ content: scripts.source("shared") });
  await page.addScriptTag({ path: path.join(root, "src/content-core.js") });
  await page.addScriptTag({ path: path.join(root, "src/content-player.js") });
  await page.addScriptTag({ path: path.join(root, "src/content-overlay.js") });
  await page.evaluate(() => {
    window.normalizeSubtitlePosition = value => value || null;
    window.applySettings = () => {
      state.overlay.style.setProperty("--ytbt-font-scale", String(state.settings.fontScale));
      applyOverlayPosition();
    };
    state.video = { currentTime: 8 };
    state.cues = [{ startMs: 0, endMs: 120000, sourceText: "A little context makes every new idea easier to understand.", translatedText: "多一点上下文，每个新想法都更容易理解。", status: "translated" }];
    ensureOverlay();
    updateOverlay();
  });
  assert.equal(await page.locator(".ytbt-cn").textContent(), "多一点上下文，每个新想法都更容易理解。");
  await page.screenshot({ path: path.join(assets, "subtitles.png") });
  await page.close();
  console.log("Captured production subtitle overlay on original illustrative artwork.");
}

async function captureUi(browser, base) {
  const page = await newPage(browser, { width: 1180, height: 900 });
  await page.goto(`${base}/options/options.html`);
  await page.locator("#detail-name").filter({ hasText: "演示供应方" }).waitFor();
  assert.equal(await page.locator("#detail-api-key").inputValue(), "");
  await page.screenshot({ path: path.join(assets, "settings.png"), fullPage: true, animations: "disabled" });
  await page.goto(`${base}/popup/popup.html`);
  await page.locator("#translate-page:enabled").waitFor();
  await page.locator("main").screenshot({ path: path.join(assets, "popup.png"), animations: "disabled" });
  await page.close();
  console.log("Captured production settings and popup with mock provider configuration.");
}

async function captureAurora(browser) {
  const page = await newPage(browser, { width: 960, height: 330 });
  // Mount the actual control to obtain its current icon, labels and states.
  await page.setContent("<body>");
  await page.evaluate(chromeMock);
  await page.addScriptTag({ content: scripts.source("shared") });
  await page.addScriptTag({ content: scripts.source("immersive") });
  const control = await page.locator(".ytbt-immersive-tab").evaluate(el => el.outerHTML);
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${read("src/immersive.css")}
    *{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:1fr 1fr;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
    section{height:330px;position:relative;transform:translateZ(0);padding:30px;background:#f8f8fb;color:#292735}section.dark{background:#19191f;color:#eeedf4}h2{margin:0;font-size:17px;font-weight:500}p{font-size:12px;color:#938d9f;margin-top:8px}.ytbt-immersive-tab{top:175px!important;right:calc(50% - 22px);transform:translateY(-50%) scale(2.3);pointer-events:none}.ytbt-immersive-tab::after{display:none}.state-label{position:absolute;bottom:28px;left:30px;font-size:12px}
  </style><section><h2>Light / 浅色</h2><p>AURORA · PEARL</p>${control}<span class="state-label">静静陪伴 · Ready</span></section><section class="dark"><h2>Dark / 深色</h2><p>AURORA · MIDNIGHT</p>${control}<span class="state-label">静静陪伴 · Ready</span></section>`);
  await page.evaluate(() => document.querySelectorAll(".ytbt-immersive-tab").forEach((el,index) => el.dataset.ytbtTheme = index ? "dark" : "light"));
  await page.screenshot({ path: path.join(assets, "aurora-preview.png") });
  await record(page, "aurora", 56, async index => {
    if (index === 12 || index === 40) await page.evaluate(mode => {
      document.querySelectorAll(".ytbt-immersive-tab").forEach(el => el.dataset.ytbtState = mode);
      document.querySelectorAll(".state-label").forEach(el => el.textContent = mode === "translating" ? "极光流动 · Translating" : "翻译完成 · Done");
    }, index === 12 ? "translating" : "done");
  });
  await page.close();
  console.log("Captured enlarged light/dark control state showcase.");
}

(async () => {
  fs.mkdirSync(assets, { recursive: true });
  const server = createPreviewServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.UI_BROWSER || "chrome", headless: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    await captureReading(browser, base);
    await captureSubtitles(browser);
    await captureUi(browser, base);
    await captureAurora(browser);
    assert.deepEqual(errors, [], "documentation captures must not contain page errors");
    console.log(`PNG captures: ${assets}\nGIF frames: ${frames}\nNext: python scripts/encode-readme-gifs.py`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
