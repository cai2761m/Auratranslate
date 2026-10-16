// Real unpacked extension + local deterministic provider, in an isolated profile.
const {chromium} = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const cache = path.join(root, "node_modules/.cache/vocabulary-browser");

async function main() {
    fs.mkdirSync(cache, {recursive: true});
    const requests = [];
    const errors = [];
    const server = http.createServer((req, res) => {
        if (req.url === "/v1/chat/completions") {
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => {
                const payload = JSON.parse(body);
                const input = JSON.parse(payload.messages.at(-1).content);
                requests.push(input);
                const content = JSON.stringify({items: input.items.map(item => ({id: item.id,
                    translatedText: /river bank/i.test(item.context) ? "河岸" : "银行"}))});
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify({choices: [{message: {content}, finish_reason: "stop"}]}));
            });
        } else if (req.url === "/favicon.ico") {res.writeHead(204); res.end();}
        else {
            res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
            res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reading with AuraTranslate</title><style>body{font:20px/1.8 system-ui;max-width:760px;margin:40px auto;padding:0 20px}p{margin:40px 0}iframe{max-width:100%;border:1px solid #ccc}button{font:inherit}</style></head><body><main><h1>Words in context</h1><p id="finance">The <span id="financial-word">bank</span> offers savings accounts.</p><p id="river">We sat on the river <span id="river-word">bank</span>.</p>${req.url === "/frame" ? "" : '<iframe title="Reading frame" src="/frame"></iframe>'}</main></body></html>`);
        }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const profile = fs.mkdtempSync(path.join(cache, "profile-"));
    let context;
    try {
        context = await chromium.launchPersistentContext(profile, {
            channel: process.env.UI_BROWSER || "chrome", headless: true,
            ignoreDefaultArgs: ["--disable-extensions"], args: ["--enable-unsafe-extension-debugging"],
            viewport: {width: 1280, height: 900}, acceptDownloads: true,
        });
        const cdp = await context.browser().newBrowserCDPSession();
        const {id} = await cdp.send("Extensions.loadUnpacked", {path: root});
        const worker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${id}/`)) ||
            await context.waitForEvent("serviceworker", {predicate: worker => worker.url().startsWith(`chrome-extension://${id}/`)});
        await worker.evaluate(settings => chrome.storage.local.set(settings), {
            translationServices: [{id: "test-provider", name: "Local browser fixture", apiProtocol: "openai-compatible",
                baseUrl: `${base}/v1`, apiKey: "fixture-only", models: [{id: "fixture-model"}]}],
            translationServiceId: "test-provider", translationModelId: "fixture-model",
            immersiveTranslationService: "ai", immersiveSourceLanguage: "auto", immersiveTargetLanguage: "zh-CN",
            selectionTranslationEnabled: true, uiTheme: "light",
        });
        const watch = page => {
            page.on("pageerror", error => errors.push(error.message));
            page.on("console", event => {if (event.type() === "error") errors.push(event.text());});
        };
        const reading = await context.newPage();
        watch(reading);
        await reading.goto(base);
        async function selectWord(page, selector, translation) {
            await page.keyboard.press("Escape");
            await page.locator(selector).dblclick();
            const trigger = page.getByRole("button", {name: "翻译所选文字", exact: true});
            await trigger.waitFor();
            await trigger.click();
            await page.locator(".translation").filter({hasText: translation}).waitFor();
        }
        await reading.locator("#financial-word").dblclick();
        await reading.getByRole("button", {name: "翻译所选文字", exact: true}).waitFor();
        assert.equal(requests.length, 0);
        const compact = await reading.locator(".selection-toolbar").boundingBox();
        assert.equal(compact.width, 28);
        assert.equal(compact.height, 28);
        assert.equal((await reading.locator(".selection-trigger svg").boundingBox()).width, 16);
        await reading.screenshot({path: path.join(cache, "toolbar-compact.png")});
        const toolbarSettings = await context.newPage();
        watch(toolbarSettings);
        await toolbarSettings.goto(`chrome-extension://${id}/options/options.html#selection-settings`);
        for (const action of ["copy", "vocabulary", "dismiss"]) await toolbarSettings.locator(`#selection-action-${action}`).check();
        await toolbarSettings.getByRole("button", {name: "上移复制", exact: true}).click();
        await toolbarSettings.locator("#selection-toolbar-size").selectOption("regular");
        await toolbarSettings.locator("#selection-toolbar-position").selectOption("above");
        await toolbarSettings.locator("#selection-toolbar-labels").check();
        await reading.locator('.selection-toolbar[data-labels="true"][data-size="regular"]').waitFor();
        assert.deepEqual(await reading.locator(".selection-tool").evaluateAll(buttons => buttons.map(button => button.dataset.action)),
            ["copy", "translate", "vocabulary", "dismiss"]);
        const toolbarBounds = await reading.locator(".selection-toolbar").boundingBox();
        assert.equal(toolbarBounds.height, 32);
        assert.ok(toolbarBounds.y < (await reading.locator("#financial-word").boundingBox()).y);
        await context.grantPermissions(["clipboard-read", "clipboard-write"], {origin: base});
        await reading.bringToFront();
        const originalSelection = await reading.evaluate(() => getSelection().toString());
        await reading.getByRole("button", {name: "复制所选文字", exact: true}).click();
        await reading.locator('[data-action="copy"][data-copied="true"]').waitFor();
        assert.equal(await reading.evaluate(() => navigator.clipboard.readText()), originalSelection);
        assert.equal(await reading.evaluate(() => getSelection().toString()), originalSelection);
        await reading.screenshot({path: path.join(cache, "toolbar-custom.png")});
        assert.equal(requests.length, 0, "customization and copy must not call a provider");
        await toolbarSettings.screenshot({path: path.join(cache, "toolbar-settings.png"), fullPage: true});
        await toolbarSettings.locator("#selection-toolbar-size").selectOption("comfortable");
        for (const width of [390, 320]) {
            await reading.setViewportSize({width, height: 780});
            await reading.keyboard.press("Escape");
            await reading.locator("#financial-word").dblclick();
            await reading.locator('.selection-toolbar[data-size="comfortable"]').waitFor();
            const bounds = await reading.locator(".selection-toolbar").boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `toolbar overflows ${width}px`);
            await toolbarSettings.setViewportSize({width, height: 780});
            assert.ok(await toolbarSettings.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `toolbar settings overflow ${width}px`);
            await toolbarSettings.screenshot({path: path.join(cache, `toolbar-settings-${width}.png`), fullPage: true});
        }
        await reading.emulateMedia({colorScheme: "dark"});
        await reading.screenshot({path: path.join(cache, "toolbar-dark.png")});
        await reading.emulateMedia({colorScheme: "light"});
        await toolbarSettings.locator("#selection-toolbar-reset").click();
        await reading.locator('.selection-toolbar[data-size="compact"][data-labels="false"]').waitFor();
        assert.equal(await reading.locator(".selection-tool").count(), 1);
        await toolbarSettings.close();
        await reading.setViewportSize({width: 1280, height: 900});
        await reading.getByRole("button", {name: "翻译所选文字", exact: true}).click();
        await reading.locator(".translation").filter({hasText: "银行"}).waitFor();
        assert.equal(requests.length, 1);
        assert.match(requests[0].items[0].context, /savings accounts/);
        await reading.screenshot({path: path.join(cache, "selection-desktop.png")});
        await reading.getByRole("button", {name: "收藏到生词本", exact: true}).click();
        await reading.getByRole("button", {name: "已收藏", exact: true}).waitFor();
        const [book] = await Promise.all([
            context.waitForEvent("page"), reading.getByRole("button", {name: "打开生词本", exact: true}).click(),
        ]);
        watch(book);
        await book.locator(".vocabulary-entry").waitFor();
        assert.equal(await book.locator(".vocabulary-entry h3").textContent(), "bank");
        await selectWord(reading, "#river-word", "河岸");
        await reading.getByRole("button", {name: "收藏到生词本", exact: true}).click();
        await reading.getByRole("button", {name: "已收藏", exact: true}).waitFor();
        await book.waitForFunction(() => document.querySelectorAll(".vocabulary-entry").length === 2);
        assert.equal(requests.length, 2);
        await selectWord(reading, "#financial-word", "银行");
        assert.equal(requests.length, 2, "repeat lookup restores the cached result");
        await reading.getByRole("button", {name: "收藏到生词本", exact: true}).click();
        await reading.getByRole("button", {name: "已收藏", exact: true}).waitFor();
        assert.equal((await worker.evaluate(() => chrome.storage.local.get("auraVocabulary"))).auraVocabulary.entries.length, 2);
        await book.locator("#vocabulary-search").fill("河岸");
        await book.getByRole("button", {name: "标记已掌握", exact: true}).click();
        await book.locator(".vocabulary-badge.learned").waitFor();
        await book.locator("#vocabulary-filter").selectOption("learning");
        await book.locator(".vocabulary-empty").waitFor();
        await book.locator("#vocabulary-filter").selectOption("learned");
        await book.locator(".vocabulary-context summary").click();
        await book.locator("textarea").fill("河流附近的岸边");
        await book.getByRole("button", {name: "保存笔记", exact: true}).click();
        await book.locator(".vocabulary-status").filter({hasText: "笔记已保存"}).waitFor();
        const [download] = await Promise.all([
            book.waitForEvent("download"), book.locator("#vocabulary-export-json").click(),
        ]);
        const backupPath = path.join(cache, "vocabulary-backup.json");
        await download.saveAs(backupPath);
        const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
        assert.equal(backup.entries.length, 2);
        assert.equal(backup.entries.find(entry => entry.translatedText === "河岸").notes, "河流附近的岸边");
        await book.getByRole("button", {name: "删除", exact: true}).click();
        await book.getByRole("button", {name: "撤销删除", exact: true}).waitFor();
        await book.getByRole("button", {name: "撤销删除", exact: true}).click();
        await book.locator(".vocabulary-status").filter({hasText: "已恢复"}).waitFor();
        await book.locator("#vocabulary-import-file").setInputFiles(backupPath);
        await book.locator(".vocabulary-status").filter({hasText: "跳过 2 条重复"}).waitFor();
        await book.locator("#vocabulary-search").fill("");
        await book.locator("#vocabulary-filter").selectOption("all");
        await book.screenshot({path: path.join(cache, "notebook-desktop.png"), fullPage: true});
        await book.emulateMedia({colorScheme: "dark"});
        await book.locator("#tab-general-settings").click();
        await book.locator('input[name="uiTheme"][value="dark"]').check();
        await book.locator("#tab-vocabulary").click();
        await book.screenshot({path: path.join(cache, "notebook-dark.png"), fullPage: true});
        for (const width of [390, 320]) {
            await reading.setViewportSize({width, height: 780});
            await selectWord(reading, "#financial-word", "银行");
            const bounds = await reading.locator(".selection-card").boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `selection overflow at ${width}px`);
            await reading.screenshot({path: path.join(cache, `selection-${width}.png`)});
            await book.setViewportSize({width, height: 780});
            assert.ok(await book.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `notebook overflow at ${width}px`);
            const selectedTab = await book.locator("#tab-vocabulary").boundingBox();
            assert.ok(selectedTab.x >= 0 && selectedTab.x + selectedTab.width <= width + 1, `selected notebook tab is hidden at ${width}px`);
            await book.screenshot({path: path.join(cache, `notebook-${width}.png`), fullPage: true});
        }
        await reading.setViewportSize({width: 1280, height: 900});
        await reading.keyboard.press("Escape");
        const frame = reading.frameLocator("iframe");
        await frame.locator("#financial-word").dblclick();
        await frame.getByRole("button", {name: "翻译所选文字", exact: true}).click();
        await frame.locator(".translation").filter({hasText: "银行"}).waitFor();
        await book.locator("#tab-selection-settings").click();
        await book.locator("#selectionTranslationEnabled").uncheck();
        await reading.locator("[data-ytbt-selection-root]").waitFor({state: "detached"});
        await frame.locator("[data-ytbt-selection-root]").waitFor({state: "detached"});
        await book.locator("#tab-general-settings").click();
        await book.locator("#clear-cache").click();
        await book.locator("#status").filter({hasText: "已清空"}).waitFor();
        assert.equal((await worker.evaluate(() => chrome.storage.local.get("auraVocabulary"))).auraVocabulary.entries.length, 2);
        const popup = await context.newPage();
        watch(popup);
        await popup.setViewportSize({width: 320, height: 780});
        await popup.goto(`chrome-extension://${id}/popup/popup.html`);
        await popup.locator("#open-vocabulary").waitFor();
        assert.ok(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "popup overflows a phone viewport");
        await popup.screenshot({path: path.join(cache, "popup-320.png"), fullPage: true});
        const [shortcutBook] = await Promise.all([
            context.waitForEvent("page"), popup.locator("#open-vocabulary").click(),
        ]);
        await shortcutBook.locator(".vocabulary-entry").first().waitFor();
        assert.ok(shortcutBook.url().endsWith("#vocabulary"));
        assert.deepEqual(errors, []);
        console.log("Real Chrome extension checks passed: compact/custom toolbar, live settings/order/labels/position/reset, clipboard, selection, context/cache, concurrent notebook refresh, notes, learning state, delete/undo, JSON export/import, dark/mobile layouts, frames and cache clearing. Provider replies were local fixtures.");
        console.log(`Screenshots and backup: ${cache}`);
    } finally {
        await context?.close();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
