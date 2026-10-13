const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const Core = require("../src/shared.js");
const {loadBackground} = require("../scripts/extension-scripts.cjs");
const {source} = require("../scripts/extension-scripts.cjs");
const {JSDOM} = require("jsdom");

const page = () => Core.buildImmersivePageContext({title: "Banks and rivers", blocks: [
    {text: "The bank offers savings accounts.", heading: "Finance"},
    {text: "Another bank offers loans.", heading: "Finance"},
    {text: "We sat on the river bank.", heading: "Landscape"}
]});
const plan = {
    summary: "A page comparing financial institutions and river landscapes.",
    terms: [
        {source: "bank", target: "银行", meaning: "financial institution offering accounts or loans"},
        {source: "bank", target: "河岸", meaning: "land alongside a river"}
    ]
};
const message = (index = 0, extra = {}) => ({type: "IMMERSIVE_TRANSLATE",
    pageUrl: "https://example.com/banks", pageContext: page(),
    items: [{id: `im${index}`, sourceText: page().blocks[index].text, contextText: page().blocks[index].heading}],
    ...extra});

function fixture({gemini = false, mode = "worker"} = {}) {
    const data = {...Core.DEFAULT_SETTINGS, translationProvider: gemini ? "gemini" : "custom",
        translationApiKey: "test-key", translationBaseUrl: gemini ? "" : "https://provider.invalid/v1",
        translationModel: gemini ? "" : "model"};
    const requests = [];
    const hooks = {};
    function start() {
        let listener;
        const runtime = {onMessage: {addListener(fn) { listener = fn; }}};
        const context = vm.createContext({AbortController, setTimeout, clearTimeout, TextEncoder,
            crypto: require("node:crypto").webcrypto, YTBTCore: Core,
            chrome: {runtime, storage: {local: {
                get(defaults, done) { done(defaults === null ? structuredClone(data) : {...defaults, ...structuredClone(data)}); },
                set(values, done) {
                    if (hooks.storageError) runtime.lastError = {message: "Quota exceeded"};
                    else Object.assign(data, structuredClone(values));
                    done();
                    delete runtime.lastError;
                },
                remove(keys, done) { keys.forEach((key) => delete data[key]); done(); }
            }}},
            async fetch(url, options) {
                if (String(url).startsWith("https://translate.googleapis.com/")) {
                    requests.push({kind: "google"});
                    return {ok: true, text: async () => JSON.stringify([[["谷歌译文", "source", null, null]], null, "en"])};
                }
                const payload = JSON.parse(options.body);
                const system = gemini ? payload.systemInstruction.parts[0].text : payload.messages[0].content;
                const input = JSON.parse(gemini ? payload.contents[0].parts[0].text : payload.messages[1].content);
                const kind = system.includes("context and terminology analyst") ? "context" : "translation";
                requests.push({kind, system, input, payload});
                if (hooks.fetch) await hooks.fetch({kind, input});
                const result = kind === "context" ? (hooks.plan || plan) : {items: input.items.map((item) => {
                    const sense = item.text.includes("river") || item.context === "Landscape" ? "land alongside a river" : "financial institution offering accounts or loans";
                    const glossaryTerm = input.pageContext?.terms.find((term) => term.source === "bank" && term.meaning === sense);
                    return {id: item.id, translatedText: glossaryTerm ? glossaryTerm.target : "旧的不一致译法"};
                })};
                const content = JSON.stringify(result);
                return {ok: true, text: async () => JSON.stringify(gemini
                    ? {candidates: [{content: {parts: [{text: content}]}, finishReason: "STOP"}]}
                    : {choices: [{message: {content}, finish_reason: "stop"}]})};
            }
        });
        loadBackground(context, mode);
        return {send: (input) => new Promise((resolve) => listener(input, {}, resolve))};
    }
    return {data, requests, hooks, start};
}

test("parallel batches share one semantic plan and keep distinct senses", async () => {
    const f = fixture();
    const worker = f.start();
    const responses = await Promise.all([0, 1, 2].map((index) => worker.send(message(index))));
    assert.ok(responses.every((result) => result.ok));
    assert.deepEqual(responses.map((result) => result.items[0].translatedText), ["银行", "银行", "河岸"]);
    assert.equal(f.requests.filter((request) => request.kind === "context").length, 1);
    const translations = f.requests.filter((request) => request.kind === "translation");
    assert.equal(translations.length, 3);
    for (const request of translations) {
        assert.deepEqual(request.input.pageContext, plan);
        assert.match(request.system, /exact target term/);
        assert.match(request.system, /Different meanings/);
        assert.ok(request.input.items[0].context);
    }
});

test("the production webpage-to-background pipeline renders consistent senses across batches", async (t) => {
    const f = fixture();
    const worker = f.start();
    const dom = new JSDOM(`<title>Bank guide</title><main>${Array.from({length: 12}, (_, index) =>
        `<p>${index === 11 ? "We sat on the river bank." : `The bank offers savings account number ${index}.`}</p>`).join("")}</main>`,
        {url: "https://example.com/banks", runScripts: "outside-only", pretendToBeVisual: true});
    t.after(() => dom.window.close());
    const {window} = dom;
    window.HTMLElement.prototype.getBoundingClientRect = () => ({width: 500, height: 30, top: 0, bottom: 30});
    window.chrome = {runtime: {}, storage: {local: {
        get(defaults, done) { done({...defaults, ...f.data}); }, set(_values, done) { done(); }
    }}};
    window.eval(source("shared"));
    window.YTBTCore = {...window.YTBTCore, sendRuntimeMessage: (_runtime, input) => worker.send(input)};
    window.eval(source("immersive"));
    window.document.querySelector(".ytbt-immersive-tab").click();
    for (let turn = 0; turn < 100; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (window.YTBTImmersive.state.mode !== "translating") break;
    }
    assert.equal(window.YTBTImmersive.state.mode, "done");
    assert.deepEqual(Array.from(window.document.querySelectorAll(".ytbt-immersive-text"), (node) => node.textContent),
        [...Array(11).fill("银行"), "河岸"]);
    assert.equal(f.requests.filter((request) => request.kind === "context").length, 1);
    assert.ok(f.requests.filter((request) => request.kind === "translation").length > 1);
});

test("cache-only reads do not analyze, and restarts reuse both the glossary and translations", async () => {
    const f = fixture();
    const worker = f.start();
    assert.equal((await worker.send(message(0, {cacheOnly: true}))).items.length, 0);
    assert.equal(f.requests.length, 0);
    await worker.send(message());
    const restarted = f.start();
    assert.equal((await restarted.send(message(0, {cacheOnly: true}))).items[0].cached, true);
    await restarted.send(message(1));
    assert.equal(f.requests.filter((request) => request.kind === "context").length, 1);
    assert.equal(f.requests.filter((request) => request.kind === "translation").length, 2);
    assert.deepEqual(f.requests.at(-1).input.pageContext, plan);
});

test("identical source text in different semantic contexts has separate translations and cache entries", async () => {
    const f = fixture();
    const input = message(0, {items: [
        {id: "financial", sourceText: "The bank is nearby.", contextText: "Finance"},
        {id: "river", sourceText: "The bank is nearby.", contextText: "Landscape"}
    ]});
    const first = await f.start().send(input);
    assert.deepEqual(Array.from(first.items, (item) => [item.id, item.translatedText]), [["financial", "银行"], ["river", "河岸"]]);
    const cached = await f.start().send({...input, cacheOnly: true});
    assert.deepEqual(Array.from(cached.items, (item) => [item.id, item.translatedText]), [["financial", "银行"], ["river", "河岸"]]);
    assert.equal(f.requests.length, 2);
});

test("deep context isolates old translations and changed page meaning, language, model and toggles", async () => {
    const f = fixture();
    const worker = f.start();
    const legacy = await worker.send(message(0, {pageContext: undefined}));
    assert.equal(legacy.items[0].translatedText, "旧的不一致译法");
    assert.equal((await worker.send(message())).items[0].translatedText, "银行");
    for (const extra of [
        {pageContext: Core.buildImmersivePageContext({title: "New meaning", blocks: [{text: page().blocks[0].text}]})},
        {pageUrl: "https://example.com/other"},
        {preferences: {immersiveTargetLanguage: "ja"}},
        {preferences: {immersiveSourceLanguage: "fr"}}
    ]) assert.equal((await worker.send(message(0, {...extra, cacheOnly: true}))).items.length, 0);
    f.data.translationModel = "new-model";
    assert.equal((await worker.send(message(0, {cacheOnly: true}))).items.length, 0);
    f.data.translationModel = "model";
    const disabled = await worker.send(message(0, {preferences: {immersiveDeepContextEnabled: false}, cacheOnly: true}));
    assert.equal(disabled.items[0].translatedText, "旧的不一致译法");
    assert.equal(f.requests.length, 3);
});

test("a run's deep-context preference snapshot wins over later global edits", async () => {
    const f = fixture();
    f.data.immersiveDeepContextEnabled = false;
    const result = await f.start().send(message(0, {preferences: {immersiveDeepContextEnabled: true}}));
    assert.equal(result.items[0].translatedText, "银行");
    assert.equal(f.requests[0].kind, "context");
});

test("disabled and free services do not analyze page context", async () => {
    const f = fixture();
    const worker = f.start();
    await worker.send(message(0, {preferences: {immersiveDeepContextEnabled: false}}));
    await worker.send(message(0, {preferences: {immersiveTranslationService: "google-free"}}));
    assert.deepEqual(f.requests.map((request) => request.kind), ["translation", "google"]);
});

test("Gemini and Firefox use the same context and glossary protocol", async () => {
    const f = fixture({gemini: true, mode: "event-page"});
    assert.equal((await f.start().send(message())).items[0].translatedText, "银行");
    assert.equal(f.requests[0].payload.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(f.requests[1].input.pageContext, plan);
});

test("analysis failures stop all concurrent translations without automatic replay", async () => {
    const f = fixture();
    f.hooks.fetch = () => { throw new Error("Connection interrupted after send"); };
    const worker = f.start();
    const responses = await Promise.all([0, 1, 2].map((index) => worker.send(message(index))));
    assert.ok(responses.every((result) => result.ok === false));
    assert.equal(f.requests.length, 1);
    assert.equal((await worker.send(message(0, {cacheOnly: true}))).items.length, 0);
    assert.equal(f.requests.length, 1);
});

test("paid plans survive storage failure and are saved on manual retry without reanalysis", async () => {
    const f = fixture();
    f.hooks.storageError = true;
    const worker = f.start();
    assert.equal((await worker.send(message())).ok, false);
    assert.equal(f.requests.length, 1);
    assert.equal((await worker.send(message(0, {cacheOnly: true}))).items.length, 0);
    f.hooks.storageError = false;
    assert.equal((await worker.send(message())).items[0].translatedText, "银行");
    assert.equal(f.requests.length, 2);
});

test("explicit manual retry can start a new analysis after a failed run", async () => {
    const f = fixture();
    f.hooks.fetch = () => { throw new Error("Connection interrupted after send"); };
    const worker = f.start();
    assert.equal((await worker.send(message(0, {contextRunId: "first-click"}))).ok, false);
    delete f.hooks.fetch;
    assert.equal((await worker.send(message(0, {contextRunId: "second-click"}))).items[0].translatedText, "银行");
    assert.equal(f.requests.length, 3);
});

test("invalid or conflicting plans cannot be used for paragraph translations", async () => {
    for (const invalid of [{items: []}, {summary: "Topic", terms: [plan.terms[0], {...plan.terms[0], target: "岸边"}]}]) {
        const f = fixture();
        f.hooks.plan = invalid;
        const result = await f.start().send(message());
        assert.equal(result.ok, false);
        assert.equal(f.requests.length, 1);
    }
});

test("long-page snapshots cover all blocks, stay bounded, and detect unsampled source changes", () => {
    const blocks = Array.from({length: 240}, (_, index) => ({text: `Paragraph ${index}: ` + "Details ".repeat(2000), heading: "Section ".repeat(25)}));
    const snapshot = Core.buildImmersivePageContext({title: "Long page", blocks});
    assert.equal(snapshot.blocks.length, 240);
    assert.ok(snapshot.blocks.at(-1).text.startsWith("Paragraph 239:"));
    assert.ok(snapshot.blocks.reduce((total, block) => total + block.text.length + block.heading.length, 0) <= 32000);
    assert.equal(snapshot.sampled, true);
    assert.deepEqual(Core.normalizeImmersivePageContext(snapshot), snapshot);
    blocks[100].text += "Different meaning at the end.";
    assert.notEqual(Core.buildImmersivePageContext({title: "Long page", blocks}).contentFingerprint, snapshot.contentFingerprint);
});

test("glossary validation discards invented terms and keeps separate meanings", () => {
    const result = Core.parseImmersiveContextContent({...plan, terms: [...plan.terms,
        {source: "invented word", target: "不存在", meaning: "invented"}]}, page());
    assert.deepEqual(result, plan);
});
