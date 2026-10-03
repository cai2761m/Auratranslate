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
        const sentenceEndPattern = /[.!?。！？]+["')\]]*(?=\s+|$)/g;

        for (const cue of Array.isArray(cues) ? cues : []) {
            const sourceText = Shared.normalizeSubtitleText(cue && cue.sourceText);
            const startMs = Number(cue && cue.startMs);
            const endMs = Number(cue && cue.endMs);
            if (!sourceText || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
                continue;
            }

            const parts = [];
            let sourceOffset = 0;
            sentenceEndPattern.lastIndex = 0;
            let match;
            while ((match = sentenceEndPattern.exec(sourceText))) {
                const endOffset = match.index + match[0].length;
                const text = sourceText.slice(sourceOffset, endOffset).trim();
                if (text) {
                    parts.push({text, startOffset: sourceOffset, endOffset});
                }
                sourceOffset = endOffset;
                while (/\s/.test(sourceText[sourceOffset] || "")) {
                    sourceOffset += 1;
                }
            }
            const remainder = sourceText.slice(sourceOffset).trim();
            if (remainder) {
                parts.push({text: remainder, startOffset: sourceOffset, endOffset: sourceText.length});
            }
            if (!parts.length) {
                parts.push({text: sourceText, startOffset: 0, endOffset: sourceText.length});
            }

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
                    displaySourceText: Shared.formatDisplaySourceText(part.text),
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
                    ? Shared.formatDisplaySourceText(rawDisplaySourceText)
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
                displaySourceText: Shared.formatDisplaySourceText(safeDisplaySourceText),
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

    // Reading limits are measured in approximate display columns (CJK counts
    // twice). Keep this separate from cue/cache identity: old translations can
    // be paged locally without invalidating or resending paid work.
    const CAPTION_SOURCE_COLUMNS = 120;
    const CAPTION_TRANSLATION_COLUMNS = 96;
    const displayPartCache = new WeakMap();
    const displayTimelineCache = new WeakMap();

    function captionCharacters(text) {
        return Array.from(String(text || "").trim());
    }

    function captionCharacterWidth(character) {
        return /[\u2e80-\ua4cf\uac00-\ud7ff\uf900-\ufaff\uff01-\uff60]|\p{Extended_Pictographic}/u.test(character) ? 2 : 1;
    }

    function captionTextWidth(text) {
        return captionCharacters(text).reduce((sum, character) => sum + captionCharacterWidth(character), 0);
    }

    function captionPartCount(source, translation) {
        const sourceWidth = captionTextWidth(source);
        const translationWidth = captionTextWidth(translation);
        if (sourceWidth <= CAPTION_SOURCE_COLUMNS && translationWidth <= CAPTION_TRANSLATION_COLUMNS) return 1;
        // Leave room to move a cut to a word/clause boundary.
        return Math.max(Math.ceil(sourceWidth / 100), Math.ceil(translationWidth / 80));
    }

    function splitCaptionText(text, count, maxColumns, fractions) {
        const characters = captionCharacters(text);
        const widths = [0];
        for (const character of characters) widths.push(widths[widths.length - 1] + captionCharacterWidth(character));
        const total = widths[characters.length];
        const parts = [];
        let start = 0;
        for (let part = 0; part < count; part += 1) {
            const remaining = count - part;
            let end = characters.length;
            if (remaining > 1 && start < end) {
                const target = fractions ? total * fractions[part] : widths[start] + (total - widths[start]) / remaining;
                let bestScore = Infinity;
                end = start + 1;
                for (let index = start + 1; index <= characters.length; index += 1) {
                    const width = widths[index] - widths[start];
                    if (width > maxColumns) break;
                    if (total - widths[index] > maxColumns * (remaining - 1)) continue;
                    if (characters.length - index < Math.min(remaining - 1, characters.length - start - 1)) continue;
                    const left = characters[index - 1];
                    const right = characters[index] || "";
                    const punctuation = /[.!?。！？,，;；:：、]/.test(left);
                    const wordBoundary = /\s/.test(right);
                    const wideBoundary = captionCharacterWidth(left) === 2 || (right && captionCharacterWidth(right) === 2);
                    // Prefer clauses, then whole words. Character cuts only
                    // handle unspaced scripts or a single oversized token.
                    let penalty = punctuation ? 0 : wordBoundary ? 12 : wideBoundary ? 18 : 100;
                    if (/[，。！？；：、.!?,;:\])）”’]/.test(right)) penalty += 80;
                    if (wordBoundary) {
                        const tail = characters.slice(Math.max(start, index - 20), index).join("");
                        if (DANGLING_END_WORDS.has(lastSubtitleWord(tail))) penalty += 15;
                        const nextWord = firstSubtitleWord(characters.slice(index, index + 20).join(""));
                        if (Shared.DISPLAY_PREPOSITION_WORDS.has(nextWord)) penalty += 18;
                        if (["and", "but", "because", "when", "while", "they", "we", "you"].includes(nextWord)) penalty -= 26;
                    }
                    const score = Math.abs(widths[index] - target) + penalty;
                    if (score < bestScore) { bestScore = score; end = index; }
                }
            }
            parts.push({text: characters.slice(start, end).join("").trim(), fraction: total ? widths[end] / total : (part + 1) / count});
            start = end;
        }
        return parts;
    }

    function timeCaptionParts(cue, sourceParts, translations) {
        const duration = cue.endMs - cue.startMs;
        let startMs = cue.startMs;
        return sourceParts.map((part, index) => {
            const endMs = index === sourceParts.length - 1 ? cue.endMs :
                Math.max(startMs + 1, Math.min(cue.endMs - (sourceParts.length - index - 1),
                    cue.startMs + Math.round(duration * part.fraction)));
            const result = {...cue, id: `${cue.id}:display:${index}`, startMs, endMs,
                sourceText: part.text, displaySourceText: part.text,
                translatedText: translations ? translations[index].text : ""};
            startMs = endMs;
            return result;
        });
    }

    function splitLongCaptionCues(cues) {
        return (Array.isArray(cues) ? cues : []).flatMap((cue) => {
            const count = Math.min(captionPartCount(cue.sourceText, ""), Math.max(1, Math.floor(cue.endMs - cue.startMs)));
            if (count === 1) return [cue];
            const parts = splitCaptionText(cue.sourceText, count, CAPTION_SOURCE_COLUMNS - 1);
            return timeCaptionParts(cue, parts).map((part) => ({...part,
                displaySourceText: Shared.formatDisplaySourceText(part.sourceText), status: "pending"}));
        }).map((cue, index) => ({...cue, id: String(index)}));
    }

    function getCaptionDisplayParts(cue) {
        const fields = [cue.sourceText, cue.displaySourceText, cue.translatedText, cue.startMs, cue.endMs, cue.status, cue.lastError];
        const cached = displayPartCache.get(cue);
        if (cached && fields.every((value, index) => value === cached.fields[index])) return cached.parts;
        const source = cue.displaySourceText || cue.sourceText || "";
        const translation = cue.translatedText || "";
        const count = Math.min(captionPartCount(source, translation), Math.max(1, Math.floor(cue.endMs - cue.startMs)));
        let parts = [cue];
        if (count > 1) {
            const sourceParts = splitCaptionText(source, count, CAPTION_SOURCE_COLUMNS);
            if (sourceParts.some((part) => !part.text)) {
                sourceParts.forEach((part, index) => { part.fraction = (index + 1) / count; });
            }
            // Legacy caches have no bilingual word alignment. Prefer nearby
            // punctuation at matching proportions, estimating timing only
            // within the original cue; never rewrite the stored translation.
            const translations = splitCaptionText(translation, count, CAPTION_TRANSLATION_COLUMNS, sourceParts.map((part) => part.fraction));
            parts = timeCaptionParts(cue, sourceParts, translations);
        }
        displayPartCache.set(cue, {fields, parts});
        return parts;
    }

    function getCaptionDisplayCues(cues) {
        const parts = cues.map(getCaptionDisplayParts);
        const cached = displayTimelineCache.get(cues);
        if (cached && cached.parts.length === parts.length && parts.every((value, index) => value === cached.parts[index])) return cached.cues;
        const result = parts.flat();
        displayTimelineCache.set(cues, {parts, cues: result});
        return result;
    }

    Object.assign(Shared, {
        splitLongCaptionCues,
        getCaptionDisplayParts,
        getCaptionDisplayCues,
        mergeCaptionFragments,
        splitCaptionCuesAtSentenceBoundaries,
        parseSentenceSegmentationContent,
        applySentenceSegmentationGroups
    });
});
