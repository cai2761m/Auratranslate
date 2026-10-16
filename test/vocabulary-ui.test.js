const test = require("node:test");
const assert = require("node:assert/strict");
const {mount, click, setValue, settle, dispatch} = require("../scripts/ui-test-helpers.cjs");
const {vocabularyFixture, word} = require("../scripts/vocabulary-test-helpers.cjs");
const Core = require("../src/shared.js");
const waitFor = async predicate => {
    for (let count = 0; count < 100; count++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(predicate());
};
async function open(t, words = []) {
    const f = vocabularyFixture();
    for (const entry of words) await f.send({type: "VOCABULARY", action: "add", entry});
    const ui = await mount(t, "options", {chrome: f.chrome, hash: "#vocabulary"});
    await waitFor(() => !ui.$(".vocabulary-status").textContent.includes("正在读取"));
    return {...f, ...ui};
}

test("notebook searches, filters, marks words learned, deletes and undoes deletion", async t => {
    const f = await open(t, [word(), word("river", "河流")]);
    assert.equal(f.document.title, "生词本 · AuraTranslate 设置");
    assert.equal(f.document.querySelectorAll(".vocabulary-entry").length, 2);
    setValue(f.field("vocabulary-search"), "银行");
    assert.equal(f.document.querySelectorAll(".vocabulary-entry").length, 1);
    click(f.$(".vocabulary-entry-actions .secondary"));
    await waitFor(() => f.$(".vocabulary-badge").textContent === "已掌握");
    setValue(f.field("vocabulary-filter"), "learning");
    assert.equal(f.document.querySelectorAll(".vocabulary-entry").length, 0);
    setValue(f.field("vocabulary-filter"), "learned");
    assert.equal(f.document.querySelectorAll(".vocabulary-entry").length, 1);
    click(f.$(".vocabulary-delete"));
    await waitFor(() => f.$(".vocabulary-status").textContent.includes("撤销删除"));
    assert.equal((await f.send({type: "VOCABULARY", action: "list"})).entries.length, 1);
    click(f.$(".vocabulary-status .link-button"));
    await waitFor(() => f.$(".vocabulary-status").textContent.includes("已恢复"));
    assert.equal((await f.send({type: "VOCABULARY", action: "list"})).entries.find(entry => entry.sourceText === "bank").learned, true);
});

test("notes persist and a save from another tab refreshes an open notebook", async t => {
    const f = await open(t, [word()]);
    const textarea = f.$("textarea");
    const setter = Object.getOwnPropertyDescriptor(f.window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(textarea, "账户相关语境");
    dispatch(textarea, new f.window.Event("input", {bubbles: true}));
    click(f.$(".vocabulary-context button"));
    await waitFor(() => f.$(".vocabulary-status").textContent.includes("笔记已保存"));
    assert.equal((await f.send({type: "VOCABULARY", action: "list"})).entries[0].notes, "账户相关语境");
    await f.send({type: "VOCABULARY", action: "add", entry: word("another", "另一个")});
    await waitFor(() => f.document.querySelectorAll(".vocabulary-entry").length === 2);
});

test("JSON exports the complete book with metadata, and CSV escapes quotes and spreadsheet formulas", async t => {
    const f = await open(t, [word(), word('=HYPERLINK("x")', '引号 "与逗号,')]);
    const blobs = [], downloads = [];
    f.window.Blob = globalThis.Blob;
    f.window.URL.createObjectURL = blob => {blobs.push(blob); return "blob:test";};
    f.window.URL.revokeObjectURL = () => {};
    f.window.HTMLAnchorElement.prototype.click = function () {downloads.push(this.download);};
    setValue(f.field("vocabulary-search"), "bank");
    click(f.field("vocabulary-export-json"));
    await waitFor(() => downloads.length === 1);
    const book = JSON.parse(await blobs[0].text());
    assert.equal(book.entries.length, 2, "export includes entries hidden by the search filter");
    assert.equal(book.entries[0].contextText, word().contextText);
    assert.equal(book.format, "auratranslate-vocabulary");
    await settle(f.window);
    click(f.field("vocabulary-export-csv"));
    await waitFor(() => downloads.length === 2);
    const csv = await blobs[1].text();
    assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
    assert.match(csv, /"引号 ""与逗号,"/);
    assert.ok(downloads[0].endsWith(".json"));
    assert.ok(downloads[1].endsWith(".csv"));
});

test("JSON file import merges, malformed files show errors, and cache clearing keeps words", async t => {
    const f = await open(t, [word()]);
    const input = f.field("vocabulary-import-file");
    const file = {size: 100, text: async () => JSON.stringify({version: 1, entries: [word(), word("new", "新词")]})};
    Object.defineProperty(input, "files", {configurable: true, value: [file]});
    dispatch(input, new f.window.Event("change", {bubbles: true}));
    await waitFor(() => f.$(".vocabulary-status").textContent.includes("已导入 1 条"));
    assert.equal(f.document.querySelectorAll(".vocabulary-entry").length, 2);
    Object.defineProperty(input, "files", {configurable: true, value: [{size: 3, text: async () => "bad"}]});
    dispatch(input, new f.window.Event("change", {bubbles: true}));
    await waitFor(() => f.$(".vocabulary-status").getAttribute("data-error") === "true");
    f.data["ytbt:selection:old"] = {items: {one: {translatedText: "缓存"}}};
    click(f.field("tab-general-settings"));
    click(f.field("clear-cache"));
    await waitFor(() => !f.data["ytbt:selection:old"]);
    assert.equal(f.data[Core.VOCABULARY_STORAGE_KEY].entries.length, 2);
});

test("selection toggle saves and source strings cannot inject notebook markup", async t => {
    const f = await open(t, [word("<img onerror=alert(1)>", "<script>alert(1)</script>", {sourceUrl: "javascript:alert(1)"})]);
    assert.equal(f.$(".vocabulary-entry img"), null);
    assert.equal(f.$(".vocabulary-entry a"), null);
    assert.match(f.$(".vocabulary-entry h3").textContent, /<img/);
    click(f.field("tab-selection-settings"));
    setValue(f.field("selectionTranslationEnabled"), false);
    await f.save();
    assert.equal(f.data.selectionTranslationEnabled, false);
});

test("selection toolbar edits persist across reload, reorder the preview and reset without changing the book", async t => {
    const f = await open(t, [word()]);
    click(f.field("tab-selection-settings"));
    assert.equal(f.field("selection-action-translate").disabled, true);
    setValue(f.field("selection-action-copy"), true);
    setValue(f.field("selection-action-vocabulary"), true);
    click(f.$('[aria-label="上移复制"]'));
    setValue(f.field("selection-toolbar-size"), "comfortable");
    setValue(f.field("selection-toolbar-position"), "above");
    setValue(f.field("selection-toolbar-labels"), true);
    await f.save();
    await waitFor(() => f.data.selectionToolbar?.showLabels === true);
    assert.deepEqual(f.data.selectionToolbar, {actions: ["copy", "translate", "vocabulary"], size: "comfortable", position: "above", showLabels: true});
    assert.equal(f.$(".selection-preview .selection-toolbar").textContent, "复制翻译生词本");
    assert.equal(f.$(".selection-preview").dataset.position, "above");
    assert.equal(f.requests.length, 0, "preview never requests a translation");
    const reloaded = await mount(t, "options", {chrome: f.chrome, hash: "#selection-settings"});
    assert.equal(reloaded.field("selection-toolbar-size").value, "comfortable");
    assert.equal(reloaded.field("selection-toolbar-labels").checked, true);
    assert.equal(reloaded.$(".selection-preview .selection-toolbar").textContent, "复制翻译生词本");
    setValue(reloaded.field("selection-action-copy"), false);
    await reloaded.save();
    await waitFor(() => f.data.selectionToolbar.actions.length === 2);
    assert.deepEqual(f.data.selectionToolbar.actions, ["translate", "vocabulary"]);
    click(reloaded.field("selection-toolbar-reset"));
    await reloaded.save();
    await waitFor(() => f.data.selectionToolbar.actions.length === 1);
    assert.deepEqual(f.data.selectionToolbar, Core.DEFAULT_SETTINGS.selectionToolbar);
    assert.equal(f.data.auraVocabulary.entries.length, 1);
    assert.equal(reloaded.field("selectionTranslationEnabled").checked, true);
});
