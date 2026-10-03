// Render the production player modules with synthetic captions and API responses.
const {chromium} = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));

async function main() {
    const browser = await chromium.launch({channel: process.env.UI_BROWSER || "chrome", headless: true});
    const page = await browser.newPage({viewport: {width: 1280, height: 850}});
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const screenshots = path.join(root, "node_modules/.cache/ui-screenshots");
    fs.mkdirSync(screenshots, {recursive: true});
    try {
        await page.route("https://www.youtube.com/**", (route) => route.fulfill({contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"><style>
          body {margin: 0; background: #f1f1f1; font-family: Arial, sans-serif;}
          ytd-watch-flexy {display: block;}
          main {max-width: 1040px; margin: 64px auto;}
          #movie_player {position: relative; width: 100%; aspect-ratio: 16/9; background: #232326; overflow: hidden; color: white;}
          video {position: absolute; width: 100%; height: 100%;}
          .ytp-chrome-bottom {position: absolute; bottom: 0; left: 12px; right: 12px; height: 48px; border-top: 3px solid #d03035;}
          .ytp-right-controls {float: right; height: 48px; display: flex;}
          .ytp-button {height: 48px; width: 44px; line-height: 90px; border: 0; color: white; background: none; font-size: 18px; cursor: pointer;}
          .video-heading {position: absolute; top: 20px; left: 24px; font-size: 20px;}
          #native-captions {position: absolute; bottom: 96px; left: 24px; max-width: 500px; padding: 8px 12px; font-size: 18px; background: #000b; color: white;}
          #movie_player:fullscreen {width: 100vw; height: 100vh; aspect-ratio: auto;}
          @media (max-width: 600px) {main {margin: 24px auto;}}
        </style></head><body><ytd-watch-flexy><main><div id="movie_player" class="html5-video-player"><video></video><div class="video-heading">Sample video</div><div class="ytp-chrome-bottom"><span>00:10 / 12:00</span><div class="ytp-right-controls"><button class="ytp-button" aria-label="Settings">⚙</button><button class="ytp-button" id="fullscreen" aria-label="Fullscreen">⛶</button></div></div></div></main></ytd-watch-flexy></body></html>`}));
        await page.goto("https://www.youtube.com/watch?v=preview");
        const logo = fs.readFileSync(path.join(root, "icons/icon-32.png")).toString("base64");
        await page.evaluate((logo) => {
            window.stored = {subtitleEnabled: true, llmSentenceSegmentationEnabled: false, translationApiKey: "mock", translationModel: "preview-model"};
            window.messages = [];
            const listeners = [];
            window.chrome = {
                runtime: {
                    getManifest: () => ({version: "0.3.2"}),
                    getURL: () => `data:image/png;base64,${logo}`,
                    sendMessage(message, callback) {
                        window.messages.push(message);
                        setTimeout(() => callback({ok: true, videoId: message.videoId, text: message.cacheOnly ? "" : "视频概览\n这段视频介绍了浏览器扩展如何处理字幕。\n\n关键内容\n- [00:00] 获取视频字幕与时间戳。\n- [00:10] 翻译结果会保存在本地缓存。\n- [00:20] 可调整字幕样式并跳转到对应片段。\n\n结论\n字幕与总结共享已经读取的视频内容。"}), 50);
                    }
                },
                storage: {
                    local: {
                        get(defaults, callback) { callback({...defaults, ...window.stored}); },
                        set(values, callback) {
                            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {newValue: value}]));
                            Object.assign(window.stored, values); callback(); listeners.forEach((fn) => fn(changes, "local"));
                        }
                    },
                    onChanged: {addListener(fn) { listeners.push(fn); }}
                }
            };
            document.querySelector("#fullscreen").onclick = () => document.querySelector("#movie_player").requestFullscreen();
        }, logo);
        for (const file of manifest.content_scripts[0].css) await page.addStyleTag({content: read(file)});
        for (const file of manifest.content_scripts[0].js) await page.addScriptTag({content: read(file).split("// --- Bootstrap ---")[0]});
        await page.evaluate(() => {
            state.settings = normalizeSettings({...Core.DEFAULT_SETTINGS, ...window.stored});
            state.videoId = "preview";
            state.video = document.querySelector("video");
            state.cues = Array.from({length: 72}, (_, i) => ({id: String(i), startMs: i * 10000, endMs: i * 10000 + 9000,
                sourceText: i === 0 ? "Welcome to this video about browser extensions." : `Chapter ${i}: subtitles stay in sync with the video.`,
                translatedText: i === 0 ? "欢迎观看这段介绍浏览器扩展的视频。" : `第 ${i} 节：字幕会与视频保持同步。`, status: "translated"}));
            scheduleTranslations = () => {};
            bindStorageChanges();
            const captions = document.createElement("div");
            captions.id = "native-captions";
            captions.className = "ytp-caption-window-container";
            captions.style.opacity = "0.8";
            captions.textContent = "Original YouTube captions remain available.";
            document.querySelector("#movie_player").appendChild(captions);
            const cc = document.createElement("button");
            cc.className = "ytp-button ytp-subtitles-button";
            cc.textContent = "CC";
            cc.setAttribute("aria-label", "YouTube captions");
            cc.setAttribute("aria-pressed", "true");
            cc.onclick = () => {
                const enabled = cc.getAttribute("aria-pressed") !== "true";
                cc.setAttribute("aria-pressed", String(enabled));
                captions.style.display = enabled ? "block" : "none";
            };
            document.querySelector(".ytp-right-controls").prepend(cc);
            startNativeCaptionBlocker();
            startPlayerControls();
            ensureOverlay();
            updateOverlay();
            setInterval(updateOverlay, 250);
        });
        const button = page.locator(".ytbt-player-button");
        const aligned = await button.evaluate((el) => {
            const button = el.getBoundingClientRect(), image = el.querySelector("img").getBoundingClientRect();
            return Math.abs(button.x + button.width / 2 - image.x - image.width / 2) < 1 &&
                Math.abs(button.y + button.height / 2 - image.y - image.height / 2) < 1;
        });
        assert.equal(aligned, true, "logo ignores the native toolbar text baseline");
        await button.click();
        assert.equal(await page.locator(".ytbt-player-menu header, .ytbt-player-menu [data-action='close-menu']").count(), 0);
        assert.equal(await page.locator(".ytbt-player-ui").getAttribute("data-theme"), "light");
        await page.screenshot({path: path.join(screenshots, "player-menu.png")});
        await page.evaluate(() => {
            document.documentElement.setAttribute("dark", "");
            document.body.style.background = "#0f0f0f";
        });
        await page.waitForFunction(() => document.querySelector(".ytbt-player-ui").dataset.theme === "dark");
        assert.equal(await page.locator(".ytbt-player-menu").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(32, 32, 34)");
        await page.screenshot({path: path.join(screenshots, "player-menu-dark.png")});
        assert.equal(await page.locator("#native-captions").isVisible(), false);
        await page.evaluate(() => {
            window.reusedNativeCaptions = document.querySelector("#native-captions");
            reusedNativeCaptions.remove();
        });
        await page.locator('[data-setting="subtitleEnabled"]').uncheck();
        await page.waitForFunction(() => window.stored.subtitleEnabled === false && state.overlay.hidden);
        await page.evaluate(() => document.querySelector("#movie_player").appendChild(reusedNativeCaptions));
        await page.locator("#native-captions").waitFor({state: "visible"});
        assert.equal(await page.locator("#native-captions").getAttribute("data-ytbt-native-caption-hidden"), null);
        assert.equal(await page.locator("#native-captions").evaluate((el) => getComputedStyle(el).opacity), "0.8");
        assert.equal(await page.locator(".ytp-subtitles-button").getAttribute("aria-pressed"), "true");
        await page.screenshot({path: path.join(screenshots, "player-native-captions-restored.png")});
        await page.locator(".ytp-subtitles-button").click();
        assert.equal(await page.locator("#native-captions").isVisible(), false);
        await page.locator(".ytp-subtitles-button").click();
        assert.equal(await page.locator("#native-captions").isVisible(), true);
        await button.click();
        await page.locator('[data-setting="subtitleEnabled"]').check();
        assert.equal(await page.locator("#native-captions").isVisible(), false);
        assert.equal(await page.locator(".ytp-subtitles-button").getAttribute("aria-pressed"), "true");
        await page.locator('[data-action="style"]').click();
        await page.locator('[data-setting="fontScale"]').fill("1.25");
        await page.locator('[data-setting="fontScale"]').dispatchEvent("change");
        await page.locator('[data-setting="subtitleDisplayMode"]').selectOption("translation");
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".ytbt-en")).display === "none");
        await page.screenshot({path: path.join(screenshots, "player-style.png")});
        await page.locator('[data-action="reset-style"]').click();
        await page.locator('[data-action="back"]').click();
        const desktopLayout = await playerLayout(page);
        await page.locator('.ytbt-menu-main [data-action="transcript"]').click();
        await page.locator(".ytbt-cue-row").first().waitFor();
        assert.deepEqual(await playerLayout(page), desktopLayout, "opening a floating list leaves the page and video unchanged");
        await page.locator(".ytbt-transcript-search").fill("第 2 节");
        assert.equal(await page.locator(".ytbt-cue-row").count(), 1);
        await page.locator(".ytbt-cue-row").click();
        assert.equal(await page.evaluate(() => state.video.currentTime), 20);
        await page.locator(".ytbt-transcript-search").fill("");
        await assertContained(page);
        await page.screenshot({path: path.join(screenshots, "player-transcript.png")});
        const before = await page.locator(".ytbt-tools-panel").boundingBox();
        await page.mouse.move(before.x + 50, before.y + 2);
        await page.mouse.down();
        await page.mouse.move(before.x - 120, before.y + 55, {steps: 8});
        await page.mouse.up();
        assert.ok((await page.locator(".ytbt-tools-panel").boundingBox()).x < before.x - 50);
        await page.locator('.ytbt-panel-tabs [data-action="summary"]').click();
        await page.waitForFunction(() => !playerControls.data.summarizing);
        assert.equal(await page.evaluate(() => messages.filter((m) => !m.cacheOnly).length), 0);
        await page.locator('[data-action="generate-summary"]').click();
        await page.waitForFunction(() => playerControls.data.summary.length > 0);
        await page.screenshot({path: path.join(screenshots, "player-summary.png")});
        await page.locator('[data-action="close-panel"]').click();
        assert.deepEqual(await playerLayout(page), desktopLayout, "closing the panel does not reflow the page");
        await page.locator("#fullscreen").click();
        await page.waitForFunction(() => document.fullscreenElement);
        const fullscreenLayout = await playerLayout(page);
        await button.click();
        await page.locator('.ytbt-menu-main [data-action="transcript"]').click();
        await assertContained(page);
        assert.deepEqual(await playerLayout(page), fullscreenLayout, "floating panels never shrink fullscreen video");
        const alignedCaptions = await page.locator(".ytbt-overlay").evaluate((el) => {
            const r = el.getBoundingClientRect(), v = document.querySelector("video").getBoundingClientRect();
            return Math.abs(r.x + r.width / 2 - v.x - v.width / 2) < 1 && r.right <= v.right;
        });
        assert.equal(alignedCaptions, true, "fullscreen subtitles stay centered within the full video");
        await page.screenshot({path: path.join(screenshots, "player-fullscreen.png")});
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement);
        for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
            await page.setViewportSize(viewport);
            await page.waitForTimeout(300);
            await page.locator('[data-action="close-panel"]').click();
            const layout = await playerLayout(page);
            await page.evaluate(() => handlePlayerControlAction("transcript"));
            await assertContained(page);
            assert.deepEqual(await playerLayout(page), layout, "mobile panels do not add page space or resize video");
            await page.screenshot({path: path.join(screenshots, `player-${viewport.width}.png`)});
        }
        await page.setViewportSize({width: 1280, height: 850});
        await page.evaluate(() => {
            const controls = document.querySelector(".ytp-right-controls");
            controls.replaceWith(controls.cloneNode(false));
            updatePlayerControls();
            updateNativeCaptionBlocking(true);
        });
        assert.equal(await page.locator(".ytbt-player-button").count(), 1);
        assert.equal(await page.locator('.ytbt-player-ui [data-ytbt-native-caption-hidden="true"]').count(), 0);
        assert.deepEqual(errors, []);
        console.log(`Player browser checks passed; screenshots: ${screenshots}`);
    } finally { await browser.close(); }
}

async function playerLayout(page) {
    return page.evaluate(() => {
        const bounds = (selector) => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        };
        return {watch: bounds("ytd-watch-flexy"), player: bounds("#movie_player"), video: bounds("video"),
            scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight};
    });
}

async function assertContained(page) {
    const bounds = await page.evaluate(() => {
        const panel = document.querySelector(".ytbt-tools-panel");
        const r = panel.getBoundingClientRect();
        return {floating: getComputedStyle(panel).position === "fixed", horizontalFit: r.left >= 0 && r.right <= window.innerWidth,
            viewportFit: r.top >= 0 && r.bottom <= window.innerHeight + 1,
            overflow: panel.scrollWidth > panel.clientWidth + 1, listHeight: document.querySelector(".ytbt-cue-list").clientHeight};
    });
    assert.equal(bounds.floating, true, JSON.stringify(bounds));
    assert.equal(bounds.horizontalFit, true, JSON.stringify(bounds));
    assert.equal(bounds.viewportFit, true, JSON.stringify(bounds));
    assert.equal(bounds.overflow, false, JSON.stringify(bounds));
    assert.ok(bounds.listHeight >= 180, `transcript needs readable scroll space: ${JSON.stringify(bounds)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
