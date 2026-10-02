const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const {mount, click, setValue, settle, dispatch} = require("../scripts/ui-test-helpers.cjs");

test("subtitle preferences live only on the realtime page and the save badge is absent", async (t) => {
    const page = await mount(t, "options", {hash: "#realtime-api"});
    for (const id of ["subtitleTranslationMode", "subtitleLookAheadMinutes", "llmSentenceSegmentationEnabled",
        "asrCorrectionEnabled", "showOriginalTechnicalTerms", "sourceLanguage", "targetLanguage", "fontScale", "subtitleEnabled"]) {
        assert.equal(page.field(id).closest("section").id, "realtime-api", id);
    }
    assert.equal(page.$(".save-note"), null);
    assert.equal(page.field("general-settings").querySelector("#fontScale"), null);
});

test("disabled site settings normalize domains, deduplicate, persist and delete", async (t) => {
    const page = await mount(t, "options", {hash: "#immersive-api"});
    const submit = (value) => {
        setValue(page.field("disabled-site-input"), value);
        dispatch(page.$(".disabled-site-add"), new page.window.Event("submit", {cancelable: true, bubbles: true}));
    };
    submit("https://EXAMPLE.com./guide");
    await page.save();
    assert.deepEqual(page.storage.immersiveDisabledSites, ["example.com"]);
    submit("example.com");
    await page.save();
    assert.equal(page.$("#disabled-site-list").children.length, 1);
    submit("not a domain");
    assert.match(page.field("disabled-site-error").textContent, /有效/);
    const reloaded = await mount(t, "options", {storage: page.storage, hash: "#immersive-api"});
    assert.equal(reloaded.$("#disabled-site-list span").textContent, "example.com");
    click(reloaded.$('[data-remove-disabled-site="example.com"]'));
    await reloaded.save();
    assert.deepEqual(reloaded.storage.immersiveDisabledSites, []);
});

test("settings follow sites disabled from a webpage without losing a pending draft", async (t) => {
    let changed;
    const storage = {};
    const chrome = {runtime: {}, storage: {
        local: {get(defaults, done) { done({...defaults, ...storage}); },
            set(values, done) { Object.assign(storage, values); done(); }, remove(keys, done) { done(); }},
        onChanged: {addListener(listener) { changed = listener; }, removeListener() {}}
    }};
    const page = await mount(t, "options", {chrome});
    setValue(page.field("fontScale"), "0.65");
    storage.immersiveDisabledSites = ["www.youtube.com"];
    changed({immersiveDisabledSites: {newValue: ["www.youtube.com"]}}, "local");
    await settle(page.window);
    await page.save();
    assert.equal(page.field("fontScale").value, "0.65");
    assert.deepEqual(Array.from(storage.immersiveDisabledSites), ["www.youtube.com"]);
    assert.equal(page.$("#disabled-site-list span").textContent, "www.youtube.com");
});

test("unrelated settings saves never write a stale disabled website list", async (t) => {
    const stored = {immersiveDisabledSites: []};
    const writes = [];
    const chrome = {runtime: {}, storage: {local: {
        get(defaults, done) { done({...defaults, ...stored}); },
        set(values, done) { writes.push(values); Object.assign(stored, values); done(); },
        remove(keys, done) { done(); }
    }}};
    const page = await mount(t, "options", {chrome});
    stored.immersiveDisabledSites = ["docs.example.com"];
    setValue(page.field("targetLanguage"), "zh-TW");
    await page.save();
    assert.equal(Object.hasOwn(writes[0], "immersiveDisabledSites"), false);
    assert.deepEqual(stored.immersiveDisabledSites, ["docs.example.com"]);
});

test("site hostname normalization rejects active URLs and wildcard rules", () => {
    assert.equal(Core.normalizeSiteHostname("https://Example.COM/watch?v=x"), "example.com");
    assert.equal(Core.normalizeSiteHostname("javascript:alert(1)"), "");
    assert.equal(Core.normalizeSiteHostname("*.example.com"), "");
    assert.deepEqual(Core.normalizeDisabledSites(["example.com", "EXAMPLE.com", null]), ["example.com"]);
});
