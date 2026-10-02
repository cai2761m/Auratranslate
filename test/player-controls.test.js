const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {JSDOM} = require("jsdom");
const Core = require("../src/shared.js");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, settings = {}) {
    const dom = new JSDOM('<div id="movie_player" class="html5-video-player"><video></video><div class="ytp-right-controls"><button>Settings</button></div></div>', {
        url: "https://www.youtube.com/watch?v=one", runScripts: "outside-only", pretendToBeVisual: true
    });
    t.after(() => dom.window.close());
    const win = dom.window;
    const stored = {...Core.DEFAULT_SETTINGS, ...settings};
    const listeners = [];
    const calls = [];
    win.YTBTCore = Core;
    win.chrome = {
        runtime: {
            getURL: (file) => `https://extension.invalid/${file}`,
            getManifest: () => ({version: "0.3.2"}),
            sendMessage(message, callback) {
                calls.push(message);
                callback({ok: true, videoId: message.videoId, text: message.cacheOnly ? "" : "[00:00] 视频要点"});
            }
        },
        storage: {
            local: {
                get(defaults, callback) { callback({...defaults, ...stored}); },
                set(values, callback) {
                    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {newValue: value, oldValue: stored[key]}]));
                    Object.assign(stored, values);
                    callback();
                    listeners.forEach((listener) => listener(changes, "local"));
                }
            },
            onChanged: {addListener(listener) { listeners.push(listener); }}
        }
    };
    const manifest = JSON.parse(read("manifest.json"));
    for (const file of manifest.content_scripts[0].js.filter((file) => file.startsWith("src/content-"))) {
        const source = read(file).split("// --- Bootstrap ---")[0];
        vm.runInContext(source, dom.getInternalVMContext(), {filename: file});
    }
    win.eval("state.settings = normalizeSettings({});");
    Object.assign(win.state.settings, stored);
    win.scheduleTranslations = () => {};
    win.bindStorageChanges();
    win.updatePlayerControls();
    win.ensureOverlay();
    win.state.videoId = "one";
    win.state.video = win.document.querySelector("video");
    win.state.cues = [
        {id: "0", startMs: 0, endMs: 9000, sourceText: "Hello world", translatedText: "你好世界", status: "translated"},
        {id: "1", startMs: 10000, endMs: 19000, sourceText: "Second chapter", translatedText: "第二章节", status: "translated"}
    ];
    return {win, stored, calls, $: (query) => win.document.querySelector(query)};
}

test("player button survives replacement without duplicate menus and follows external settings", async (t) => {
    const f = fixture(t);
    f.win.updatePlayerControls();
    assert.equal(f.win.document.querySelectorAll(".ytbt-player-button").length, 1);
    const replacement = f.win.document.createElement("div");
    replacement.className = "ytp-right-controls";
    f.$(".ytp-right-controls").replaceWith(replacement);
    f.win.updatePlayerControls();
    assert.equal(f.$(".ytbt-player-button").parentElement.className, "ytp-right-controls");
    await f.win.storageSet({subtitleEnabled: false});
    assert.equal(f.$('[data-setting="subtitleEnabled"]').checked, false);
    assert.equal(f.win.state.overlay.hidden, true);
    assert.equal(f.win.state.cues[0].translatedText, "你好世界");
});

test("style edits persist and immediately update the subtitle overlay", async (t) => {
    const f = fixture(t);
    f.$(".ytbt-player-button").click();
    f.$('[data-action="style"]').click();
    const scale = f.$('[data-setting="fontScale"]');
    scale.value = "1.5";
    scale.dispatchEvent(new f.win.Event("input", {bubbles: true}));
    scale.dispatchEvent(new f.win.Event("change", {bubbles: true}));
    await tick();
    assert.equal(f.stored.fontScale, 1.5);
    assert.equal(f.win.state.overlay.style.getPropertyValue("--ytbt-font-scale"), "1.5");
    await f.win.savePlayerSettings({subtitleDisplayMode: "original", subtitleColor: "#ffee00", subtitleBackgroundOpacity: 0});
    assert.equal(f.win.state.overlay.dataset.displayMode, "original");
    assert.equal(f.win.state.overlay.style.getPropertyValue("--ytbt-background-opacity"), "0");
    await f.win.handlePlayerControlAction("reset-style");
    assert.equal(f.stored.fontScale, 1);
    assert.equal(f.stored.subtitleColor, "#ffffff");
});

test("transcript searches both languages, seeks, highlights, and does not call AI", async (t) => {
    const f = fixture(t, {subtitleEnabled: false});
    await f.win.handlePlayerControlAction("transcript");
    f.win.renderPlayerTranscript();
    assert.equal(f.win.document.querySelectorAll(".ytbt-cue-row").length, 2);
    const search = f.$(".ytbt-transcript-search");
    search.value = "第二";
    search.dispatchEvent(new f.win.Event("input", {bubbles: true}));
    f.$(".ytbt-cue-row").click();
    assert.equal(f.win.state.video.currentTime, 10);
    f.win.renderPlayerTranscript();
    assert.equal(f.$(".ytbt-cue-row").getAttribute("aria-current"), "true");
    assert.equal(f.win.state.settings.subtitleEnabled, false);
    assert.deepEqual(f.calls, []);
});

test("opening summary only checks cache; explicit generation is reused on reopen", async (t) => {
    const f = fixture(t);
    await f.win.handlePlayerControlAction("summary");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].cacheOnly, true);
    await f.win.handlePlayerControlAction("generate-summary");
    await f.win.handlePlayerControlAction("close-panel");
    await f.win.handlePlayerControlAction("summary");
    assert.equal(f.calls.length, 2);
    assert.equal(f.$(".ytbt-summary-text").textContent, "[00:00] 视频要点");
});

test("navigation discards late summaries and does not render transcript text as HTML", async (t) => {
    const f = fixture(t);
    f.win.state.cues[0].sourceText = '<img src=x onerror="alert(1)">';
    await f.win.handlePlayerControlAction("transcript");
    f.win.renderPlayerTranscript();
    assert.equal(f.$(".ytbt-cue-list img"), null);
    let respond;
    f.win.chrome.runtime.sendMessage = (_message, callback) => { respond = callback; };
    const request = f.win.requestPlayerSummary(false);
    await tick();
    f.win.history.pushState({}, "", "/watch?v=two");
    f.win.state.videoId = "two";
    f.win.state.cues = [{id: "0", startMs: 0, endMs: 2000, sourceText: "New video"}];
    f.win.updatePlayerControls();
    respond({ok: true, videoId: "one", text: "Old summary"});
    await request;
    assert.equal(f.win.playerControls.data.videoId, "two");
    assert.equal(f.win.playerControls.data.summary, "");
    assert.equal(f.$(".ytbt-cue-source").textContent, "New video");
});

test("disabled subtitles retain the player response and list loading only fetches captions", async (t) => {
    const f = fixture(t, {subtitleEnabled: false});
    f.win.state.cues = [];
    await f.win.handlePlayerResponse({videoId: "one", captionTracks: [{baseUrl: "https://www.youtube.com/captions", languageCode: "en"}]});
    let reads = 0;
    f.win.fetchCaptionData = async () => { reads++; return [{startMs: 0, endMs: 1000, sourceText: "Raw transcript"}]; };
    await f.win.handlePlayerControlAction("transcript");
    assert.equal(reads, 1);
    assert.equal(f.win.playerToolCues()[0].sourceText, "Raw transcript");
    assert.equal(f.win.state.settings.subtitleEnabled, false);
    assert.deepEqual(f.calls, []);
});

test("disabled subtitles do not start caption preparation on navigation", (t) => {
    const f = fixture(t, {subtitleEnabled: false});
    f.win.state.transcript = {apiKey: "public-youtube-key"};
    let loads = 0;
    f.win.loadCaptionTrack = () => { loads++; };
    f.win.history.pushState({}, "", "/watch?v=two");
    f.win.syncVideoWithLocation();
    assert.equal(f.win.state.videoId, "two");
    assert.equal(loads, 0);
});
