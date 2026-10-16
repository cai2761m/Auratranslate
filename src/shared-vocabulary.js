// Local vocabulary format shared by the background, content script and settings.
(function registerSharedModule(root, register) {
    if (typeof module !== "undefined" && module.exports) module.exports = register;
    else register(root.YTBTShared || (root.YTBTShared = {}));
})(globalThis, function (Shared) {
    "use strict";
    // Deliberately outside ytbt:, whose keys are disposable translation caches.
    const VOCABULARY_STORAGE_KEY = "auraVocabulary";
    const VOCABULARY_MAX_ENTRIES = 5000;
    const SELECTION_MAX_CHARS = 3000;

    function vocabularyText(value, limit) {
        return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, limit) : "";
    }

    function vocabularySourceUrl(value) {
        try {
            const url = new URL(typeof value === "string" ? value.slice(0, 2048) : "");
            if (!["http:", "https:"].includes(url.protocol)) return "";
            url.username = "";
            url.password = "";
            return url.href;
        } catch (_) { return ""; }
    }

    function normalizeVocabularyEntry(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        if (typeof value.sourceText !== "string" || value.sourceText.length > SELECTION_MAX_CHARS ||
            typeof value.translatedText !== "string" || value.translatedText.length > 12000) return null;
        const sourceText = vocabularyText(value.sourceText, SELECTION_MAX_CHARS).replace(/\s+/g, " ");
        const translatedText = vocabularyText(value.translatedText, 12000);
        if (!sourceText || !translatedText) return null;
        const language = (code, fallback) => typeof code === "string" && /^(?:auto|[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2})$/i.test(code) ? code : fallback;
        const now = Date.now();
        const date = (n) => Number.isSafeInteger(n) && n > 0 && n <= now + 86400000 ? n : now;
        return {
            id: typeof value.id === "string" && /^[a-z0-9_-]{1,100}$/i.test(value.id) ? value.id : "",
            sourceText, translatedText,
            sourceLanguage: language(value.sourceLanguage, "auto"),
            targetLanguage: language(value.targetLanguage === "auto" ? "" : value.targetLanguage, "zh-CN"),
            contextText: vocabularyText(value.contextText, 1800),
            sourceUrl: vocabularySourceUrl(value.sourceUrl),
            sourceTitle: vocabularyText(value.sourceTitle, 300),
            notes: vocabularyText(value.notes, 2000),
            learned: value.learned === true,
            createdAt: date(value.createdAt),
            updatedAt: date(value.updatedAt),
        };
    }

    function vocabularyIdentity(entry) {
        const canonical = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
        // Keep different senses of the same word as separate entries.
        return JSON.stringify([canonical(entry.sourceText), entry.sourceLanguage.toLowerCase(),
            entry.targetLanguage.toLowerCase(), canonical(entry.translatedText)]);
    }

    Object.assign(Shared, {VOCABULARY_STORAGE_KEY, VOCABULARY_MAX_ENTRIES, SELECTION_MAX_CHARS,
        vocabularySourceUrl, normalizeVocabularyEntry, vocabularyIdentity});
});
