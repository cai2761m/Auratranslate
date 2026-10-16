const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const Core = require("../src/shared.js");
const {loadBackground} = require("../scripts/extension-scripts.cjs");

const protocols = ["openai-compatible", "openai-responses", "anthropic", "gemini"];
const settingsFor = protocol => ({
    ...Core.DEFAULT_SETTINGS,
    translationServices: [{id: "service", name: "Provider", apiProtocol: protocol,
        baseUrl: "https://provider.test/v1", apiKey: "test-key", models: [{id: "model"}]}],
    translationServiceId: "service", translationModelId: "model"
});
const responseFor = (protocol, content, truncated = false) => {
    if (protocol === "gemini") return {candidates: [{content: {parts: [
        {thought: true, text: "Hidden thought"}, {text: content}
    ]}, finishReason: truncated ? "MAX_TOKENS" : "STOP"}]};
    if (protocol === "anthropic") return {content: [{type: "thinking", thinking: "Hidden thought"},
        {type: "text", text: content}], stop_reason: truncated ? "max_tokens" : "end_turn"};
    if (protocol === "openai-responses") return {
        status: truncated ? "incomplete" : "completed",
        ...(truncated ? {incomplete_details: {reason: "max_output_tokens"}} : {}),
        output: [{type: "reasoning", summary: [{type: "summary_text", text: "Hidden thought"}]},
            {type: "message", content: [{type: "output_text", text: content}]}]
    };
    return {choices: [{message: {content}, finish_reason: truncated ? "length" : "stop"}]};
};
const inputFor = (protocol, payload) => JSON.parse(protocol === "gemini" ? payload.contents[0].parts[0].text
    : protocol === "openai-responses" ? payload.input[0].content
    : payload.messages.at(-1).content);

function background(protocol, mode = "worker") {
    const data = settingsFor(protocol);
    const requests = [];
    let respond = input => JSON.stringify({items: input.items.map(item => ({id: item.id, translatedText: "译文"}))});
    const context = vm.createContext({YTBTCore: Core, URL, AbortController, setTimeout, clearTimeout,
        TextEncoder, crypto: require("node:crypto").webcrypto,
        chrome: {runtime: {onMessage: {addListener() {}}}, storage: {local: {
            get(defaults, done) { done(defaults === null ? {...data} : {...defaults, ...data}); },
            set(values, done) { Object.assign(data, values); done(); },
            remove(keys, done) { for (const key of keys) delete data[key]; done(); }
        }}},
        fetch: async (url, options) => {
            const payload = JSON.parse(options.body);
            const input = inputFor(protocol, payload);
            requests.push({url, options, payload, input});
            return {ok: true, text: async () => JSON.stringify(responseFor(protocol, respond(input)))};
        }
    });
    loadBackground(context, mode);
    return {context, data, requests, reply(fn) { respond = fn; }};
}

for (const protocol of protocols) {
    test(protocol + " survives storage, resolves both profiles, and uses its own wire format", () => {
        const settings = settingsFor(protocol);
        assert.equal(Core.normalizeTranslationServices(settings.translationServices)[0].apiProtocol, protocol);
        const config = Core.resolveTranslationConfig(settings);
        assert.equal(Core.translationEndpoint(Core.resolveTranslationConfig(settings, "immersive")),
            Core.translationEndpoint(config));
        const request = Core.buildApiRequest(config, {systemPrompt: "Return JSON.", userText: '{"items":[]}',
            mode: "immersive", maxTokens: 3000});
        const payload = JSON.parse(request.options.body);
        assert.equal(request.options.credentials, "omit");
        if (protocol === "gemini") {
            assert.equal(request.url, "https://provider.test/v1/models/model:generateContent");
            assert.equal(request.options.headers["x-goog-api-key"], "test-key");
            assert.equal(request.options.headers.Authorization, undefined);
            assert.equal(payload.generationConfig.responseMimeType, "application/json");
        } else if (protocol === "anthropic") {
            assert.equal(request.url, "https://provider.test/v1/messages");
            assert.equal(request.options.headers["x-api-key"], "test-key");
            assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
            assert.equal(payload.system, "Return JSON.");
            assert.equal(payload.max_tokens, 3000);
            assert.equal(payload.output_config.format.schema.properties.items.type, "array");
        } else if (protocol === "openai-responses") {
            assert.equal(request.url, "https://provider.test/v1/responses");
            assert.equal(request.options.headers.Authorization, "Bearer test-key");
            assert.equal(payload.instructions, "Return JSON.");
            assert.equal(payload.max_output_tokens, 3000);
            assert.equal(payload.store, false);
            assert.equal(payload.text.format.type, "json_schema");
            assert.equal(payload.temperature, undefined);
        } else {
            assert.equal(request.url, "https://provider.test/v1/chat/completions");
            assert.equal(payload.messages[0].role, "system");
            assert.deepEqual(payload.response_format, {type: "json_object"});
        }
        assert.deepEqual(Core.parseApiResponse(config, responseFor(protocol, "Reply")),
            {content: "Reply", finishReason: protocol === "gemini" ? "STOP" : protocol === "anthropic" ? "end_turn"
                : protocol === "openai-responses" ? "" : "stop"});
    });

    for (const mode of ["worker", "event-page"]) {
        test(protocol + " translates and restores subtitle caches in " + mode, async () => {
            const f = background(protocol, mode);
            const message = {videoId: "video", batchId: "batch",
                cues: [{id: "1", sourceText: "An English caption."}]};
            const result = await f.context.handleTranslateBatch(message);
            assert.equal(result.ok, true);
            assert.equal(result.items[0].translatedText, "译文");
            assert.equal(f.requests.length, 1);
            const cached = await f.context.handleTranslateBatch(message);
            assert.equal(cached.items[0].cached, true);
            assert.equal(f.requests.length, 1);
        });
    }

    test(protocol + " supports page analysis, sentence segmentation, and plain text summaries", async () => {
        const f = background(protocol);
        const config = Core.resolveTranslationConfig(f.data);
        const cues = [{id: "1", sourceText: "A bank offers accounts.", startMs: 0}];
        const page = Core.buildImmersivePageContext({title: "Bank guide", blocks: [{text: cues[0].sourceText}]});
        f.reply(() => JSON.stringify({summary: "Financial accounts", terms: [
            {source: "bank", target: "银行", meaning: "financial institution"}
        ]}));
        const plan = await f.context.translateBatch({translationConfig: config, sourceLanguage: "en",
            targetLanguage: "zh-CN", cues, mode: "immersive-context", pageContext: page});
        assert.equal(plan.terms[0].target, "银行");
        f.reply(() => JSON.stringify({groups: [{startId: "1", endId: "1", displaySourceText: cues[0].sourceText}]}));
        const groups = await f.context.translateBatch({translationConfig: config, sourceLanguage: "en",
            targetLanguage: "zh-CN", cues, mode: "segmentation"});
        assert.equal(groups[0].startId, "1");
        f.reply(() => "Overview\n[00:00] A bank offers accounts.");
        const summary = await f.context.translateBatch({translationConfig: config, sourceLanguage: "en",
            targetLanguage: "zh-CN", cues, mode: "summary"});
        assert.match(summary, /Overview/);
        const payload = f.requests.at(-1).payload;
        assert.equal(payload.response_format, undefined);
        assert.equal(payload.text, undefined);
        assert.equal(payload.output_config, undefined);
        assert.equal(payload.generationConfig && payload.generationConfig.responseMimeType, undefined);
    });

    test(protocol + " reports output limits before interpreting partial JSON", async () => {
        const f = background(protocol);
        f.context.fetch = async () => ({ok: true, text: async () =>
            JSON.stringify(responseFor(protocol, '{"items":[', true))});
        await assert.rejects(f.context.translateBatch({
            translationConfig: Core.resolveTranslationConfig(f.data), sourceLanguage: "en", targetLanguage: "zh-CN",
            mode: "immersive", cues: [{id: "1", sourceText: "A paragraph."}]
        }), error => {
            assert.equal(error.code, "OUTPUT_TRUNCATED");
            assert.equal(error.outputTokenLimit, 2048);
            return true;
        });
    });
}

test("full endpoints retain proxy prefixes and query parameters when listing models", () => {
    const cases = [
        ["openai-compatible", "chat/completions"], ["openai-responses", "responses"],
        ["anthropic", "messages"], ["gemini", "models/old:generateContent"]
    ];
    for (const [apiProtocol, suffix] of cases) {
        const service = {apiProtocol, baseUrl: "https://proxy.test/custom/v1/" + suffix + "?tenant=a", apiKey: "key"};
        const request = Core.buildModelsRequest(service);
        assert.equal(request.url, "https://proxy.test/custom/v1/models?tenant=a");
        const endpoint = Core.buildProtocolEndpoint(service.baseUrl, apiProtocol, "new");
        assert.ok(endpoint.includes(apiProtocol === "gemini" ? "/models/new:generateContent" : "/" + suffix));
    }
});

test("native model catalogs filter non-generative Gemini models and carry pagination", () => {
    const gemini = {apiProtocol: "gemini", baseUrl: Core.GEMINI_BASE_URL, apiKey: "key"};
    assert.deepEqual(Core.parseModelsPage(gemini, {models: [
        {name: "models/gemini", supportedGenerationMethods: ["generateContent"]},
        {name: "models/embedding", supportedGenerationMethods: ["embedContent"]}
    ], nextPageToken: "page 2"}), {ids: ["gemini"], nextCursor: "page 2"});
    assert.match(Core.buildModelsRequest(gemini, "page 2").url, /pageToken=page\+2/);
    const anthropic = {apiProtocol: "anthropic", baseUrl: "https://api.anthropic.com/v1"};
    assert.deepEqual(Core.parseModelsPage(anthropic, {data: [{id: "claude"}], has_more: true, last_id: "claude"}),
        {ids: ["claude"], nextCursor: "claude"});
    assert.match(Core.buildModelsRequest(anthropic, "claude").url, /after_id=claude/);
    assert.throws(() => Core.parseModelsPage(anthropic, {data: [], has_more: true}), /游标/);
});

test("protocol changes isolate paid translation caches", async () => {
    const f = background("openai-compatible");
    const message = {videoId: "video", batchId: "batch", cues: [{id: "1", sourceText: "An English caption."}]};
    await f.context.handleTranslateBatch(message);
    const firstKeys = Object.keys(f.data).filter(key => key.startsWith("ytbt:"));
    f.data.translationServices[0].apiProtocol = "anthropic";
    f.context.fetch = async () => ({ok: true, text: async () => JSON.stringify(responseFor("anthropic",
        JSON.stringify({items: [{id: "1", translatedText: "新协议译文"}]})))});
    const result = await f.context.handleTranslateBatch(message);
    assert.equal(result.items[0].translatedText, "新协议译文");
    assert.ok(Object.keys(f.data).filter(key => key.startsWith("ytbt:")).length > firstKeys.length);
});

test("refusals, failed Responses, and API errors cannot be mistaken for translation text", () => {
    const config = Core.resolveTranslationConfig(settingsFor("openai-responses"));
    assert.throws(() => Core.parseApiResponse(config, {status: "failed", error: {message: "No access"}}), /No access/);
    assert.throws(() => Core.parseApiResponse(config, {status: "completed", output: [
        {type: "message", content: [{type: "refusal", refusal: "Cannot help"}]}
    ]}), /refused/);
    assert.throws(() => Core.parseApiResponse(config, {status: "incomplete",
        incomplete_details: {reason: "content_filter"}}), /incomplete/);
    assert.equal(Core.parseApiResponse(config, {status: "completed", output: [
        {type: "reasoning", summary: [{type: "summary_text", text: "Reasoning only"}]}
    ]}).content, "");
});

test("Google webpage caching stays independent of the selected native AI protocol", async () => {
    const f = background("openai-responses");
    let calls = 0;
    f.context.fetch = async url => {
        assert.ok(String(url).startsWith("https://translate.googleapis.com/"));
        calls++;
        return {ok: true, text: async () => JSON.stringify([[["谷歌译文", "source", null, null]], null, "en"])};
    };
    const message = {pageUrl: "https://page.test", preferences: {immersiveTranslationService: "google-free"},
        items: [{id: "1", sourceText: "An English paragraph."}]};
    const first = await f.context.handleImmersiveTranslate(message);
    assert.equal(first.ok, true);
    f.data.translationServices[0].apiProtocol = "anthropic";
    const next = await f.context.handleImmersiveTranslate(message);
    assert.equal(next.items[0].translatedText, "谷歌译文");
    assert.equal(calls, 1);
});
