// Webpage translation identities, cache hydration, and selected provider routing.
// Classic scripts share the dedicated background scope; background.js loads them
// synchronously in Chrome, and manifest.json supplies the same order in Firefox.
const inFlightImmersiveContexts = new Map();
const completedImmersiveContexts = new Map();
const failedImmersiveContexts = new Map();
const IMMERSIVE_CONTEXT_CACHE_ID = "__pageContext";

async function handleImmersiveTranslate(message) {
    const settings = await storageGet(Core.DEFAULT_SETTINGS);
    const preferences = message.preferences || settings;
    const targetLanguage = preferences.immersiveTargetLanguage || settings.targetLanguage || Core.DEFAULT_SETTINGS.targetLanguage;
    const sourceLanguage = preferences.immersiveSourceLanguage || "auto";
    const service = preferences.immersiveTranslationService || "ai";
    const pageContext = service === "ai" &&
        (preferences.immersiveDeepContextEnabled ?? settings.immersiveDeepContextEnabled) !== false
        ? Core.normalizeImmersivePageContext(message.pageContext) : null;
    const translationConfig = Core.resolveTranslationConfig(settings, "immersive");
    if (["google-free", "bing-free"].includes(service)) {
        // A selected built-in service translates directly, without an AI fallback.
        Object.assign(translationConfig, {
            provider: service,
            apiKey: "",
            model: "",
            chatCompletionsUrl: "",
            generateContentUrl: ""
        });
    }

    const endpointUrl =
        translationConfig.apiStyle === "gemini"
            ? translationConfig.generateContentUrl
            : translationConfig.chatCompletionsUrl;
    const cues = (Array.isArray(message.items) ? message.items : [])
        .map((item) => ({
            id: item && item.id != null ? String(item.id) : "",
            sourceText: item && item.formattedText
                ? String(item.formattedText).replace(/\s+/g, " ").trim()
                : Core.normalizeSubtitleText(item && item.sourceText),
            plainText: Core.normalizeSubtitleText(item && item.sourceText),
            hasFormatting: Boolean(item && item.formattedText),
            contextText: typeof (item && item.contextText) === "string" ? item.contextText.slice(0, 1800) : ""
        }))
        .filter((item) => item.id && item.sourceText);

    if (!cues.length) {
        return {
            type: "IMMERSIVE_TRANSLATE_RESULT",
            ok: true,
            items: [],
            errors: []
        };
    }

    // Stable text IDs survive DOM reordering, changed batch boundaries and
    // repeated headings in the page outline. Do not include credentials or the
    // URL fragment; keep different pages and translation profiles isolated.
    const cacheKey = `ytbt:immersive:${await immersiveFingerprint(JSON.stringify([
        String(message.pageUrl || "").split("#")[0],
        translationConfig.provider, endpointUrl, translationConfig.model,
        sourceLanguage, targetLanguage, settings.cacheVersion || "1", "immersive-v1",
        ...(pageContext ? ["deep-context-v1", pageContext] : [])
    ]))}`;
    const identities = await Promise.all(cues.map(async (cue) => ({
        // Identical short text can mean different things under different headings.
        // Deep-context results must include local semantic context in their identity.
        ...cue, cacheId: await immersiveFingerprint(pageContext ? JSON.stringify([cue.sourceText, cue.contextText]) : cue.sourceText),
        plainId: await immersiveFingerprint(pageContext ? JSON.stringify([cue.plainText, cue.contextText]) : cue.plainText)
    })));
    const uniqueCues = new Map(identities.map((cue) => [cue.cacheId, {...cue, id: cue.cacheId}]));
    const cache = await storageGet({[cacheKey]: {items: {}}});
    const storedItems = cache[cacheKey] && cache[cacheKey].items || {};
    const results = new Map();
    const missing = [];
    for (const cue of uniqueCues.values()) {
        const stored = storedItems[cue.id];
        const legacy = storedItems[cue.plainId];
        if (usableImmersiveCache(stored, cue.sourceText, cue.hasFormatting)) {
            results.set(cue.id, {
                translatedText: stored.translatedText,
                translationProvider: stored.translationProvider,
                cached: true
            });
        } else if (!/\[\[YTBT_MATH_\d+\]\]/.test(cue.sourceText) && usableImmersiveCache(legacy, cue.plainText, cue.hasFormatting)) {
            results.set(cue.id, {
                translatedText: legacy.translatedText,
                translationProvider: legacy.translationProvider,
                cached: true
            });
        } else if (message.cacheOnly === true && completedCueTranslations.has(inFlightCueKey(cacheKey, cue.id, cue.sourceText))) {
            // A successful provider response is still usable while storage is slow
            // or full. Cache probes must never call the provider to recover it.
            results.set(cue.id, {
                ...completedCueTranslations.get(inFlightCueKey(cacheKey, cue.id, cue.sourceText)),
                cached: true
            });
        } else {
            missing.push(cue);
        }
    }

    if (message.cacheOnly !== true && missing.length) {
        const builtInProvider = ["google-free", "bing-free"].includes(service) ? service : "off";
        if (builtInProvider === "off" && (!translationConfig.apiKey || !endpointUrl || !translationConfig.model)) {
            throw new Error(`${translationConfig.providerLabel} ${!translationConfig.apiKey ? "API Key" : "base URL or model"} is not configured.`);
        }
        // All concurrent paragraph requests wait for the same immutable plan.
        // Cache-only probes never generate a plan or contact the provider.
        const maxItems = Number(settings.translationCacheMaxItems) || Core.DEFAULT_CACHE_MAX_ITEMS;
        const pageContextPlan = pageContext ? await resolveImmersiveContext({
            cacheKey, storedItems, pageContext, translationConfig, sourceLanguage, targetLanguage, maxItems,
            contextRunId: typeof message.contextRunId === "string" ? message.contextRunId.slice(0, 100) : ""
        }) : null;
        const translatedItems = await translateMissingCues({
            cacheKey, translationConfig, targetLanguage, sourceLanguage,
            asrCorrectionEnabled: false,
            cues: missing,
            mode: "immersive",
            pageContextPlan,
            translateCues: builtInProvider === "off" ? undefined : (request, retain) =>
                translateImmersiveBuiltIn(request, builtInProvider, retain),
            async persistItems(items) {
                const newItems = {};
                for (const item of items) {
                    const cue = uniqueCues.get(String(item.id));
                    if (cue && item.translatedText) {
                        newItems[cue.id] = {
                            sourceText: cue.sourceText, translatedText: item.translatedText,
                            translationProvider: item.translationProvider || translationConfig.provider,
                            googleTranslationVersion: item.googleTranslationVersion,
                            bingTranslationVersion: item.bingTranslationVersion
                        };
                    }
                }
                await persistTranslationCache({
                    cacheKey,
                    cacheValue: {items: newItems, updatedAt: Date.now()},
                    maxItems,
                    maxItemsPerKey: Math.max(1, Math.min(pageContext ? 241 : 240, maxItems))
                });
            }
        });
        for (const item of translatedItems) results.set(String(item.id), item);
    }

    return {
        type: "IMMERSIVE_TRANSLATE_RESULT",
        ok: true,
        items: identities.filter((cue) => results.has(cue.cacheId)).map((cue) => ({
            ...results.get(cue.cacheId), id: cue.id
        })),
        errors: []
    };
}

async function resolveImmersiveContext(request) {
    const {cacheKey, storedItems, pageContext, maxItems} = request;
    const stored = storedItems[IMMERSIVE_CONTEXT_CACHE_ID];
    if (stored && stored.version === 1) {
        try {
            return Core.parseImmersiveContextContent(stored.plan, pageContext);
        } catch (_) {
            // An invalid local plan must not contaminate every paragraph.
        }
    }
    const failureKey = `${cacheKey}:${request.contextRunId}`;
    const failed = failedImmersiveContexts.get(failureKey);
    if (failed) throw failed;
    const existing = inFlightImmersiveContexts.get(cacheKey);
    if (existing) return existing;
    const pending = (async () => {
        let plan = completedImmersiveContexts.get(cacheKey);
        if (!plan) {
            // One analysis attempt: ambiguous failures must not rebill automatically.
            try {
                plan = await translateBatch({...request, cues: [], mode: "immersive-context"});
            } catch (error) {
                // A very fast failure can finish before the other concurrently
                // scheduled requests reach this function. Share it for this run;
                // an explicit click starts a new run and can try again.
                failedImmersiveContexts.set(failureKey, error);
                while (failedImmersiveContexts.size > 32) failedImmersiveContexts.delete(failedImmersiveContexts.keys().next().value);
                throw error;
            }
            completedImmersiveContexts.set(cacheKey, plan);
            while (completedImmersiveContexts.size > 32) completedImmersiveContexts.delete(completedImmersiveContexts.keys().next().value);
        }
        // Count the plan as one cache item so normal capacity limits and cache
        // clearing also apply to pages whose paragraph translation later fails.
        await persistTranslationCache({
            cacheKey,
            cacheValue: {items: {[IMMERSIVE_CONTEXT_CACHE_ID]: {version: 1, plan}}},
            maxItems,
            maxItemsPerKey: Math.max(1, Math.min(241, maxItems))
        });
        return plan;
    })();
    inFlightImmersiveContexts.set(cacheKey, pending);
    try {
        return await pending;
    } finally {
        if (inFlightImmersiveContexts.get(cacheKey) === pending) inFlightImmersiveContexts.delete(cacheKey);
    }
}

async function immersiveFingerprint(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function usableImmersiveCache(entry, sourceText, hasFormatting) {
    if (!entry || entry.sourceText !== sourceText || typeof entry.translatedText !== "string" || !entry.translatedText.trim()) return false;
    if (/\[\[YTBT_MATH_\d+\]\]/.test(sourceText)) {
        try {
            restoreGoogleFormatting(sourceText, entry.translatedText);
        } catch (_) {
            return false;
        }
    }
    // Only obsolete free-translation formatting results need replacing. Preserve AI and
    // plain-text caches, and never initiate a request during cache-only probes.
    if (!hasFormatting) return true;
    if (entry.translationProvider === "google-free") return entry.googleTranslationVersion === 2;
    if (entry.translationProvider === "bing-free") return entry.bingTranslationVersion === 1;
    return true;
}

// A keyless provider is called only when selected directly in the popup.
async function translateImmersiveBuiltIn(request, provider, retain) {
    let items = [];
    const deadline = Date.now() + 45000;
    for (const cue of request.cues) {
        let translatedText;
        try {
            translatedText = provider === "bing-free"
                ? await translateBingCue(cue.sourceText, request, deadline, cue.hasFormatting)
                : await translateGoogleCue(cue.sourceText, request, deadline, cue.hasFormatting);
        } catch (error) {
            // Earlier successes are already cached. Return them so the page can render
            // partial progress; a subsequent click only requests missing paragraphs.
            if (items.length) return items;
            const providerLabel = provider === "bing-free" ? "Bing" : "Google";
            const failure = new Error(`${providerLabel} 翻译失败：${error.message}`);
            failure.requestMayHaveReachedProvider = Boolean(error.requestMayHaveReachedProvider);
            throw failure;
        }
        const bing = provider === "bing-free";
        const item = {
            id: cue.id, translatedText, translationProvider: provider,
            ...(bing ? {bingTranslationVersion: 1} : {googleTranslationVersion: 2})
        };
        await retain([item]);
        items.push(item);
    }
    return items;
}

// Translate whole paragraphs, including inline identifiers and formatting.
// Only oversized paragraphs are split, outside formatting and preferably at
// sentence boundaries. No fragment may separate code from its surrounding words
// merely because a code/link/emphasis element starts or ends there.
