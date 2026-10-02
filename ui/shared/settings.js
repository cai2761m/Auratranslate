export const Core = globalThis.YTBTCore;

export function api(invoke) {
    return new Promise((resolve, reject) =>
        invoke((result) => {
            const error = globalThis.chrome.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
        }),
    );
}

export const storageGet = (defaults) =>
    api((done) => chrome.storage.local.get(defaults, done));
export const storageSet = (values) =>
    api((done) => chrome.storage.local.set(values, done));
export const storageRemove = (keys) =>
    api((done) => chrome.storage.local.remove(keys, done));
export const modelLabel = (model) =>
    model.displayName ? `${model.id} · ${model.displayName}` : model.id;

export const THEME_LABELS = {system: "跟随系统", light: "亮色", dark: "暗色"};
export const nextTheme = (theme) =>
    ({system: "light", light: "dark", dark: "system"})[theme] || "light";
// Repaints the page immediately; persisting the choice is the caller's job.
// theme-boot.js is absent in jsdom tests, so the call is optional.
export const applyTheme = (theme) => globalThis.AuraTheme?.apply(theme);

export function normalizeSelection(settings) {
    const services = settings.translationServices;
    const realtime = Core.findTranslationService(
        services,
        settings.translationServiceId,
    );
    const immersive = Core.findTranslationService(
        services,
        settings.immersiveTranslationServiceId,
    );
    return {
        ...settings,
        translationServiceId: realtime?.id || "",
        translationModelId: Core.pickModelId(realtime, settings.translationModelId),
        immersiveTranslationServiceId: immersive?.id || "",
        immersiveTranslationModelId: Core.pickModelId(
            immersive,
            settings.immersiveTranslationModelId,
        ),
    };
}

export function hydrateSettings(saved) {
    const plan = Core.planTranslationServices(saved);
    return normalizeSelection({
        ...Core.DEFAULT_SETTINGS,
        ...saved,
        translationServices: plan.services,
        translationServiceId: plan.translationServiceId,
        translationModelId: plan.translationModelId,
        immersiveTranslationServiceId: plan.immersiveTranslationServiceId,
        immersiveTranslationModelId: plan.immersiveTranslationModelId,
        fontScale: Core.normalizeFontScale(saved.fontScale),
        immersiveDisabledSites: Core.normalizeDisabledSites(saved.immersiveDisabledSites),
        uiTheme: Core.normalizeUiTheme(saved.uiTheme),
    });
}

// Only write fields owned by the settings page. Keep legacy mirrors readable by
// older extension versions without overwriting popup preferences or cache data.
export function settingsPatch(settings) {
    const s = normalizeSelection(settings);
    const realtime = Core.findTranslationService(
        s.translationServices,
        s.translationServiceId,
    );
    const immersive = Core.findTranslationService(
        s.translationServices,
        s.immersiveTranslationServiceId,
    );
    const fields = [
        "translationServiceId",
        "translationModelId",
        "immersiveTranslationServiceId",
        "immersiveTranslationModelId",
        "translationJsonResponse",
        "llmSentenceSegmentationEnabled",
        "asrCorrectionEnabled",
        "showOriginalTechnicalTerms",
        "sourceLanguage",
        "targetLanguage",
        "subtitleEnabled",
    ];
    return {
        ...Object.fromEntries(fields.map((key) => [key, s[key]])),
        translationServices: Core.normalizeTranslationServices(
            s.translationServices,
        ),
        translationProvider: "custom",
        translationApiKey: realtime?.apiKey.trim() || "",
        translationBaseUrl: realtime?.baseUrl.trim() || "",
        translationModel: s.translationModelId,
        immersiveTranslationProvider: immersive ? "custom" : "",
        immersiveTranslationApiKey: immersive?.apiKey.trim() || "",
        immersiveTranslationBaseUrl: immersive?.baseUrl.trim() || "",
        immersiveTranslationModel: s.immersiveTranslationModelId,
        immersiveTranslationJsonResponse: immersive
            ? s.immersiveTranslationJsonResponse !== false
            : true,
        fontScale: Core.normalizeFontScale(s.fontScale),
        immersiveDisabledSites: Core.normalizeDisabledSites(s.immersiveDisabledSites),
        uiTheme: Core.normalizeUiTheme(s.uiTheme),
        subtitleTranslationMode:
            s.subtitleTranslationMode === "full" ? "full" : "economy",
        subtitleLookAheadMinutes: Number(s.subtitleLookAheadMinutes || 2),
    };
}

export function popupSelection(settings) {
    const plan = Core.planTranslationServices(settings);
    const dedicated = Core.findTranslationService(
        plan.services,
        plan.immersiveTranslationServiceId,
    );
    const service =
        dedicated ||
        Core.findTranslationService(plan.services, plan.translationServiceId) ||
        plan.services[0];
    return {
        plan,
        service,
        model: Core.pickModelId(
            service,
            plan.migrated
                ? dedicated
                    ? plan.immersiveTranslationModelId
                    : plan.translationModelId
                : dedicated
                    ? settings.immersiveTranslationModelId
                    : settings.translationModelId,
        ),
    };
}

export function popupServicePatch(settings, id, requestedModel) {
    const {plan, service: current, model} = popupSelection(settings);
    const service = Core.findTranslationService(plan.services, id);
    if (!service) return null;
    const modelId = Core.pickModelId(
        service,
        requestedModel ?? (current?.id === id ? model : ""),
    );
    return {
        ...(plan.migrated
            ? {
                translationServices: plan.services,
                translationServiceId: plan.translationServiceId,
                translationModelId: plan.translationModelId,
            }
            : {}),
        immersiveTranslationService: "ai",
        immersiveTranslationServiceId: id,
        immersiveTranslationModelId: modelId,
        immersiveTranslationProvider: "custom",
        immersiveTranslationApiKey: service.apiKey,
        immersiveTranslationBaseUrl: service.baseUrl,
        immersiveTranslationModel: modelId,
        immersiveTranslationJsonResponse: Core.resolveTranslationConfig(
            settings,
            "immersive",
        ).useJsonResponseFormat,
    };
}
