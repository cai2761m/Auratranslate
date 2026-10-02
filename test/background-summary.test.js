const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {loadBackground} = require("../scripts/extension-scripts.cjs");

function fixture({mode = "worker", gemini = false, fail = false, storageFailure = false, initial = {}} = {}) {
    const data = {translationApiKey: "test-key", translationProvider: gemini ? "gemini" : "custom", translationBaseUrl: gemini ? "" : "https://provider.invalid/v1", translationModel: gemini ? "" : "test-model", ...initial};
    const requests = [];
    let receiver;
    const runtime = {onMessage: {addListener(fn) { receiver = fn; }}};
    const context = vm.createContext({
        AbortController, setTimeout, clearTimeout,
        chrome: {runtime, storage: {local: {
            get(defaults, callback) { callback(defaults === null ? {...data} : {...defaults, ...data}); },
            set(values, callback) {
                if (storageFailure) runtime.lastError = {message: "Quota exceeded"};
                else Object.assign(data, values);
                callback();
                delete runtime.lastError;
            },
            remove(keys, callback) { keys.forEach((key) => delete data[key]); callback(); }
        }}},
        async fetch(url, options) {
            requests.push({url, body: JSON.parse(options.body)});
            if (fail) throw new Error("Connection interrupted after send");
            return {ok: true, text: async () => JSON.stringify(gemini
                ? {candidates: [{content: {parts: [{text: "视频总结"}]}, finishReason: "STOP"}]}
                : {choices: [{message: {content: "视频总结"}, finish_reason: "stop"}]})};
        }
    });
    loadBackground(context, mode);
    return {context, data, requests, send: (message) => new Promise((resolve) => receiver(message, {}, resolve))};
}

const message = {type: "SUMMARIZE_VIDEO", videoId: "one", cues: [{startMs: 0, sourceText: "First topic"}, {startMs: 10000, sourceText: "Second topic"}]};

test("summary uses selected API, plain text output, and deduplicates concurrent/cached requests", async () => {
    const f = fixture();
    const first = await f.send({...message, cacheOnly: true});
    assert.equal(first.text, "");
    assert.equal(f.requests.length, 0);
    const results = await Promise.all([f.send(message), f.send(message)]);
    assert.equal(results[0].text, "视频总结");
    assert.equal(results[1].text, results[0].text);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].body.model, "test-model");
    assert.equal(f.requests[0].body.response_format, undefined);
    assert.match(f.requests[0].body.messages[0].content, /Chinese/);
    assert.match(f.requests[0].body.messages[1].content, /startMs/);
    assert.equal((await f.send(message)).cached, true);
    assert.equal(f.requests.length, 1);
    assert.equal((await f.send({...message, cues: [{startMs: 0, sourceText: "First topic Second topic"}]})).cached, true);
    assert.equal(f.requests.length, 1, "sentence regrouping must reuse the completed summary");
    f.data.targetLanguage = "ja";
    await f.send(message);
    assert.equal(f.requests.length, 2);
});

test("summary supports Firefox loading and Gemini's text response", async () => {
    const f = fixture({mode: "event-page", gemini: true});
    assert.equal((await f.send(message)).text, "视频总结");
    assert.equal(f.requests[0].body.generationConfig.responseMimeType, undefined);
});

test("missing configuration and overlong/invalid transcripts never send paid requests", async () => {
    const f = fixture();
    assert.equal((await f.send({...message, cues: [{startMs: 0, sourceText: "a".repeat(120001)}]})).ok, false);
    assert.equal((await f.send({...message, cues: [{startMs: -1, sourceText: "bad"}]})).ok, false);
    delete f.data.translationApiKey;
    assert.equal((await f.send(message)).ok, false);
    assert.equal(f.requests.length, 0);
});

test("ambiguous request failures are not automatically replayed", async () => {
    const f = fixture({fail: true});
    assert.equal((await f.send(message)).ok, false);
    assert.equal(f.requests.length, 1);
});

test("storage failures still return the summary and retain it without another API call", async () => {
    const f = fixture({storageFailure: true});
    const response = await f.send(message);
    assert.equal(response.ok, true);
    assert.match(response.warning, /缓存保存失败/);
    assert.equal((await f.send(message)).text, response.text);
    assert.equal(f.requests.length, 1);
});

test("a restarted background restores persisted summaries without a provider request", async () => {
    const first = fixture();
    await first.send(message);
    const restarted = fixture({initial: first.data});
    assert.equal((await restarted.send({...message, cacheOnly: true})).text, "视频总结");
    assert.equal(restarted.requests.length, 0);
});
