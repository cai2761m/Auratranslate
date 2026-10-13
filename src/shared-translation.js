// Provider JSON response parsing and recovery.
// Browser: register before shared.js. Node: shared.js calls this factory.
(function registerSharedModule(root, register) {
    if (typeof module !== "undefined" && module.exports) module.exports = register;
    else register(root.YTBTShared || (root.YTBTShared = {}));
})(globalThis, function (Shared) {
    "use strict";

    function parseLooseJsonContent(content) {
        if (typeof content !== "string") {
            return content;
        }

        const raw = content.trim();
        try {
            return JSON.parse(raw);
        } catch (error) {
            // Some providers still wrap JSON in markdown fences when JSON mode is
            // disabled or unsupported.
        }

        const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        if (fenced) {
            return JSON.parse(fenced[1].trim());
        }

        const firstObject = raw.indexOf("{");
        const lastObject = raw.lastIndexOf("}");
        if (firstObject >= 0 && lastObject > firstObject) {
            return JSON.parse(raw.slice(firstObject, lastObject + 1));
        }

        const firstArray = raw.indexOf("[");
        const lastArray = raw.lastIndexOf("]");
        if (firstArray >= 0 && lastArray > firstArray) {
            return JSON.parse(raw.slice(firstArray, lastArray + 1));
        }

        return JSON.parse(raw);
    }

    function unescapeJsonishString(value) {
        return String(value || "").replace(/\\(["\\/bfnrt])/g, (match, escaped) => {
            if (escaped === "b") {
                return "\b";
            }
            if (escaped === "f") {
                return "\f";
            }
            if (escaped === "n") {
                return "\n";
            }
            if (escaped === "r") {
                return "\r";
            }
            if (escaped === "t") {
                return "\t";
            }
            return escaped;
        });
    }

    function extractJsonishStringProperty(fragment, key) {
        const pattern = new RegExp(`"${key}"\\s*:\\s*"`, "i");
        const match = pattern.exec(fragment);
        if (!match) {
            return "";
        }

        const start = match.index + match[0].length;
        for (let index = start; index < fragment.length; index += 1) {
            if (fragment[index] !== '"' || fragment[index - 1] === "\\") {
                continue;
            }
            const rest = fragment.slice(index + 1).trimStart();
            if (!rest || rest[0] === "}" || rest[0] === "]" || rest[0] === ",") {
                return unescapeJsonishString(fragment.slice(start, index));
            }
        }

        return unescapeJsonishString(fragment.slice(start));
    }

    function parseJsonishTranslationItems(content) {
        const raw = String(content || "");
        const items = [];
        const itemRe = /\{[\s\S]*?"id"\s*:\s*"?([^",}\]\s]+)"?[\s\S]*?\}/g;
        let match;
        while ((match = itemRe.exec(raw))) {
            const fragment = match[0];
            const id = String(match[1] || "").trim();
            const translatedText = Shared.normalizeSubtitleText(
                extractJsonishStringProperty(fragment, "translatedText") ||
                extractJsonishStringProperty(fragment, "translation") ||
                extractJsonishStringProperty(fragment, "text") ||
                extractJsonishStringProperty(fragment, "zh")
            );
            const displaySourceText = Shared.formatDisplaySourceText(
                extractJsonishStringProperty(fragment, "displaySourceText") ||
                extractJsonishStringProperty(fragment, "punctuatedSourceText") ||
                extractJsonishStringProperty(fragment, "sourceDisplayText")
            );
            if (id && translatedText) {
                const item = {id, translatedText};
                if (displaySourceText) {
                    item.displaySourceText = displaySourceText;
                }
                items.push(item);
            }
        }
        return items;
    }

    function parseDeepSeekTranslationContent(content) {
        let parsed;
        try {
            parsed = parseLooseJsonContent(content);
        } catch (error) {
            const recovered = parseJsonishTranslationItems(content);
            if (recovered.length) {
                return recovered;
            }
            throw new Error(`Invalid translation JSON: ${error && error.message ? error.message : String(error)}`);
        }
        const items = [];

        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                const id = item && item.id != null ? String(item.id) : "";
                const translatedText = Shared.normalizeSubtitleText(
                    item && (item.translatedText || item.translation || item.text || item.zh)
                );
                const displaySourceText = Shared.formatDisplaySourceText(
                    item && (item.displaySourceText || item.punctuatedSourceText || item.sourceDisplayText)
                );
                if (id && translatedText) {
                    const result = {id, translatedText};
                    if (displaySourceText) {
                        result.displaySourceText = displaySourceText;
                    }
                    items.push(result);
                }
            }
            return items;
        }

        if (!parsed || typeof parsed !== "object") {
            return items;
        }

        const list = Array.isArray(parsed.items)
            ? parsed.items
            : Array.isArray(parsed.translations)
                ? parsed.translations
                : null;

        if (list) {
            return parseDeepSeekTranslationContent(list);
        }

        for (const [id, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
                const translatedText = Shared.normalizeSubtitleText(value);
                if (translatedText) {
                    items.push({id: String(id), translatedText});
                }
            }
        }

        return items;
    }

    const PAGE_CONTEXT_CHAR_LIMIT = 32000;
    const PAGE_CONTEXT_BLOCK_LIMIT = 240;

    function contextText(value, limit) {
        return typeof value === "string"
            ? value.replace(/\s+/g, " ").trim().slice(0, limit).replace(/[\uD800-\uDBFF]$/, "") : "";
    }

    // Keep every collected paragraph represented, including the end of long pages.
    // The fingerprint covers the full source, even when the model receives excerpts.
    function buildImmersivePageContext({title, blocks} = {}) {
        const sources = (Array.isArray(blocks) ? blocks : []).slice(0, PAGE_CONTEXT_BLOCK_LIMIT)
            .map((block) => ({text: contextText(block && block.text, Infinity), heading: contextText(block && block.heading, 180)}))
            .filter((block) => block.text);
        const normalizedTitle = contextText(title, 300);
        const fullSource = JSON.stringify([normalizedTitle, sources]);
        let remaining = PAGE_CONTEXT_CHAR_LIMIT;
        const sampled = sources.map((block, index) => {
            const budget = Math.max(1, Math.floor(remaining / (sources.length - index)));
            const heading = contextText(block.heading, Math.floor(budget / 4));
            const text = contextText(block.text, budget - heading.length);
            remaining -= text.length + heading.length;
            return {text, heading};
        });
        return {
            title: normalizedTitle,
            contentFingerprint: `${fullSource.length}:${Shared.fingerprintText(fullSource)}`,
            sampled: sources.some((block, index) => block.text !== sampled[index].text || block.heading !== sampled[index].heading),
            blocks: sampled
        };
    }

    function normalizeImmersivePageContext(value) {
        if (!value || !Array.isArray(value.blocks)) return null;
        const normalized = buildImmersivePageContext(value);
        if (!normalized.blocks.length) return null;
        // Preserve the full-source identity carried by the page's bounded snapshot.
        if (typeof value.contentFingerprint === "string" && /^\d+:[a-z0-9]{1,10}$/.test(value.contentFingerprint)) {
            normalized.contentFingerprint = value.contentFingerprint;
        }
        normalized.sampled = normalized.sampled || value.sampled === true;
        return normalized;
    }

    function parseImmersiveContextContent(content, pageContext) {
        const parsed = parseLooseJsonContent(content);
        if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim() || !Array.isArray(parsed.terms)) {
            throw new Error("页面上下文分析返回了无效结果，请更换模型或关闭深度理解后重试。");
        }
        const source = [pageContext.title, ...pageContext.blocks.map((block) => block.text)].join(" ").toLowerCase();
        const terms = [];
        const senses = new Map();
        for (const entry of parsed.terms.slice(0, 60)) {
            const term = {
                source: contextText(entry && entry.source, 100),
                target: contextText(entry && entry.target, 100),
                meaning: contextText(entry && entry.meaning, 240)
            };
            if (!term.source || !term.target || !term.meaning || !source.includes(term.source.toLowerCase())) continue;
            if (/\[\[|<[^>]*>/.test(term.source + term.target)) continue;
            const key = JSON.stringify([term.source.toLowerCase(), term.meaning.toLowerCase()]);
            if (senses.has(key)) {
                if (senses.get(key) !== term.target) throw new Error("页面术语表包含同义冲突，请更换模型后重试。");
                continue;
            }
            senses.set(key, term.target);
            terms.push(term);
        }
        return {summary: contextText(parsed.summary, 1600), terms};
    }

    Object.assign(Shared, {
        parseLooseJsonContent, parseDeepSeekTranslationContent,
        buildImmersivePageContext, normalizeImmersivePageContext, parseImmersiveContextContent
    });
});
