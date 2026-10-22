const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {JSDOM} = require("jsdom");
const {source} = require("../scripts/extension-scripts.cjs");
const {vocabularyFixture} = require("../scripts/vocabulary-test-helpers.cjs");
const Core = require("../src/shared.js");
const script = fs.readFileSync(path.resolve(__dirname, "../src/selection.js"), "utf8");const waitFor = async predicate => {
    for (let count = 0; count < 150; count++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(predicate(), "expected selection state did not arrive");
};

async function page(t, storage = {}) {
    const f = vocabularyFixture({storage});
    const dom = new JSDOM(`<title>Reading guide</title><main><p id="finance">The bank offers savings accounts.</p><p id="river">We sat on the river bank.</p><p id="html">Literal &lt;img src=x onerror=alert(1)&gt; code.</p><div contenteditable="true" id="editor">private writing</div><input type="password" value="secret"></main>`,
        {url: "https://example.org/read", pretendToBeVisual: true, runScripts: "outside-only"});
    const {window} = dom;
    window.chrome = f.chrome;
    window.Range.prototype.getBoundingClientRect = () => ({top: 60, bottom: 80, left: 20, right: 200, width: 180, height: 20});
    window.eval(source("shared"));
    window.eval(source("content-ui"));
    window.eval(script);
    t.after(() => window.close());
    await waitFor(() => window.YTBTSelection.state.ready);
    return {...f, window, document: window.document,
        shadow: () => window.document.querySelector("[data-ytbt-selection-root]")?.shadowRoot,
        select(id, text) {
            const node = window.document.getElementById(id).firstChild;
            const start = node.textContent.indexOf(text);
            assert.ok(start >= 0);
            const range = window.document.createRange();
            range.setStart(node, start); range.setEnd(node, start + text.length);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            window.document.dispatchEvent(new window.Event("selectionchange"));
        },
    };
}

test("selection waits for a click, translates with context, saves and opens the vocabulary book", async t => {
    const f = await page(t);
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    assert.equal(f.requests.length, 0);
    assert.equal(f.messages.length, 0);
    f.shadow().querySelector(".selection-trigger").click();
    await waitFor(() => f.shadow()?.querySelector(".translation")?.textContent === "银行");
    assert.equal(f.requests.length, 1);
    assert.equal(f.shadow().querySelector(".selection-card").getAttribute("aria-label"), "划词翻译");
    assert.equal(f.shadow().querySelector(".selection-card header").textContent, "×");
    f.shadow().querySelector(".save").click();
    f.shadow().querySelector(".save").click();
    await waitFor(() => f.shadow()?.querySelector(".save")?.textContent === "已收藏");
    const saved = (await f.send({type: "VOCABULARY", action: "list"})).entries[0];
    assert.equal(saved.sourceText, "bank");
    assert.equal(saved.translatedText, "银行");
    assert.equal(saved.contextText, "The bank offers savings accounts.");
    assert.equal(saved.sourceUrl, "https://example.org/read");
    assert.equal(f.messages.filter(message => message.type === "VOCABULARY" && message.action === "add").length, 1);
    f.shadow().querySelector(".book").click();
    await waitFor(() => f.opened.length === 1);
    assert.ok(f.opened[0].url.endsWith("options/options.html#vocabulary"));
});

test("a newer selection and dismissal invalidate late translation results", async t => {
    const f = await page(t);
    const pending = [];
    f.chrome.runtime.sendMessage = (message, done) => pending.push({message, done});
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    f.shadow().querySelector(".selection-trigger").click();
    f.select("river", "bank");
    await waitFor(() => f.window.YTBTSelection.state.selection.contextText.includes("river"));
    pending[0].done({ok: true, translatedText: "银行"});
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(f.shadow().querySelector(".selection-trigger"));
    assert.equal(f.shadow().querySelector(".translation"), null);
    f.shadow().querySelector(".selection-trigger").click();
    f.window.YTBTSelection.dismiss();
    pending[1].done({ok: true, translatedText: "河岸"});
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.shadow(), undefined);
});

test("disabled mode, editable fields and oversized text never show a translation control", async t => {
    const f = await page(t, {selectionTranslationEnabled: false});
    f.select("finance", "bank");
    await new Promise(resolve => setTimeout(resolve, 210));
    assert.equal(f.shadow(), undefined);
    await new Promise(resolve => f.chrome.storage.local.set({selectionTranslationEnabled: true}, resolve));
    f.select("editor", "private");
    await new Promise(resolve => setTimeout(resolve, 210));
    assert.equal(f.shadow(), undefined);
    f.document.getElementById("finance").textContent = "x".repeat(3001);
    f.select("finance", "x".repeat(3001));
    await new Promise(resolve => setTimeout(resolve, 210));
    assert.equal(f.shadow(), undefined);
    assert.equal(f.requests.length, 0);
});

test("failure is visible and explicit retry succeeds; settings disable closes the card immediately", async t => {
    const f = await page(t);
    const original = f.chrome.runtime.sendMessage;
    let failed = false;
    f.chrome.runtime.sendMessage = (message, done) => {
        if (!failed && message.type === "SELECTION_TRANSLATE") {failed = true; done({ok: false, error: "API Key is not configured"});}
        else original(message, done);
    };
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    f.shadow().querySelector(".selection-trigger").click();
    await waitFor(() => f.shadow()?.querySelector(".error"));
    assert.match(f.shadow().querySelector(".error").textContent, /API Key/);
    assert.equal(f.requests.length, 0);
    f.shadow().querySelector(".retry").click();
    await waitFor(() => f.shadow()?.querySelector(".translation")?.textContent === "银行");
    await new Promise(resolve => f.chrome.storage.local.set({selectionTranslationEnabled: false}, resolve));
    assert.equal(f.shadow(), undefined);
});

test("literal source text is displayed as text and repeated injection installs one controller", async t => {
    const f = await page(t);
    const controller = f.window.YTBTSelection;
    f.window.eval(script);
    assert.equal(f.window.YTBTSelection, controller);
    f.select("html", "<img src=x onerror=alert(1)>");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    f.shadow().querySelector(".selection-trigger").click();
    await waitFor(() => f.shadow()?.querySelector(".save"));
    assert.equal(f.shadow().querySelector(".source").textContent, "<img src=x onerror=alert(1)>");
    assert.equal(f.shadow().querySelector("img"), null);
    assert.equal(f.document.querySelectorAll("[data-ytbt-selection-root]").length, 1);
});

test("toolbar settings reject unknown actions and keep a translation entry without mutating defaults", () => {
    assert.deepEqual(Core.normalizeSelectionToolbar({actions: ["copy", "copy", "unknown"], size: "huge", showLabels: "yes", position: "left"}),
        {actions: ["translate", "copy"], size: "compact", showLabels: false, position: "below"});
    const value = Core.normalizeSelectionToolbar();
    value.actions.push("copy");
    assert.deepEqual(Core.normalizeSelectionToolbar().actions, ["translate"]);
    assert.deepEqual(Core.normalizeSelectionToolbar(null), Core.DEFAULT_SETTINGS.selectionToolbar);
});

test("toolbar actions, order and labels update on an already selected word without a provider call", async t => {
    const f = await page(t);
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    assert.equal(f.shadow().querySelectorAll(".selection-tool").length, 1);
    assert.equal(f.shadow().querySelector(".selection-trigger").textContent, "");
    assert.ok(f.shadow().querySelector(".selection-trigger svg"));
    await new Promise(resolve => f.chrome.storage.local.set({selectionToolbar: {
        actions: ["copy", "translate", "vocabulary", "dismiss"], size: "regular", showLabels: true, position: "above",
    }}, resolve));
    const toolbar = f.shadow().querySelector('[role="toolbar"]');
    assert.equal(toolbar.dataset.size, "regular");
    assert.deepEqual([...toolbar.querySelectorAll("button")].map(button => button.textContent), ["复制", "翻译", "生词本", "关闭"]);
    assert.ok(parseFloat(f.window.YTBTSelection.state.host.style.top) < 60, "toolbar prefers the space above the selection");
    const buttons = [...toolbar.querySelectorAll("button")];
    buttons[0].focus();
    buttons[0].dispatchEvent(new f.window.KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}));
    assert.equal(f.shadow().activeElement, buttons[1]);
    assert.equal(f.requests.length, 0);
    assert.equal(f.messages.length, 0);
    buttons[2].click();
    await waitFor(() => f.opened.length === 1);
    assert.equal(f.requests.length, 0, "opening the notebook does not translate the selection");
    buttons[3].click();
    assert.equal(f.shadow(), undefined);
});

test("copy succeeds locally, reports permission failure and ignores stale completions", async t => {
    const f = await page(t, {selectionToolbar: {actions: ["translate", "copy"]}});
    const copied = [];
    Object.defineProperty(f.window.navigator, "clipboard", {value: {writeText: async text => copied.push(text)}, configurable: true});
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector('[data-action="copy"]'));
    f.shadow().querySelector('[data-action="copy"]').click();
    await waitFor(() => f.shadow()?.querySelector('[data-copied="true"]'));
    assert.deepEqual(copied, ["bank"]);
    assert.equal(f.window.getSelection().toString(), "bank");
    f.window.navigator.clipboard.writeText = async () => {throw new Error("NotAllowedError");};
    f.shadow().querySelector('[data-action="copy"]').click();
    await waitFor(() => f.shadow()?.querySelector(".toolbar-feedback"));
    assert.match(f.shadow().querySelector(".toolbar-feedback").textContent, /无法复制/);
    assert.equal(f.shadow().querySelector(".selection-card"), null);
    let finish;
    f.window.navigator.clipboard.writeText = () => new Promise(resolve => {finish = resolve;});
    f.shadow().querySelector('[data-action="copy"]').click();
    f.select("river", "bank");
    await waitFor(() => f.window.YTBTSelection.state.selection.contextText.includes("river"));
    finish();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.shadow().querySelector('[data-copied="true"]'), null);
    assert.equal(f.requests.length, 0);
    assert.equal(f.messages.length, 0);
});

test("copy fallback preserves the selected text and reports unavailable copy without translating", async t => {
    const f = await page(t, {selectionToolbar: {actions: ["translate", "copy"]}});
    let copied = "";
    f.document.execCommand = command => {
        assert.equal(command, "copy");
        copied = f.shadow().querySelector("textarea").value;
        return true;
    };
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector('[data-action="copy"]'));
    f.shadow().querySelector('[data-action="copy"]').click();
    await waitFor(() => f.shadow()?.querySelector('[data-copied="true"]'));
    assert.equal(copied, "bank");
    assert.equal(f.window.getSelection().toString(), "bank");
    assert.equal(f.shadow().querySelector("textarea"), null);
    f.document.execCommand = () => false;
    f.shadow().querySelector('[data-action="copy"]').click();
    assert.match(f.shadow().querySelector(".toolbar-feedback").textContent, /无法复制/);
    assert.equal(f.window.getSelection().toString(), "bank");
    assert.equal(f.requests.length, 0);
});

test("copy keeps the original whitespace while translation receives normalized text", async t => {
    const f = await page(t, {selectionToolbar: {actions: ["translate", "copy"]}});
    f.document.getElementById("finance").textContent = "The bank\n  offers savings accounts.";
    let copied;
    Object.defineProperty(f.window.navigator, "clipboard", {value: {writeText: async text => {copied = text;}}});
    f.select("finance", "bank\n  offers");
    await waitFor(() => f.shadow()?.querySelector('[data-action="copy"]'));
    f.shadow().querySelector('[data-action="copy"]').click();
    await waitFor(() => f.shadow()?.querySelector('[data-copied="true"]'));
    assert.equal(copied, "bank\n  offers");
    f.shadow().querySelector(".selection-trigger").click();
    await waitFor(() => f.shadow()?.querySelector(".save"));
    const message = f.messages.find(message => message.type === "SELECTION_TRANSLATE");
    assert.equal(message.sourceText, "bank offers");
    assert.equal(message.originalText, undefined);
});

test("toolbar settings preserve pending and completed translations and reset immediately on removal", async t => {
    const f = await page(t);
    let finish;
    f.chrome.runtime.sendMessage = (_, done) => {finish = done;};
    f.select("finance", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    f.shadow().querySelector(".selection-trigger").click();
    await new Promise(resolve => f.chrome.storage.local.set({selectionToolbar: {actions: ["copy", "translate"], position: "above"}}, resolve));
    assert.equal(f.shadow().querySelector(".translation").textContent, "正在翻译…");
    assert.equal(f.shadow().querySelector(".selection-toolbar"), null);
    finish({ok: true, translatedText: "银行"});
    await waitFor(() => f.shadow()?.querySelector(".translation").textContent === "银行");
    await new Promise(resolve => f.chrome.storage.local.set({selectionToolbar: null}, resolve));
    assert.equal(f.shadow().querySelector(".translation").textContent, "银行");
    f.window.YTBTSelection.dismiss();
    f.select("river", "bank");
    await waitFor(() => f.shadow()?.querySelector(".selection-trigger"));
    assert.equal(f.shadow().querySelectorAll(".selection-tool").length, 1);
});
