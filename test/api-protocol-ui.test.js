const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const {mount, click, setValue, settle} = require("../scripts/ui-test-helpers.cjs");

function fixture(protocol) {
    return {translationServices: [{id: "service", name: "Native API", apiProtocol: protocol,
        baseUrl: Core.API_PROTOCOL_DEFAULT_URLS[protocol], apiKey: "demo-key", models: [{id: "manual"}]}],
        translationServiceId: "service", translationModelId: "manual"};
}
function reply(protocol) {
    if (protocol === "gemini") return {candidates: [{content: {parts: [{text: "OK"}]}, finishReason: "STOP"}]};
    if (protocol === "anthropic") return {content: [{type: "text", text: "OK"}], stop_reason: "end_turn"};
    return {status: "completed", output: [{type: "message", content: [{type: "output_text", text: "OK"}]}]};
}

test("protocol choices use readable names, sensible defaults, and survive saving", async t => {
    const page = await mount(t, "options");
    click(page.field("add-service"));
    assert.deepEqual(Array.from(page.field("service-protocol").options, option => option.value),
        ["openai-compatible", "openai-responses", "anthropic", "gemini"]);
    setValue(page.field("service-name"), "Gemini service");
    setValue(page.field("service-protocol"), "openai-responses");
    assert.equal(page.field("service-base-url").value, "https://api.openai.com/v1");
    setValue(page.field("service-protocol"), "gemini");
    assert.equal(page.field("service-base-url").value, Core.GEMINI_BASE_URL);
    setValue(page.field("service-base-url"), "https://proxy.test/custom");
    setValue(page.field("service-protocol"), "anthropic");
    assert.equal(page.field("service-base-url").value, "https://proxy.test/custom", "custom URLs are preserved");
    setValue(page.$(".model-id"), "claude-model");
    click(page.field("save-service"));
    await page.save();
    const service = page.storage.translationServices[0];
    assert.equal(service.apiProtocol, "anthropic");
    const reopened = await mount(t, "options", {storage: page.storage});
    click(reopened.$('[data-select-service="' + service.id + '"]'));
    assert.equal(reopened.field("detail-protocol").value, "Anthropic Messages");
    assert.equal(reopened.field("detail-kind").textContent, "Anthropic Messages");
    click(reopened.field("edit-service"));
    assert.equal(reopened.field("service-protocol").value, "anthropic");
});

for (const protocol of ["openai-responses", "anthropic", "gemini"]) {
    test(protocol + " model tests use the selected protocol and persist separate records", async t => {
        const storage = fixture(protocol);
        storage['modelTestResult:' + JSON.stringify(["service", storage.translationServices[0].baseUrl, "manual"])] =
            {state: "success", message: "", latencyMs: 100, testedAt: 1};
        const calls = [];
        const page = await mount(t, "options", {storage, fetch: async (url, options) => {
            calls.push({url, options, body: JSON.parse(options.body)});
            return {ok: true, json: async () => reply(protocol)};
        }});
        click(page.$('[data-select-service="service"]'));
        click(page.field("detail-test-models"));
        await settle(page.window);
        assert.match(page.field("model-test-results").textContent, /未测试/, "compatible test records are not reused");
        assert.equal(calls.length, 0, "opening the panel does not spend tokens");
        click(page.field("start-model-test"));
        await settle(page.window);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, Core.translationEndpoint(Core.resolveTranslationConfig(storage)));
        assert.equal(page.$(".model-test-result").dataset.state, "success");
        assert.equal(calls[0].body.text, undefined);
        assert.equal(calls[0].body.output_config, undefined);
        if (protocol === "gemini") assert.equal(calls[0].options.headers["x-goog-api-key"], "demo-key");
        else if (protocol === "anthropic") assert.equal(calls[0].options.headers["x-api-key"], "demo-key");
        else assert.equal(calls[0].options.headers.Authorization, "Bearer demo-key");
        assert.ok(Object.keys(storage).some(key => key.startsWith("modelTestResult:") && key.includes(protocol)));
    });
}

for (const protocol of ["anthropic", "gemini"]) {
    test(protocol + " model list fetch follows pages and preserves manually entered models", async t => {
        const storage = fixture(protocol);
        const calls = [];
        const page = await mount(t, "options", {storage, fetch: async (url, options) => {
            calls.push({url, options});
            const second = new URL(url).searchParams.has(protocol === "gemini" ? "pageToken" : "after_id");
            const payload = protocol === "gemini"
                ? {models: [{name: "models/" + (second ? "second" : "first"), supportedGenerationMethods: ["generateContent"]},
                    {name: "models/embedding", supportedGenerationMethods: ["embedContent"]}],
                    ...(second ? {} : {nextPageToken: "page2"})}
                : {data: [{id: second ? "second" : "first"}], has_more: !second, last_id: "first"};
            return {ok: true, json: async () => payload};
        }});
        click(page.$('[data-select-service="service"]'));
        click(page.field("detail-fetch-models"));
        await settle(page.window);
        assert.equal(calls.length, 2);
        assert.deepEqual(Array.from(page.$("#model-picker-list").querySelectorAll("input"), input => input.value),
            ["first", "second"]);
        click(page.field("model-picker-select-all"));
        click(page.field("model-picker-add"));
        await page.save();
        assert.deepEqual(storage.translationServices[0].models.map(model => model.id), ["manual", "first", "second"]);
    });
}

test("switching protocol cancels an in-flight catalog without accepting late results", async t => {
    let finish;
    const calls = [];
    const page = await mount(t, "options", {fetch: (url, options) => {
        calls.push({url, options});
        return new Promise(resolve => { finish = resolve; });
    }});
    click(page.field("add-service"));
    setValue(page.field("service-protocol"), "gemini");
    click(page.field("fetch-models"));
    setValue(page.field("service-protocol"), "anthropic");
    assert.equal(calls[0].options.signal.aborted, true);
    finish({ok: true, json: async () => ({models: [{name: "models/late"}]})});
    await settle(page.window);
    assert.equal(page.field("model-picker-dialog"), null);
    assert.equal(page.field("fetch-models").disabled, false);
});
