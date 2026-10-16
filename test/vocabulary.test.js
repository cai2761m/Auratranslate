const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const {vocabularyFixture, word} = require("../scripts/vocabulary-test-helpers.cjs");
const call = (fixture, action, extra = {}) => fixture.send({type: "VOCABULARY", action, ...extra});

for (const mode of ["worker", "event-page"]) test(`${mode}: simultaneous saves deduplicate matching meanings and survive restart`, async () => {
    const f = vocabularyFixture({mode});
    const results = await Promise.all([
        call(f, "add", {entry: word()}), call(f, "add", {entry: word(" BANK ", "银行")}),
        call(f, "add", {entry: word("bank", "河岸", {contextText: "We sat on the river bank."})}),
        ...Array.from({length: 8}, (_, index) => call(f, "add", {entry: word(`term-${index}`, `释义-${index}`)})),
    ]);
    assert.ok(results.every(result => result.ok));
    assert.equal(results.filter(result => result.duplicate).length, 1);
    f.restart();
    const saved = await call(f, "list");
    assert.equal(saved.entries.length, 10);
    assert.equal(new Set(saved.entries.map(entry => entry.id)).size, 10);
    assert.equal(saved.entries[0].contextText, word().contextText);
    assert.equal(saved.entries[0].sourceUrl, word().sourceUrl);
    assert.equal(f.requests.length, 0, "vocabulary operations do not call translation providers");
});

test("notes and learned status persist; removal and merged backup restore keep original metadata", async () => {
    const f = vocabularyFixture();
    const {entry} = await call(f, "add", {entry: word()});
    await call(f, "update", {id: entry.id, patch: {learned: true, notes: "金融语境", sourceText: "unwanted edit"}});
    const backup = await call(f, "list");
    assert.equal(backup.entries[0].sourceText, "bank");
    assert.equal(backup.entries[0].learned, true);
    await call(f, "remove", {id: entry.id});
    assert.equal((await call(f, "list")).entries.length, 0);
    assert.equal((await call(f, "import", {book: backup})).imported, 1);
    const restored = (await call(f, "list")).entries[0];
    assert.equal(restored.id, entry.id);
    assert.equal(restored.createdAt, entry.createdAt);
    assert.equal(restored.notes, "金融语境");
    assert.equal(restored.learned, true);
    assert.equal((await call(f, "import", {book: backup})).skipped, 1);
});

test("invalid imports and storage failures are atomic and do not poison the write queue", async () => {
    const f = vocabularyFixture();
    await call(f, "add", {entry: word()});
    assert.equal((await call(f, "import", {book: {version: 1, entries: [word("new", "新"), {sourceText: "bad"}]}})).ok, false);
    assert.equal((await call(f, "import", {book: {version: 2, entries: []}})).ok, false);
    assert.equal((await call(f, "list")).entries.length, 1);
    f.hooks.failWrite = true;
    assert.match((await call(f, "add", {entry: word("lost", "未保存")})).error, /quota/);
    f.hooks.failWrite = false;
    assert.equal((await call(f, "add", {entry: word("after", "之后")})).ok, true);
    assert.deepEqual((await call(f, "list")).entries.map(entry => entry.sourceText), ["bank", "after"]);
});

test("imports do not overwrite saved senses or learning progress, and ID collisions get new IDs", async () => {
    const f = vocabularyFixture();
    const saved = (await call(f, "add", {entry: word()})).entry;
    await call(f, "update", {id: saved.id, patch: {learned: true}});
    const result = await call(f, "import", {book: {version: 1, entries: [saved, {...word("bank", "河岸"), id: saved.id}]}});
    assert.equal(result.imported, 1);
    const entries = (await call(f, "list")).entries;
    assert.equal(entries[0].learned, true);
    assert.notEqual(entries[0].id, entries[1].id);
});

test("unsafe source links are removed and corrupt local data is never overwritten", async () => {
    const f = vocabularyFixture();
    const entry = (await call(f, "add", {entry: word("literal <img>", "<script>alert(1)</script>", {sourceUrl: "javascript:alert(1)"})})).entry;
    assert.equal(entry.sourceUrl, "");
    assert.equal(entry.sourceText, "literal <img>");
    assert.equal(Core.vocabularySourceUrl("https://user:password@example.org/path"), "https://example.org/path");
    f.data[Core.VOCABULARY_STORAGE_KEY] = {version: 3, entries: []};
    assert.equal((await call(f, "add", {entry: word()})).ok, false);
    assert.equal(f.data[Core.VOCABULARY_STORAGE_KEY].version, 3);
});

test("clearing and evicting translation caches preserves the vocabulary book", async () => {
    const f = vocabularyFixture({storage: {translationCacheMaxItems: 1}});
    await call(f, "add", {entry: word()});
    await f.send({type: "SELECTION_TRANSLATE", sourceText: "first", contextText: "One", sourceUrl: "https://example.org/1"});
    await f.send({type: "SELECTION_TRANSLATE", sourceText: "second", contextText: "Two", sourceUrl: "https://example.org/2"});
    for (const key of Object.keys(f.data).filter(key => key.startsWith("ytbt:"))) delete f.data[key];
    assert.equal((await call(f, "list")).entries.length, 1);
});

for (const protocol of ["openai-compatible", "openai-responses", "anthropic", "gemini"]) test(`${protocol}: selected text uses local context, one request, and an independent cache`, async () => {
    const f = vocabularyFixture({protocol});
    const message = {type: "SELECTION_TRANSLATE", sourceText: "bank", sourceUrl: "https://example.org/guide", contextText: "We sat on the river bank.", sourceTitle: "Rivers"};
    const river = await f.send(message);
    assert.equal(river.translatedText, "河岸");
    assert.equal(river.targetLanguage, "zh-CN");
    assert.equal(river.contextText, message.contextText);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].input.items[0].context, `Rivers\n${message.contextText}`);
    assert.equal((await f.send(message)).cached, true);
    assert.equal(f.requests.length, 1);
    assert.equal((await f.send({...message, contextText: "The bank offers accounts."})).translatedText, "银行");
    assert.equal(f.requests.length, 2);
    assert.ok(Object.keys(f.data).some(key => key.startsWith("ytbt:selection:")));
});

test("selection preserves literal code and never requests empty/oversized selections", async () => {
    const f = vocabularyFixture();
    assert.equal((await f.send({type: "SELECTION_TRANSLATE", sourceText: ""})).ok, false);
    assert.equal((await f.send({type: "SELECTION_TRANSLATE", sourceText: "x".repeat(Core.SELECTION_MAX_CHARS + 1)})).ok, false);
    const response = await f.send({type: "SELECTION_TRANSLATE", sourceText: "List<T> &amp; value", sourceUrl: "https://example.org/code"});
    assert.equal(f.requests[0].input.items[0].text, "List<T> &amp; value");
    assert.equal(response.translatedText, "译文 List<T> &amp; value");
    assert.equal(f.requests.length, 1);
});

test("Google selection works without AI credentials and reuses its own cached result", async () => {
    const f = vocabularyFixture({storage: {translationServices: [], immersiveTranslationService: "google-free"},
        fetch: async () => ({ok: true, text: async () => JSON.stringify([[["银行", "bank"]]])})});
    const message = {type: "SELECTION_TRANSLATE", sourceText: "bank", sourceUrl: "https://example.org/read"};
    assert.equal((await f.send(message)).translatedText, "银行");
    assert.match(f.requests[0].url, /^https:\/\/translate.googleapis.com\//);
    assert.equal((await f.send(message)).cached, true);
    assert.equal(f.requests.length, 1);
});

test("an import exceeding notebook capacity leaves the original entries intact", async () => {
    const f = vocabularyFixture();
    await call(f, "add", {entry: word()});
    const entries = Array.from({length: Core.VOCABULARY_MAX_ENTRIES}, (_, index) => word(`term ${index}`, `释义 ${index}`));
    const result = await call(f, "import", {book: {version: 1, entries}});
    assert.equal(result.ok, false);
    assert.match(result.error, /最多保存/);
    assert.equal((await call(f, "list")).entries.length, 1);
});
