// Subtitle fragment merging and sentence segmentation.
// Browser: register before shared.js. Node: shared.js calls this factory.
(function registerSharedModule(root, register) {
    if (typeof module !== "undefined" && module.exports) module.exports = register;
    else register(root.YTBTShared || (root.YTBTShared = {}));
})(globalThis, function (Shared) {
    "use strict";

    const SENTENCE_END_RE = /[.!?。！？]["')\]]?$/;
    const DANGLING_END_WORDS = new Set([
        ...Shared.DISPLAY_PREPOSITION_WORDS,
        ...Shared.DISPLAY_PRONOUN_WORDS,
        "a",
        "an",
        "and",
        "any",
        "are",
        "as",
        "be",
        "because",
        "been",
        "being",
        "but",
        "can",
        "could",
        "did",
        "do",
        "does",
        "each",
        "every",
        "few",
        "had",
        "has",
        "have",
        "her",
        "his",
        "if",
        "is",
        "its",
        "may",
        "might",
        "more",
        "most",
        "much",
        "must",
        "my",
        "or",
        "our",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "these",
        "this",
        "those",
        "too",
        "very",
        "was",
        "were",
        "when",
        "which",
        "while",
        "who",
        "will",
        "would",
        "your"
    ]);
    const CONTINUATION_START_WORDS = new Set([
        ...Shared.DISPLAY_PREPOSITION_WORDS,
        "and",
        "because",
        "but",
        "if",
        "or",
        "so",
        "than",
        "that",
        "then",
        "though",
        "until",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whose"
    ]);
    const TECHNICAL_MODIFIER_WORDS = new Set([
        "array",
        "average",
        "binary",
        "black",
        "breadth",
        "depth",
        "double",
        "doubly",
        "first",
        "hash",
        "linked",
        "priority",
        "red",
        "singly",
        "worst"
    ]);
    const TECHNICAL_HEAD_WORDS = new Set([
        "graph",
        "heap",
        "list",
        "map",
        "node",
        "queue",
        "search",
        "stack",
        "table",
        "tree"
    ]);

    function createMergedCue(rawCues, startIndex, endIndex, text) {
        const first = rawCues[startIndex];
        const last = rawCues[endIndex];
        return {
            id: String(startIndex),
            startMs: first.startMs,
            endMs: last.endMs,
            sourceText: text,
            displaySourceText: Shared.formatDisplaySourceText(text),
            translatedText: "",
            status: "pending"
        };
    }

    function lastSubtitleWord(value) {
        const words = Shared.normalizeSubtitleText(value).split(/\s+/).filter(Boolean);
        return words.length ? Shared.cleanDisplayWord(words[words.length - 1]) : "";
    }

    function firstSubtitleWord(value) {
        const words = Shared.normalizeSubtitleText(value).split(/\s+/).filter(Boolean);
        return words.length ? Shared.cleanDisplayWord(words[0]) : "";
    }

    function isLikelyCompoundContinuation(lastWord, firstWord) {
        if (!lastWord || !firstWord) {
            return false;
        }

        if (TECHNICAL_MODIFIER_WORDS.has(lastWord) && TECHNICAL_HEAD_WORDS.has(firstWord)) {
            return true;
        }

        if ((lastWord === "doubly" || lastWord === "singly") && firstWord === "linked") {
            return true;
        }

        return /ly$/.test(lastWord) && firstWord === "linked";
    }

    function joinSubtitleFragments(left, right, elideBoundaryPunctuation) {
        let leftText = String(left || "").trim();
        let rightText = String(right || "").trim();
        if (elideBoundaryPunctuation) {
            leftText = leftText.replace(/[.!?]+(["')\]]*)$/, "$1").trim();
            rightText = rightText.replace(/^([A-Z])(?=[a-z])/, (match) => match.toLowerCase());
        }
        return `${leftText} ${rightText}`.replace(/\s+/g, " ").trim();
    }

    function shouldKeepJoiningFragments(groupText, nextText) {
        if (!groupText) {
            return false;
        }

        const lastWord = lastSubtitleWord(groupText);
        const firstWord = firstSubtitleWord(nextText);
        const compoundContinuation = isLikelyCompoundContinuation(lastWord, firstWord);
        if (SENTENCE_END_RE.test(groupText)) {
            return compoundContinuation;
        }

        return (
            compoundContinuation ||
            DANGLING_END_WORDS.has(lastWord) ||
            CONTINUATION_START_WORDS.has(firstWord)
        );
    }

    function mergeCaptionFragments(cues, options) {
        const settings = Object.assign(
            {
                maxGapMs: 800,
                maxDurationMs: 12000,
                maxChars: 220,
                hardMaxDurationMs: 24000,
                hardMaxChars: 420
            },
            options || {}
        );

        const normalized = (Array.isArray(cues) ? cues : [])
            .map((cue) => ({
                startMs: Number(cue.startMs),
                endMs: Number(cue.endMs),
                sourceText: Shared.normalizeSubtitleText(cue.sourceText || cue.displaySourceText || "")
            }))
            .filter((cue) => cue.sourceText && Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs))
            .sort((left, right) => left.startMs - right.startMs);

        const merged = [];
        let groupStart = -1;
        let groupEnd = -1;
        let groupText = "";

        function flush() {
            if (groupStart >= 0 && groupText) {
                merged.push(createMergedCue(normalized, groupStart, groupEnd, groupText));
            }
            groupStart = -1;
            groupEnd = -1;
            groupText = "";
        }

        for (let index = 0; index < normalized.length; index += 1) {
            const cue = normalized[index];
            if (groupStart < 0) {
                groupStart = index;
                groupEnd = index;
                groupText = cue.sourceText;
                continue;
            }

            const previous = normalized[groupEnd];
            const gapMs = cue.startMs - previous.endMs;
            const plainCombinedText = joinSubtitleFragments(groupText, cue.sourceText, false);
            const combinedDuration = cue.endMs - normalized[groupStart].startMs;
            const exceedsSoftLimit =
                combinedDuration > settings.maxDurationMs ||
                plainCombinedText.length > settings.maxChars;
            const exceedsHardLimit =
                combinedDuration > settings.hardMaxDurationMs ||
                plainCombinedText.length > settings.hardMaxChars;
            const shouldKeepJoining =
                exceedsSoftLimit && !exceedsHardLimit && shouldKeepJoiningFragments(groupText, cue.sourceText);
            const sentenceEndBefore = SENTENCE_END_RE.test(groupText);
            const shouldJoinAfterSentenceEnd =
                sentenceEndBefore &&
                !exceedsHardLimit &&
                gapMs <= settings.maxGapMs &&
                shouldKeepJoiningFragments(groupText, cue.sourceText);
            const shouldBreakBefore =
                gapMs > settings.maxGapMs ||
                (exceedsSoftLimit && !shouldKeepJoining) ||
                (sentenceEndBefore && !shouldJoinAfterSentenceEnd);

            if (shouldBreakBefore) {
                flush();
                groupStart = index;
                groupEnd = index;
                groupText = cue.sourceText;
            } else {
                groupEnd = index;
                groupText = joinSubtitleFragments(groupText, cue.sourceText, shouldJoinAfterSentenceEnd);
            }

        }

        flush();
        return merged.map((cue, index) => Object.assign({}, cue, {id: String(index)}));
    }

    function splitCaptionCuesAtSentenceBoundaries(cues) {
        const result = [];


        for (const cue of Array.isArray(cues) ? cues : []) {
            const sourceText = Shared.normalizeSubtitleText(cue && cue.sourceText);
            const startMs = Number(cue && cue.startMs);
            const endMs = Number(cue && cue.endMs);
            if (!sourceText || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
                continue;
            }

            const parts = captionSentences(sourceText);

            const durationMs = endMs - startMs;
            let previousPartEndMs = startMs;
            for (let index = 0; index < parts.length; index += 1) {
                const part = parts[index];
                const partStartMs = previousPartEndMs;
                const estimatedEndMs =
                    index === parts.length - 1
                        ? endMs
                        : startMs + Math.round((durationMs * part.endOffset) / sourceText.length);
                const remainingParts = parts.length - index - 1;
                const latestEndMs = endMs - remainingParts;
                const partEndMs = Math.max(
                    partStartMs + 1,
                    Math.min(latestEndMs, estimatedEndMs)
                );
                result.push({
                    id: String(result.length),
                    startMs: partStartMs,
                    endMs: Math.max(partStartMs + 1, partEndMs),
                    sourceText: part.text,
                    displaySourceText: part.text,
                    translatedText: "",
                    status: "pending"
                });
                previousPartEndMs = partEndMs;
            }
        }

        return result;
    }

    function parseSentenceSegmentationContent(content, cues) {
        let parsed;
        try {
            parsed = Shared.parseLooseJsonContent(content);
        } catch (error) {
            throw new Error(
                `Invalid sentence segmentation JSON: ${error && error.message ? error.message : String(error)}`
            );
        }

        const sourceCues = Array.isArray(cues) ? cues : [];
        const sourceIds = sourceCues.map((cue) => String(cue && cue.id != null ? cue.id : ""));
        const idToIndex = new Map(sourceIds.map((id, index) => [id, index]));
        const list = Array.isArray(parsed)
            ? parsed
            : parsed && Array.isArray(parsed.groups)
                ? parsed.groups
                : parsed && Array.isArray(parsed.items)
                    ? parsed.items
                    : parsed && Array.isArray(parsed.segments)
                        ? parsed.segments
                        : [];

        if (!sourceCues.length || !list.length) {
            throw new Error("Sentence segmentation did not contain usable groups.");
        }

        const groups = [];
        let expectedStartIndex = 0;
        for (const item of list) {
            const ids = item && Array.isArray(item.ids) ? item.ids.map(String) : [];
            const startId = String(
                item && (item.startId != null ? item.startId : item.start_id != null ? item.start_id : ids[0])
            );
            const endId = String(
                item &&
                (item.endId != null
                    ? item.endId
                    : item.end_id != null
                        ? item.end_id
                        : ids.length
                            ? ids[ids.length - 1]
                            : startId)
            );
            const startIndex = idToIndex.get(startId);
            const endIndex = idToIndex.get(endId);

            if (
                !Number.isInteger(startIndex) ||
                !Number.isInteger(endIndex) ||
                startIndex !== expectedStartIndex ||
                endIndex < startIndex
            ) {
                throw new Error("Sentence segmentation groups must cover consecutive cue ids in order.");
            }

            if (ids.length) {
                const expectedIds = sourceIds.slice(startIndex, endIndex + 1);
                if (ids.length !== expectedIds.length || ids.some((id, index) => id !== expectedIds[index])) {
                    throw new Error("Sentence segmentation group ids must be consecutive.");
                }
            }

            const rawDisplaySourceText = Shared.normalizeSubtitleText(
                item &&
                (item.displaySourceText ||
                    item.punctuatedSourceText ||
                    item.sourceText ||
                    item.text ||
                    "")
            );
            const coveredSourceText = sourceCues
                .slice(startIndex, endIndex + 1)
                .map((cue) => cue.sourceText || "")
                .join(" ");
            const displaySourceText =
                rawDisplaySourceText &&
                Shared.subtitleContentSignature(rawDisplaySourceText) === Shared.subtitleContentSignature(coveredSourceText)
                    ? rawDisplaySourceText
                    : "";
            const group = {startId, endId};
            if (displaySourceText) {
                group.displaySourceText = displaySourceText;
            }
            groups.push(group);
            expectedStartIndex = endIndex + 1;
        }

        if (expectedStartIndex !== sourceCues.length) {
            throw new Error("Sentence segmentation groups did not cover every cue id.");
        }

        return groups;
    }

    function applySentenceSegmentationGroups(cues, groups) {
        const sourceCues = Array.isArray(cues) ? cues : [];
        const sourceIds = sourceCues.map((cue) => String(cue && cue.id != null ? cue.id : ""));
        const idToIndex = new Map(sourceIds.map((id, index) => [id, index]));
        const result = [];
        let expectedStartIndex = 0;

        for (const group of Array.isArray(groups) ? groups : []) {
            const startIndex = idToIndex.get(String(group && group.startId));
            const endIndex = idToIndex.get(String(group && group.endId));
            if (
                !Number.isInteger(startIndex) ||
                !Number.isInteger(endIndex) ||
                startIndex !== expectedStartIndex ||
                endIndex < startIndex
            ) {
                throw new Error("Cannot apply non-consecutive sentence segmentation groups.");
            }

            const groupCues = sourceCues.slice(startIndex, endIndex + 1);
            const sourceText = Shared.normalizeSubtitleText(groupCues.map((cue) => cue.sourceText || "").join(" "));
            if (!sourceText) {
                throw new Error("Sentence segmentation produced an empty subtitle group.");
            }

            const proposedDisplaySourceText = Shared.normalizeSubtitleText(group && group.displaySourceText);
            const safeDisplaySourceText =
                proposedDisplaySourceText &&
                Shared.subtitleContentSignature(proposedDisplaySourceText) === Shared.subtitleContentSignature(sourceText)
                    ? proposedDisplaySourceText
                    : sourceText;

            result.push({
                id: String(result.length),
                startMs: Number(groupCues[0].startMs),
                endMs: Number(groupCues[groupCues.length - 1].endMs),
                sourceText,
                displaySourceText: safeDisplaySourceText,
                translatedText: "",
                status: "pending"
            });
            expectedStartIndex = endIndex + 1;
        }

        if (expectedStartIndex !== sourceCues.length) {
            throw new Error("Sentence segmentation groups did not cover every source cue.");
        }

        return result;
    }

    const displayTimelineCache = new WeakMap();
    const ABBREVIATION_RE = /\b(?:(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e)|(?:[A-Za-z]\.)*[A-Za-z])\.$/i;
    const SENTENCE_CLOSERS_RE = /["'”’）)\]]/;
    const INCOMPLETE_SENTENCE_END_WORDS = new Set([
        ...Shared.DISPLAY_PREPOSITION_WORDS, "a", "an", "the", "and", "or", "because", "if", "whether"
    ]);

    // Only real sentence terminators qualify. Commas, conjunctions, duration
    // and character counts are never output boundaries. Uncertain tails stay
    // attached; appending a period would not make them complete sentences.
    function captionSentences(value) {
        const text = Shared.normalizeSubtitleText(value);
        const parts = [];
        let start = 0;
        for (let index = 0; index < text.length; index += 1) {
            const mark = text[index];
            if (!/[.!?。！？]/.test(mark)) continue;
            if (mark === "." && (text[index + 1] === "." || text[index - 1] === "." ||
                ABBREVIATION_RE.test(text.slice(start, index + 1)))) continue;
            let end = index + 1;
            while (/[!?。！？]/.test(text[end] || "") || SENTENCE_CLOSERS_RE.test(text[end] || "")) end += 1;
            if (/[.!?]/.test(mark) && end < text.length && !/\s/.test(text[end])) continue;
            const sentence = text.slice(start, end).trim();
            if (!sentence) continue;
            parts.push({text: sentence, endOffset: end, complete: !INCOMPLETE_SENTENCE_END_WORDS.has(lastSubtitleWord(sentence))});
            start = end;
            index = end - 1;
        }
        const tail = text.slice(start).trim();
        if (tail) parts.push({text: tail, endOffset: text.length, complete: false});
        return parts;
    }

    function endsCaptionSentence(value) {
        const parts = captionSentences(value);
        return Boolean(parts.length && parts[parts.length - 1].complete);
    }

    function captionContinues(left, right, trustDisplayText) {
        if (right.startMs - left.endMs > 1500 || left.status !== right.status) return false;
        const raw = left.sourceText || "";
        if (endsCaptionSentence(raw)) return false;
        const lastWord = lastSubtitleWord(raw);
        const nextWord = firstSubtitleWord(right.sourceText);
        if (INCOMPLETE_SENTENCE_END_WORDS.has(lastWord) ||
            ["them", "him", "her", "whether", "which", "whose"].includes(nextWord) ||
            /^(?:and|or)\s+(?!i\b|we\b|you\b|he\b|she\b|they\b|it\b|there\b)/i.test(right.sourceText || "")) return true;
        if (left.sentenceComplete || (trustDisplayText && endsCaptionSentence(left.displaySourceText))) return false;
        // A translation ending in a comma still belongs to the next fragment.
        // Legacy displaySourceText may contain periods invented by the old
        // length splitter, so it is not evidence of a complete sentence.
        return !left.translatedText || /[,，;；:：、]["'”’）)\]]*$/.test(left.translatedText.trim());
    }

    function joinIncompleteCaptionCues(cues, trustDisplayText = false) {
        const result = [];
        for (const cue of cues) {
            const previous = result[result.length - 1];
            if (!previous || !captionContinues(previous, cue, trustDisplayText)) {
                result.push(cue);
                continue;
            }
            const sourceText = joinSubtitleFragments(previous.sourceText, cue.sourceText, false);
            result[result.length - 1] = {...previous, endMs: cue.endMs, sourceText,
                displaySourceText: joinSubtitleFragments(previous.displaySourceText || previous.sourceText,
                    cue.displaySourceText || cue.sourceText, true),
                translatedText: joinSubtitleFragments(previous.translatedText, cue.translatedText, false),
                sentenceComplete: Boolean(cue.sentenceComplete)};
        }
        return result;
    }

    function sourcePartsForSentences(source, sentences) {
        if (Shared.subtitleContentSignature(source) !== Shared.subtitleContentSignature(sentences.map((part) => part.text).join(" "))) return null;
        const characters = Array.from(source);
        let cursor = 0;
        return sentences.map((sentence) => {
            const start = cursor;
            let letters = 0;
            const count = Array.from(Shared.subtitleContentSignature(sentence.text)).length;
            while (cursor < characters.length && letters < count) {
                letters += Array.from(Shared.subtitleContentSignature(characters[cursor])).length;
                cursor += 1;
            }
            while (cursor < characters.length && !/[\p{L}\p{N}]/u.test(characters[cursor])) cursor += 1;
            return characters.slice(start, cursor).join("").trim();
        });
    }

    function sentenceCueParts(cue, allowModelPunctuation = false, translated = false) {
        const raw = Shared.normalizeSubtitleText(cue.sourceText);
        const proposed = Shared.normalizeSubtitleText(cue.displaySourceText);
        const source = allowModelPunctuation && proposed &&
            Shared.subtitleContentSignature(proposed) === Shared.subtitleContentSignature(raw) ? proposed : raw;
        const sentences = captionSentences(source);
        if (sentences.length < 2 || sentences.some((part) => !part.complete) || cue.endMs - cue.startMs < sentences.length) return [cue];
        const translations = captionSentences(cue.translatedText);
        // Bilingual output can only be split at corresponding complete
        // sentences, never at proportional character offsets.
        if (translated && cue.translatedText &&
            (translations.length !== sentences.length || translations.some((part) => !part.complete))) return [cue];
        const rawParts = sourcePartsForSentences(raw, sentences);
        if (!rawParts) return [cue];
        const displayParts = captionSentences(proposed);
        if (translated && proposed && proposed !== source &&
            (displayParts.length !== sentences.length || displayParts.some((part) => !part.complete))) return [cue];
        let startMs = cue.startMs;
        return sentences.map((sentence, index) => {
            const endMs = index === sentences.length - 1 ? cue.endMs : Math.max(startMs + 1,
                Math.min(cue.endMs - (sentences.length - index - 1),
                    cue.startMs + Math.round((cue.endMs - cue.startMs) * sentence.endOffset / source.length)));
            const result = {...cue, id: `${cue.id}:sentence:${index}`, startMs, endMs,
                sourceText: rawParts[index],
                displaySourceText: translated && proposed && proposed !== source ? displayParts[index].text : sentence.text,
                translatedText: translated && cue.translatedText ? translations[index].text : "",
                sentenceComplete: true};
            startMs = endMs;
            return result;
        });
    }

    function prepareSentenceCaptionCues(cues, useModelPunctuation = false) {
        return joinIncompleteCaptionCues(Array.isArray(cues) ? cues : [], useModelPunctuation)
            .flatMap((cue) => sentenceCueParts(cue, useModelPunctuation))
            .map((cue, index) => ({...cue, id: String(index),
                displaySourceText: useModelPunctuation ? cue.displaySourceText || cue.sourceText : cue.sourceText,
                sentenceComplete: endsCaptionSentence(useModelPunctuation ? cue.displaySourceText || cue.sourceText : cue.sourceText)}));
    }

    function getCaptionDisplayCues(cues) {
        const fields = cues.map((cue) => [cue, cue.id, cue.sourceText, cue.displaySourceText, cue.translatedText,
            cue.startMs, cue.endMs, cue.status, cue.lastError, cue.sentenceComplete]);
        const cached = displayTimelineCache.get(cues);
        if (cached && fields.length === cached.fields.length && fields.every((values, index) =>
            values.every((value, field) => value === cached.fields[index][field]))) return cached.cues;
        const result = joinIncompleteCaptionCues(cues).flatMap((cue) => sentenceCueParts(cue, Boolean(cue.sentenceComplete), true));
        displayTimelineCache.set(cues, {fields, cues: result});
        return result;
    }

    Object.assign(Shared, {
        prepareSentenceCaptionCues,
        getCaptionDisplayCues,
        mergeCaptionFragments,
        splitCaptionCuesAtSentenceBoundaries,
        parseSentenceSegmentationContent,
        applySentenceSegmentationGroups
    });
});
