const {chromium} = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createPreviewServer} = require("./preview-ui.cjs");

async function main() {
    const server = createPreviewServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
        browser = await chromium.launch({channel: process.env.UI_BROWSER || "chrome", headless: true});
        const page = await browser.newPage({viewport: {width: 1280, height: 900}});
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}/options/options.html`;
        const screenshots = path.resolve("node_modules/.cache/ui-screenshots");
        fs.mkdirSync(screenshots, {recursive: true});
        await page.goto(`${url}#realtime-api`);
        await page.locator("#subtitleTranslationMode").waitFor();
        assert.equal(await page.locator(".save-note").count(), 0);
        for (const width of [1280, 390, 320]) {
            await page.setViewportSize({width, height: 900});
            for (const id of ["subtitleTranslationMode", "targetLanguage", "fontScale", "subtitleEnabled"]) {
                assert.equal(await page.locator(`#${id}`).evaluate((el) => el.closest("section").id), "realtime-api");
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({path: path.join(screenshots, `realtime-${width}.png`), fullPage: true});
        }
        await page.locator("#tab-immersive-api").click();
        await page.locator("#disabled-site-input").fill("https://www.YouTube.com/watch?v=sample");
        await page.locator("#add-disabled-site").click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("已自动保存"));
        assert.equal(await page.locator("#disabled-site-list span").textContent(), "www.youtube.com");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({path: path.join(screenshots, "disabled-sites-320.png"), fullPage: true});
        await page.reload();
        await page.locator('[data-remove-disabled-site="www.youtube.com"]').waitFor();
        await page.locator('[data-remove-disabled-site="www.youtube.com"]').click();
        await page.waitForFunction(() => document.querySelector("#status").textContent.includes("已自动保存"));
        await page.reload();
        await page.locator("#disabled-site-input").waitFor();
        assert.equal(await page.locator("#disabled-site-list li").count(), 0);
        await page.locator("#tab-general-settings").click();
        assert.equal(await page.locator("#fontScale").isVisible(), false);
        assert.deepEqual(errors, []);
        console.log("Refined settings browser checks passed (production bundles, mock storage, Chrome).");
    } finally {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
    }
}

main().catch((error) => {console.error(error); process.exitCode = 1;});
