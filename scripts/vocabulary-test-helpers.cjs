const vm = require("node:vm");
const Core = require("../src/shared.js");
const {loadBackground} = require("./extension-scripts.cjs");
const copy = value => JSON.parse(JSON.stringify(value));

function vocabularyFixture({mode = "worker", protocol = "openai-compatible", storage = {}, fetch} = {}) {
    const data = {translationServices: [{id: "provider", name: "Fixture", apiProtocol: protocol,
        baseUrl: "https://provider.test/v1", apiKey: "fixture-key", models: [{id: "model"}]}],
        translationServiceId: "provider", translationModelId: "model", ...storage};
    const requests = [], messages = [], opened = [], listeners = new Set();
    const hooks = {failWrite: false};
    let receiver;
    const chrome = {
        runtime: {
            getManifest: () => ({version: "0.3.2"}),
            getURL: path => `https://extension.test/${path}`,
            onMessage: {addListener(fn) {receiver = fn;}},
            sendMessage(message, done) {messages.push(message); receiver(message, {url: "https://example.org/read", tab: {title: "Reading"}}, done);},
        },
        tabs: {create(options, done) {opened.push(options); done?.({id: 1});}},
        storage: {
            onChanged: {addListener(fn) {listeners.add(fn);}, removeListener(fn) {listeners.delete(fn);}},
            local: {
                get(defaults, done) {
                    let values;
                    if (defaults === null) values = data;
                    else if (typeof defaults === "string" || Array.isArray(defaults)) values = Object.fromEntries([].concat(defaults).filter(key => key in data).map(key => [key, data[key]]));
                    else values = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, key in data ? data[key] : value]));
                    const snapshot = copy(values);
                    setTimeout(() => done(snapshot), 1);
                },
                set(values, done) {
                    setTimeout(() => {
                        if (hooks.failWrite) {
                            chrome.runtime.lastError = {message: "Storage quota exceeded"};
                            done?.(); delete chrome.runtime.lastError; return;
                        }
                        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {oldValue: data[key], newValue: copy(value)}]));
                        Object.assign(data, copy(values));
                        done?.();
                        listeners.forEach(fn => fn(changes, "local"));
                    }, 2);
                },
                remove(keys, done) {keys.forEach(key => delete data[key]); done?.();},
            },
        },
    };
    const context = vm.createContext({URL, AbortController, setTimeout, clearTimeout, TextEncoder,
        crypto: require("node:crypto").webcrypto, chrome,
        fetch: async (url, options) => {
            requests.push({url: String(url), options});
            if (fetch) return fetch(url, options);
            const payload = JSON.parse(options.body);
            const input = JSON.parse(protocol === "gemini" ? payload.contents[0].parts[0].text
                : protocol === "openai-responses" ? payload.input[0].content : payload.messages.at(-1).content);
            requests.at(-1).input = input;
            const content = JSON.stringify({items: input.items.map(item => ({id: item.id,
                translatedText: item.text === "bank" ? /river bank/i.test(item.context) ? "河岸" : "银行" : `译文 ${item.text}`}))});
            const response = protocol === "gemini" ? {candidates: [{content: {parts: [{text: content}]}, finishReason: "STOP"}]}
                : protocol === "anthropic" ? {content: [{type: "text", text: content}], stop_reason: "end_turn"}
                : protocol === "openai-responses" ? {status: "completed", output: [{type: "message", content: [{type: "output_text", text: content}]}]}
                : {choices: [{message: {content}, finish_reason: "stop"}]};
            return {ok: true, text: async () => JSON.stringify(response)};
        },
    });
    loadBackground(context, mode);
    return {chrome, data, hooks, requests, messages, opened, context,
        send: message => new Promise(resolve => chrome.runtime.sendMessage(message, resolve)),
        restart() {loadBackground(vm.createContext({URL, chrome, crypto: require("node:crypto").webcrypto,
            AbortController, setTimeout, clearTimeout, TextEncoder, fetch: context.fetch}), mode);},
    };
}
const word = (sourceText = "bank", translatedText = "银行", extra = {}) => ({sourceText, translatedText,
    sourceLanguage: "en", targetLanguage: "zh-CN", contextText: "The bank offers a savings account.",
    sourceTitle: "Finance guide", sourceUrl: "https://example.org/guide#finance", ...extra});
module.exports = {vocabularyFixture, word};
