// Provider wire formats shared by translation requests and settings tools.
(function registerSharedModule(root, register) {
    if (typeof module !== "undefined" && module.exports) module.exports = register;
    else register(root.YTBTShared || (root.YTBTShared = {}));
})(globalThis, function (Shared) {
    "use strict";

    const API_PROTOCOL_DEFAULT_URLS = Object.freeze({
        "openai-compatible": "",
        "openai-responses": "https://api.openai.com/v1",
        anthropic: "https://api.anthropic.com/v1",
        gemini: "https://generativelanguage.googleapis.com/v1beta"
    });

    function protocolApiStyle(protocol) {
        return ({"openai-responses": "responses", anthropic: "anthropic", gemini: "gemini"})[protocol]
            || "chat-completions";
    }

    function apiBaseUrl(baseUrl) {
        const raw = String(baseUrl || "").trim();
        if (!raw) return "";
        const strip = value => value.replace(/\/+$/, "").replace(
            /\/(?:chat\/completions|responses|messages|(?:models|tunedModels)\/[^/]+:(?:generateContent|streamGenerateContent))$/i, ""
        );
        try {
            const url = new URL(raw);
            url.pathname = strip(url.pathname);
            url.hash = "";
            return url.toString().replace(/\/$/, "");
        } catch (_) { return strip(raw); }
    }

    function appendApiPath(baseUrl, suffix, params = {}) {
        if (!baseUrl) return "";
        try {
            const url = new URL(baseUrl);
            url.pathname = url.pathname.replace(/\/+$/, "") + "/" + suffix;
            url.hash = "";
            for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
            return url.toString();
        } catch (_) { return baseUrl.replace(/\/+$/, "") + "/" + suffix; }
    }

    function buildProtocolEndpoint(baseUrl, protocol, model) {
        const base = apiBaseUrl(baseUrl);
        if (protocol === "gemini") {
            const name = String(model || "").trim().replace(/^\/+/, "");
            if (!name) return "";
            const modelPath = /^(models|tunedModels)\//.test(name) ? name : "models/" + name;
            return appendApiPath(base, modelPath.split("/").map(encodeURIComponent).join("/") + ":generateContent");
        }
        return appendApiPath(base, protocol === "anthropic" ? "messages"
            : protocol === "openai-responses" ? "responses" : "chat/completions");
    }

    function translationEndpoint(config) {
        if (config.apiStyle === "gemini") return config.generateContentUrl || "";
        if (config.apiStyle === "anthropic") return config.messagesUrl || "";
        if (config.apiStyle === "responses") return config.responsesUrl || "";
        return config.chatCompletionsUrl || "";
    }

    function apiHeaders(apiStyle, apiKey) {
        const key = String(apiKey || "").trim();
        if (apiStyle === "anthropic") return {
            "anthropic-version": "2023-06-01", ...(key ? {"x-api-key": key} : {})
        };
        if (apiStyle === "gemini") return key ? {"x-goog-api-key": key} : {};
        return key ? {Authorization: "Bearer " + key} : {};
    }

    function jsonOutputSchema(mode) {
        const text = {type: "string"};
        const object = properties => ({
            type: "object", properties, required: Object.keys(properties), additionalProperties: false
        });
        const array = items => ({type: "array", items});
        if (mode === "segmentation") return object({
            groups: array(object({startId: text, endId: text, displaySourceText: text}))
        });
        if (mode === "immersive-context") return object({
            summary: text, terms: array(object({source: text, target: text, meaning: text}))
        });
        return object({items: array(object({id: text, translatedText: text}))});
    }

    function buildApiRequest(config, {systemPrompt = "", userText, maxTokens = 2048, mode = "test"} = {}) {
        const json = config.useJsonResponseFormat && mode !== "summary" && mode !== "test";
        let payload;
        if (config.apiStyle === "gemini") {
            payload = {
                ...(systemPrompt ? {systemInstruction: {parts: [{text: systemPrompt}]}} : {}),
                contents: [{role: "user", parts: [{text: String(userText || "")}]}],
                generationConfig: {temperature: 0.1, maxOutputTokens: maxTokens}
            };
            if (json) payload.generationConfig.responseMimeType = "application/json";
        } else if (config.apiStyle === "anthropic") {
            payload = {
                model: config.model, max_tokens: maxTokens, stream: false,
                ...(systemPrompt ? {system: systemPrompt} : {}),
                messages: [{role: "user", content: String(userText || "")}]
            };
            if (json) payload.output_config = {format: {type: "json_schema", schema: jsonOutputSchema(mode)}};
        } else if (config.apiStyle === "responses") {
            payload = {
                model: config.model, max_output_tokens: maxTokens, stream: false, store: false,
                ...(systemPrompt ? {instructions: systemPrompt} : {}),
                input: [{role: "user", content: String(userText || "")}]
            };
            if (json) payload.text = {format: {type: "json_schema", name: "auratranslate",
                strict: true, schema: jsonOutputSchema(mode)}};
        } else {
            payload = {
                model: config.model,
                messages: [
                    ...(systemPrompt ? [{role: "system", content: systemPrompt}] : []),
                    {role: "user", content: String(userText || "")}
                ],
                ...(mode !== "test" ? {stream: false, temperature: 0.1, max_tokens: maxTokens} : {})
            };
            if (json) payload.response_format = {type: "json_object"};
        }
        return {url: translationEndpoint(config), options: {
            method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
            headers: {"Content-Type": "application/json", ...apiHeaders(config.apiStyle, config.apiKey)},
            body: JSON.stringify(payload)
        }};
    }

    function parseApiResponse(config, body) {
        if (body && body.error) throw new Error("API error: " + String(body.error.message || body.error.type || "unknown").slice(0, 300));
        const textParts = (parts, include) => (Array.isArray(parts) ? parts : [])
            .filter(part => part && include(part) && typeof part.text === "string")
            .map(part => part.text).join("");
        let content = "", finishReason = "";
        if (config.apiStyle === "gemini") {
            const candidate = body && body.candidates && body.candidates[0];
            finishReason = candidate && candidate.finishReason || "";
            content = textParts(candidate && candidate.content && candidate.content.parts, part => !part.thought);
            const blocked = body && body.promptFeedback && body.promptFeedback.blockReason;
            if (blocked || (finishReason && !["STOP", "MAX_TOKENS"].includes(finishReason))) {
                throw new Error("API response blocked (" + (blocked || finishReason) + ").");
            }
        } else if (config.apiStyle === "anthropic") {
            finishReason = body && body.stop_reason || "";
            content = textParts(body && body.content, part => part.type === "text");
            if (finishReason === "max_tokens") finishReason = "length";
            if (finishReason === "refusal") throw new Error("API response refused.");
        } else if (config.apiStyle === "responses") {
            const output = Array.isArray(body && body.output) ? body.output : [];
            if (output.some(item => item.type === "message" && Array.isArray(item.content)
                && item.content.some(part => part.type === "refusal"))) throw new Error("API response refused.");
            if (body && body.status === "incomplete" && body.incomplete_details
                && body.incomplete_details.reason === "max_output_tokens") finishReason = "length";
            else if (body && body.status && body.status !== "completed") {
                throw new Error("API response " + body.status + " (" +
                    (body.incomplete_details && body.incomplete_details.reason || "no completed result") + ").");
            }
            content = output.filter(item => item.type === "message")
                .map(item => textParts(item.content, part => part.type === "output_text")).join("\n");
        } else {
            const choice = body && body.choices && body.choices[0];
            const value = choice && choice.message && choice.message.content;
            content = typeof value === "string" ? value : textParts(value, part => !part.type || part.type === "text");
            finishReason = choice && choice.finish_reason || "";
            if (choice && choice.message && choice.message.refusal) throw new Error("API response refused.");
        }
        return {content: content.trim(), finishReason};
    }

    function buildModelsRequest(service, cursor = "") {
        const protocol = service.apiProtocol || "openai-compatible";
        const apiStyle = protocolApiStyle(protocol);
        const params = cursor ? protocol === "gemini" ? {pageToken: cursor} : {after_id: cursor} : {};
        return {
            url: appendApiPath(apiBaseUrl(service.baseUrl), "models", params),
            options: {headers: apiHeaders(apiStyle, service.apiKey), credentials: "omit", referrerPolicy: "no-referrer"}
        };
    }

    function parseModelsPage(service, payload) {
        if (payload && payload.error) throw new Error(String(payload.error.message || "接口返回错误").slice(0, 100));
        const models = payload && (payload.data || payload.models) || [];
        const gemini = service.apiProtocol === "gemini";
        const ids = (Array.isArray(models) ? models : [])
            .filter(model => !gemini || !Array.isArray(model.supportedGenerationMethods)
                || model.supportedGenerationMethods.includes("generateContent"))
            .map(model => String(model && (model.id || model.name) || "").trim())
            .map(id => gemini ? id.replace(/^models\//, "") : id).filter(Boolean);
        const nextCursor = gemini ? payload && payload.nextPageToken || ""
            : service.apiProtocol === "anthropic" && payload && payload.has_more ? payload.last_id || "" : "";
        if (service.apiProtocol === "anthropic" && payload && payload.has_more && !nextCursor) {
            throw new Error("模型列表分页缺少游标");
        }
        return {ids, nextCursor};
    }

    Object.assign(Shared, {API_PROTOCOL_DEFAULT_URLS, protocolApiStyle, buildProtocolEndpoint,
        translationEndpoint, buildApiRequest, parseApiResponse, buildModelsRequest, parseModelsPage});
});
