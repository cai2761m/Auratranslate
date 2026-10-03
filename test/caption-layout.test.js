const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const longCaption = require("./fixtures/long-caption.json");
const compact = (text) => text.replace(/\s+/g, "");
const width = (text) => Array.from(text).reduce((sum, char) => sum +
    (/[\u2e80-\ua4cf\uac00-\ud7ff\uf900-\ufaff\uff01-\uff60]|\p{Extended_Pictographic}/u.test(char) ? 2 : 1), 0);

function assertTimeline(parts, cue) {
    assert.equal(parts[0].startMs, cue.startMs);
    assert.equal(parts.at(-1).endMs, cue.endMs);
    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        assert.ok(part.endMs > part.startMs);
        if (index) assert.equal(part.startMs, parts[index - 1].endMs);
        assert.equal(Core.findCueAtTime(parts, part.startMs), part);
        assert.ok(width(part.displaySourceText) <= 120, part.displaySourceText);
        assert.ok(width(part.translatedText) <= 96, part.translatedText);
    }
}

test("cached long bilingual captions become readable parts without altering stored content", () => {
    const cue = Object.freeze({...longCaption});
    const parts = Core.getCaptionDisplayParts(cue);
    assert.ok(parts.length > 1);
    assertTimeline(parts, cue);
    assert.equal(compact(parts.map((part) => part.sourceText).join("")), compact(cue.sourceText));
    assert.equal(compact(parts.map((part) => part.translatedText).join("")), compact(cue.translatedText));
    assert.ok(parts[0].sourceText.endsWith("machine learning"), "keep the technical phrase with its sentence");
    assert.equal(parts[1].translatedText, "他们试图训练自己的模型，以便更好地预测某些事情。");
    assert.deepEqual(cue, longCaption);
});

test("new long captions are split before translation and preserve short cues and source words", () => {
    const long = {...longCaption, translatedText: "", status: "pending"};
    const short = {id: "next", startMs: 42000, endMs: 46000, sourceText: "Short sentence.", displaySourceText: "Short sentence."};
    const parts = Core.splitLongCaptionCues([long, short]);
    const split = parts.slice(0, -1);
    assertTimeline(split, long);
    assert.equal(compact(split.map((part) => part.sourceText).join("")), compact(long.sourceText));
    assert.deepEqual(parts.at(-1), {...short, id: String(parts.length - 1)});
    assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
});

test("layout updates when an asynchronous translation or corrected source arrives", () => {
    const cue = {...longCaption, sourceText: "Short source.", translatedText: "", status: "pending"};
    const cues = [cue];
    const before = Core.getCaptionDisplayCues(cues);
    assert.equal(before.length, 1);
    assert.equal(Core.getCaptionDisplayCues(cues), before);
    cue.translatedText = longCaption.translatedText;
    cue.status = "translated";
    const translated = Core.getCaptionDisplayCues(cues);
    assert.notEqual(translated, before);
    assert.ok(translated.length > 1);
    assert.equal(Core.getCaptionDisplayCues(cues), translated);
    cue.displaySourceText = longCaption.sourceText;
    const corrected = Core.getCaptionDisplayCues(cues);
    assert.notEqual(corrected, translated);
    assertTimeline(corrected, cue);
    cue.status = "failed";
    cue.lastError = "test error";
    assert.ok(Core.getCaptionDisplayCues(cues).every((part) => part.lastError === "test error"));
});

test("unpunctuated CJK, long words, emoji, and uneven bilingual lengths keep bounded complete timelines", () => {
    for (const source of ["这是没有标点的字幕".repeat(30), "word ".repeat(200), "x".repeat(450), "😊".repeat(100), "A", ""]) {
        const cue = {...longCaption, sourceText: source, translatedText: "很长的翻译内容，没有原文对齐数据。".repeat(16)};
        const parts = Core.getCaptionDisplayParts(cue);
        assertTimeline(parts, cue);
        assert.equal(compact(parts.map((part) => part.sourceText).join("")), compact(source));
        assert.equal(compact(parts.map((part) => part.translatedText).join("")), compact(cue.translatedText));
        assert.ok(parts.every((part) => !/[\uD800-\uDFFF]/u.test(part.sourceText.replace(/😊/g, ""))));
    }
});
