// Default settings, language labels, API configuration, and cache keys.
// Browser: register before shared.js. Node: shared.js calls this factory.
(function registerSharedModule(root, register) {
    if (typeof module !== "undefined" && module.exports) module.exports = register;
    else register(root.YTBTShared || (root.YTBTShared = {}));
})(globalThis, function (Shared) {
    "use strict";

    const SELECTION_TOOLBAR_ACTIONS = Object.freeze([
        {id: "translate", label: "翻译", title: "翻译所选文字", path: "M4 5h12M10 3v2M7 5c0 5 3 8 7 10M13 5c0 5-3 8-8 11M14 20l4-10 4 10M15.5 17h5"},
        {id: "copy", label: "复制", title: "复制所选文字", path: "M9 9h11v12H9zM6 16H4V3h11v3"},
        {id: "vocabulary", label: "生词本", title: "打开生词本", path: "M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"},
        {id: "dismiss", label: "关闭", title: "关闭划词工具栏", path: "m6 6 12 12M18 6 6 18"},
    ].map(Object.freeze));
    const DEFAULT_SELECTION_TOOLBAR = Object.freeze({
        actions: Object.freeze(["translate"]), size: "compact", showLabels: false, position: "below",
    });

    function normalizeSelectionToolbar(value) {
        const source = value && typeof value === "object" ? value : {};
        const known = new Set(SELECTION_TOOLBAR_ACTIONS.map(action => action.id));
        const actions = [...new Set((Array.isArray(source.actions) ? source.actions : DEFAULT_SELECTION_TOOLBAR.actions)
            .filter(id => known.has(id)))];
        // Keep a translation entry even when settings were imported from an older or malformed backup.
        if (!actions.includes("translate")) actions.unshift("translate");
        return {
            actions,
            size: ["compact", "regular", "comfortable"].includes(source.size) ? source.size : "compact",
            showLabels: source.showLabels === true,
            position: source.position === "above" ? "above" : "below",
        };
    }

    const DEFAULT_SETTINGS = Object.freeze({
        // User-managed provider list. Each entry owns its own credential, endpoint,
        // protocol and model catalog; the subtitle and immersive pages only pick
        // one entry plus one model from it.
        translationServices: [],
        translationServiceId: "",
        translationModelId: "",
        immersiveTranslationServiceId: "",
        immersiveTranslationModelId: "",
        // Legacy single-provider keys. They stay readable (and are mirrored on save)
        // so settings written by older versions keep working untouched.
        translationProvider: "deepseek",
        translationApiKey: "",
        translationBaseUrl: "",
        translationModel: "",
        translationJsonResponse: true,
        immersiveTranslationProvider: "",
        immersiveTranslationApiKey: "",
        immersiveTranslationBaseUrl: "",
        immersiveTranslationModel: "",
        immersiveTranslationJsonResponse: true,
        immersiveSourceLanguage: "auto",
        immersiveTargetLanguage: "",
        immersiveTranslationService: "ai",
        immersiveDeepContextEnabled: true,
        immersiveDisplayMode: "bilingual",
        immersiveAutoTranslate: false,
        immersiveSiteRules: {},
        immersiveDisabledSites: [],
        selectionTranslationEnabled: true,
        selectionToolbar: DEFAULT_SELECTION_TOOLBAR,
        targetLanguage: "zh-CN",
        sourceLanguage: "en",
        fontScale: 1,
        subtitleDisplayMode: "bilingual",
        subtitleColor: "#ffffff",
        subtitleBackgroundOpacity: 0.88,
        subtitleEnabled: true,
        subtitleTranslationMode: "economy",
        subtitleLookAheadMinutes: 2,
        subtitlePosition: null,
        llmSentenceSegmentationEnabled: true,
        asrCorrectionEnabled: true,
        showOriginalTechnicalTerms: true,
        // Appearance. "system" defers to prefers-color-scheme; the explicit values
        // pin a theme on extension pages. The in-page floating control keeps its own
        // page-luminance adaptation and ignores this.
        uiTheme: "system",
        cacheVersion: "1",
        translationCacheMaxItems: 2000
    });

    // Legacy provider defaults remain available to resolve older settings.
    const DEEPSEEK_MODEL = "deepseek-v4-flash";
    const FONT_SCALE_MIN = 0.3;
    const FONT_SCALE_MAX = 3;
    const FONT_SCALE_STEP = 0.05;

    function normalizeFontScale(value) {
        if (value == null || value === "" || typeof value === "boolean") return DEFAULT_SETTINGS.fontScale;
        const scale = Number(value);
        return Number.isFinite(scale)
            ? Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale))
            : DEFAULT_SETTINGS.fontScale;
    }

    const UI_THEMES = ["system", "light", "dark"];

    function normalizeSiteHostname(value) {
        const text = String(value || "").trim();
        if (!text || /\s|\*/.test(text)) return "";
        try {
            const url = new URL(text.includes("://") ? text : `https://${text}`);
            return ["http:", "https:"].includes(url.protocol) && url.hostname
                ? url.hostname.toLowerCase().replace(/\.$/, "") : "";
        } catch (_) { return ""; }
    }

    function normalizeDisabledSites(values) {
        return [...new Set((Array.isArray(values) ? values : []).map(normalizeSiteHostname).filter(Boolean))];
    }

    function normalizeUiTheme(value) {
        return UI_THEMES.includes(value) ? value : DEFAULT_SETTINGS.uiTheme;
    }

    const GEMINI_MODEL = "gemini-3.5-flash";
    const MERGE_VERSION = "5";
    const SENTENCE_SEGMENTATION_VERSION = "1";
    const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
    const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

    // Wire formats supported by both translation and the provider tools.
    const TRANSLATION_SERVICE_PROTOCOLS = Object.freeze({
        "openai-compatible": "OpenAI Completion",
        "openai-responses": "OpenAI Responses",
        "anthropic": "Anthropic Messages",
        "gemini": "Google Gemini"
    });
    const DEFAULT_SERVICE_PROTOCOL = "openai-compatible";

    // Upper bound on the number of cached cue translations. Each `ytbt:` storage
    // key holds an entire video; once this many cached cues accumulate, the
    // least-recently-updated video keys are evicted to stay under the quota.
    const DEFAULT_CACHE_MAX_ITEMS = 2000;

    // Human-readable labels for the languages the prompt references. Unknown
    // codes fall back to a safe default so the prompt always reads sensibly.
    const LANGUAGE_LABELS = {
        "auto": "automatically detected source-language",
        "ja": "Japanese",
        "ko": "Korean",
        "fr": "French",
        "de": "German",
        "es": "Spanish",
        "en": "English",
        "zh-CN": "Simplified Chinese",
        "zh-TW": "Traditional Chinese"
    };

    function languageLabel(code, fallback) {
        const key = String(code || "").trim();
        if (LANGUAGE_LABELS[key]) {
            return LANGUAGE_LABELS[key];
        }
        // Handle regional variants like "en-US" by matching the base code.
        const base = key.split("-")[0];
        return LANGUAGE_LABELS[base] || fallback || "English";
    }

    function sourceLanguageLabel(code) {
        return languageLabel(code, "English");
    }

    function targetLanguageLabel(code) {
        return languageLabel(code, "Simplified Chinese");
    }

    function buildTechnicalTerminologyInstruction(showOriginalTechnicalTerms) {
        return showOriginalTechnicalTerms !== false
            ? "For any professional, technical, or specialized terms, you must append the original source term in parentheses immediately after its translation (e.g., '翻译 (Translation)'). "
            : "Translate professional, technical, and specialized terms naturally, but do not append or repeat source-language terms in parentheses unless those parentheses already appear in the source. ";
    }

    function fingerprintText(value) {
        const input = String(value || "");
        let hash = 5381;
        for (let index = 0; index < input.length; index += 1) {
            hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
            hash >>>= 0;
        }
        return hash.toString(36);
    }

    function makeCacheKey(parts) {
        const safeParts = Array.isArray(parts) ? parts : [];
        return `ytbt:${fingerprintText(safeParts.join("|"))}`;
    }

    function buildChatCompletionsUrl(baseUrl) {
        const raw = String(baseUrl || "").trim();
        if (!raw) {
            return "";
        }

        const trimmed = raw.replace(/\/+$/, "");
        return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
    }

    function buildGeminiGenerateContentUrl(baseUrl, model) {
        const rawBaseUrl = String(baseUrl || "").trim();
        const rawModel = String(model || "").trim().replace(/^\/+/, "");
        if (!rawBaseUrl || !rawModel) {
            return "";
        }

        const trimmedBaseUrl = rawBaseUrl.replace(/\/+$/, "");
        if (/:generateContent$/i.test(trimmedBaseUrl)) {
            return trimmedBaseUrl;
        }

        const modelPath = /^(models|tunedModels)\//.test(rawModel) ? rawModel : `models/${rawModel}`;
        const encodedModelPath = modelPath.split("/").map(encodeURIComponent).join("/");
        return `${trimmedBaseUrl}/${encodedModelPath}:generateContent`;
    }

    // Rewrites a legacy Gemini endpoint to its OpenAI-compatible sibling. The
    // Preserve the compatible endpoint chosen by the original list migration.
    function openAiCompatibleBaseUrl(baseUrl, provider) {
        const raw = String(baseUrl || "").trim();
        if (provider !== "gemini") return raw;
        const withoutEndpoint = raw.replace(/\/+$/, "").replace(/\/(?:models|tunedModels)\/[^/]+:generateContent$/i, "");
        const base = withoutEndpoint || GEMINI_BASE_URL;
        return /\/openai$/i.test(base) ? base : `${base}/openai`;
    }

    function hostLabel(baseUrl) {
        const raw = String(baseUrl || "").trim();
        if (!raw) return "";
        try {
            return new URL(raw).host || raw;
        } catch (error) {
            return raw.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
        }
    }

    function normalizeServiceModels(models) {
        const normalized = [];
        const seen = new Set();
        for (const entry of Array.isArray(models) ? models : []) {
            const id = String((entry && entry.id) || "").trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            normalized.push({id, displayName: String((entry && entry.displayName) || "").trim()});
        }
        return normalized;
    }

    function normalizeTranslationService(service, index) {
        const source = service && typeof service === "object" ? service : {};
        return {
            id: String(source.id || "").trim() || `service-${index + 1}`,
            name: String(source.name || "").trim(),
            apiProtocol: Object.hasOwn(TRANSLATION_SERVICE_PROTOCOLS, source.apiProtocol)
                ? source.apiProtocol
                : DEFAULT_SERVICE_PROTOCOL,
            baseUrl: String(source.baseUrl || "").trim(),
            apiKey: String(source.apiKey || "").trim(),
            models: normalizeServiceModels(source.models)
        };
    }

    function normalizeTranslationServices(services) {
        const list = Array.isArray(services) ? services : [];
        const normalized = [];
        const seen = new Set();
        for (let index = 0; index < list.length; index += 1) {
            const service = normalizeTranslationService(list[index], index);
            if (seen.has(service.id)) {
                service.id = `${service.id}-${index + 1}`;
            }
            seen.add(service.id);
            normalized.push(service);
        }
        return normalized;
    }

    // The row description shown on the 翻译服务 page. Incomplete entries read as
    // "待完善" so it is obvious which service still needs an endpoint or a model.
    function describeTranslationService(service) {
        const normalized = normalizeTranslationService(service, 0);
        const host = hostLabel(normalized.baseUrl);
        if (!host) return "待完善";
        const protocol = TRANSLATION_SERVICE_PROTOCOLS[normalized.apiProtocol] || normalized.apiProtocol;
        const modelCount = normalized.models.length;
        return `${host} · ${protocol} · ${modelCount ? `${modelCount} 个模型` : "尚未添加模型"}`;
    }

    function buildModelsUrl(baseUrl) {
        const raw = String(baseUrl || "").trim();
        if (!raw) return "";
        return `${raw.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "")}/models`;
    }

    function findServiceById(services, id) {
        const wanted = String(id || "").trim();
        if (!wanted) return null;
        return services.find((service) => service.id === wanted) || null;
    }

    function pickModelId(service, requestedModelId) {
        const models = service && Array.isArray(service.models) ? service.models : [];
        if (!models.length) return "";
        const wanted = String(requestedModelId || "").trim();
        return models.some((model) => model.id === wanted) ? wanted : models[0].id;
    }

    function legacyServiceFields(source, profile) {
        const immersive = profile === "immersive";
        const provider = String(immersive ? source.immersiveTranslationProvider : source.translationProvider || "").trim();
        const apiKey = String(
            immersive ? source.immersiveTranslationApiKey : source.translationApiKey || source.deepseekApiKey || ""
        ).trim();
        const baseUrl = String(immersive ? source.immersiveTranslationBaseUrl : source.translationBaseUrl || "").trim();
        const model = String(immersive ? source.immersiveTranslationModel : source.translationModel || "").trim();
        const providerName = provider === "gemini" ? "Gemini" : provider === "deepseek" ? "DeepSeek" : "";
        return {
            provider,
            apiKey,
            model,
            // Legacy installs relied on the provider defaults for the endpoint and
            // the model, so a migrated service keeps translating without edits.
            defaultModel: providerName === "Gemini" ? GEMINI_MODEL : providerName === "DeepSeek" ? DEEPSEEK_MODEL : "",
            baseUrl: openAiCompatibleBaseUrl(
                baseUrl || (providerName === "Gemini" ? GEMINI_BASE_URL : providerName === "DeepSeek" ? DEEPSEEK_BASE_URL : ""),
                provider
            )
        };
    }

    function serviceFromLegacyFields(fields, id) {
        const model = fields.model || fields.defaultModel;
        return {
            id,
            name: fields.provider === "gemini" ? "Gemini" : fields.provider === "deepseek" ? "DeepSeek" : hostLabel(fields.baseUrl) || "自定义服务",
            apiProtocol: DEFAULT_SERVICE_PROTOCOL,
            baseUrl: fields.baseUrl,
            apiKey: fields.apiKey,
            models: model ? [{id: model, displayName: ""}] : []
        };
    }

    // Turns settings written before the provider list existed into editable
    // service entries. Returns null when there is nothing worth migrating.
    function migrateLegacyTranslationServices(settings) {
        const source = Object.assign({}, DEFAULT_SETTINGS, settings || {});
        const realtime = legacyServiceFields(source, "realtime");
        const immersive = legacyServiceFields(source, "immersive");
        const hasRealtime = Boolean(
            realtime.apiKey || String(source.translationBaseUrl || "").trim() || String(source.translationModel || "").trim()
        );
        const hasImmersive = Boolean(String(source.immersiveTranslationProvider || "").trim());
        if (!hasRealtime && !hasImmersive) return null;

        const services = [];
        let translationServiceId = "";
        let translationModelId = "";
        let immersiveTranslationServiceId = "";
        let immersiveTranslationModelId = "";

        if (hasRealtime) {
            const service = serviceFromLegacyFields(realtime, "legacy-realtime");
            services.push(service);
            translationServiceId = service.id;
            translationModelId = pickModelId(service, "");
        }

        if (hasImmersive) {
            const shared = services.find(
                (service) =>
                    service.baseUrl === immersive.baseUrl &&
                    service.apiKey === immersive.apiKey &&
                    pickModelId(service, "") === (immersive.model || immersive.defaultModel)
            );
            if (shared) {
                immersiveTranslationServiceId = shared.id;
                immersiveTranslationModelId = pickModelId(shared, "");
            } else {
                const service = serviceFromLegacyFields(immersive, "legacy-immersive");
                services.push(service);
                immersiveTranslationServiceId = service.id;
                immersiveTranslationModelId = pickModelId(service, "");
            }
        }

        return {
            services,
            migrated: true,
            translationServiceId,
            translationModelId,
            immersiveTranslationServiceId,
            immersiveTranslationModelId
        };
    }

    // Single source of truth for "which services exist and which one is picked".
    // Stored services win; settings written before the provider list fall back to
    // the legacy keys (migrated on the fly so the option pages can edit them).
    function planTranslationServices(settings) {
        const source = Object.assign({}, DEFAULT_SETTINGS, settings || {});
        const services = normalizeTranslationServices(source.translationServices);
        if (!services.length) {
            const migrated = migrateLegacyTranslationServices(source);
            if (migrated) return migrated;
            return {
                services: [],
                migrated: false,
                translationServiceId: "",
                translationModelId: "",
                immersiveTranslationServiceId: "",
                immersiveTranslationModelId: ""
            };
        }

        const requestedServiceId = String(source.translationServiceId || "").trim();
        const translationServiceId = findServiceById(services, requestedServiceId)
            ? requestedServiceId : requestedServiceId ? services[0].id : "";
        const immersiveTranslationServiceId = findServiceById(services, source.immersiveTranslationServiceId)
            ? String(source.immersiveTranslationServiceId).trim()
            : "";
        return {
            services,
            migrated: false,
            translationServiceId,
            translationModelId: translationServiceId
                ? pickModelId(findServiceById(services, translationServiceId), source.translationModelId)
                : "",
            immersiveTranslationServiceId,
            immersiveTranslationModelId: pickModelId(
                findServiceById(services, immersiveTranslationServiceId),
                source.immersiveTranslationModelId
            )
        };
    }

    function resolveTranslationConfig(settings, profile) {
        const source = Object.assign({}, DEFAULT_SETTINGS, settings || {});
        const immersiveRequested = profile === "immersive";
        const services = normalizeTranslationServices(source.translationServices);

        // Provider list mode: the sub-pages only choose a service and a model.
        if (services.length) {
            const requestedImmersiveId = String(source.immersiveTranslationServiceId || "").trim();
            let useDedicated = immersiveRequested && Boolean(requestedImmersiveId);
            let service = findServiceById(services, useDedicated ? requestedImmersiveId : source.translationServiceId);
            if (!service) {
                // A deleted dedicated service falls back to inheriting the realtime one.
                useDedicated = false;
                service = findServiceById(services, source.translationServiceId) || services[0];
            }
            if (service) {
                const endpoint = service.baseUrl;
                const apiStyle = Shared.protocolApiStyle(service.apiProtocol);
                const model = pickModelId(service, useDedicated ? source.immersiveTranslationModelId : source.translationModelId);
                const requestUrl = Shared.buildProtocolEndpoint(endpoint, service.apiProtocol, model);
                return {
                    provider: apiStyle === "chat-completions" ? "custom" : service.apiProtocol,
                    providerLabel: service.name || "自定义服务",
                    apiProtocol: service.apiProtocol,
                    apiStyle,
                    apiKey: service.apiKey,
                    baseUrl: endpoint,
                    chatCompletionsUrl: apiStyle === "chat-completions" ? requestUrl : "",
                    generateContentUrl: apiStyle === "gemini" ? requestUrl : "",
                    responsesUrl: apiStyle === "responses" ? requestUrl : "",
                    messagesUrl: apiStyle === "anthropic" ? requestUrl : "",
                    model,
                    useJsonResponseFormat: useDedicated
                        ? source.immersiveTranslationJsonResponse !== false
                        : source.translationJsonResponse !== false,
                    includeDeepSeekThinkingFlag: false
                };
            }
        }

        const useImmersiveConfig =
            immersiveRequested && Boolean(String(source.immersiveTranslationProvider || "").trim());
        const providerValue = useImmersiveConfig
            ? source.immersiveTranslationProvider
            : source.translationProvider;
        const provider =
            providerValue === "custom" || providerValue === "gemini"
                ? providerValue
                : "deepseek";
        const apiKey = String(
            useImmersiveConfig
                ? source.immersiveTranslationApiKey
                : source.translationApiKey || source.deepseekApiKey || ""
        ).trim();
        const rawBaseUrl = String(
            useImmersiveConfig ? source.immersiveTranslationBaseUrl : source.translationBaseUrl
        ).trim();
        const rawModel = String(
            useImmersiveConfig ? source.immersiveTranslationModel : source.translationModel
        ).trim();
        let baseUrl =
            rawBaseUrl ||
            (provider === "deepseek" ? DEEPSEEK_BASE_URL : provider === "gemini" ? GEMINI_BASE_URL : "");
        let model =
            rawModel ||
            (provider === "deepseek" ? DEEPSEEK_MODEL : provider === "gemini" ? GEMINI_MODEL : "");

        if (provider === "gemini") {
            if (baseUrl === DEEPSEEK_BASE_URL || /\/chat\/completions$/i.test(baseUrl)) {
                baseUrl = GEMINI_BASE_URL;
            }
            if (model === DEEPSEEK_MODEL) {
                model = GEMINI_MODEL;
            }
        } else if (provider === "deepseek") {
            if (baseUrl === GEMINI_BASE_URL || /:generateContent$/i.test(baseUrl)) {
                baseUrl = DEEPSEEK_BASE_URL;
            }
            if (model === GEMINI_MODEL) {
                model = DEEPSEEK_MODEL;
            }
        }

        const apiStyle = provider === "gemini" ? "gemini" : "chat-completions";

        return {
            provider,
            providerLabel: provider === "deepseek" ? "DeepSeek" : provider === "gemini" ? "Gemini" : "Custom API",
            apiStyle,
            apiKey,
            baseUrl,
            chatCompletionsUrl: apiStyle === "chat-completions" ? buildChatCompletionsUrl(baseUrl) : "",
            generateContentUrl: apiStyle === "gemini" ? buildGeminiGenerateContentUrl(baseUrl, model) : "",
            model,
            useJsonResponseFormat: useImmersiveConfig
                ? source.immersiveTranslationJsonResponse !== false
                : source.translationJsonResponse !== false,
            includeDeepSeekThinkingFlag: provider === "deepseek"
        };
    }

    Object.assign(Shared, {
        SELECTION_TOOLBAR_ACTIONS,
        normalizeSelectionToolbar,
        normalizeSiteHostname,
        normalizeDisabledSites,
        DEFAULT_SETTINGS,
        DEEPSEEK_MODEL,
        FONT_SCALE_MIN,
        FONT_SCALE_MAX,
        FONT_SCALE_STEP,
        normalizeFontScale,
        UI_THEMES,
        normalizeUiTheme,
        GEMINI_MODEL,
        MERGE_VERSION,
        SENTENCE_SEGMENTATION_VERSION,
        DEEPSEEK_BASE_URL,
        GEMINI_BASE_URL,
        TRANSLATION_SERVICE_PROTOCOLS,
        DEFAULT_CACHE_MAX_ITEMS,
        sourceLanguageLabel,
        targetLanguageLabel,
        buildTechnicalTerminologyInstruction,
        fingerprintText,
        makeCacheKey,
        buildChatCompletionsUrl,
        buildGeminiGenerateContentUrl,
        openAiCompatibleBaseUrl,
        normalizeTranslationServices,
        describeTranslationService,
        buildModelsUrl,
        findTranslationService: findServiceById,
        pickModelId,
        migrateLegacyTranslationServices,
        planTranslationServices,
        resolveTranslationConfig
    });
});
