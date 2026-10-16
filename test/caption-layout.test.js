const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const longCaption = require("./fixtures/long-caption.json");
const sentenceCaption = require("./fixtures/sentence-caption.json");
const fragments = require("./fixtures/incomplete-captions.json");

function assertTimeline(parts, cue) {
    assert.equal(parts[0].startMs, cue.startMs);
    assert.equal(parts.at(-1).endMs, cue.endMs);
    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        assert.ok(part.endMs > part.startMs);
        if (index) assert.equal(part.startMs, parts[index - 1].endMs);
        assert.equal(Core.findCueAtTime(parts, part.startMs), part);
    }
}

test("a long single sentence stays intact in both languages regardless of length", () => {
    const cue = Object.freeze({...longCaption});
    assert.deepEqual(Core.getCaptionDisplayCues([cue]), [cue]);
    const prepared = Core.prepareSentenceCaptionCues([{...cue, translatedText: "", status: "pending"}]);
    assert.equal(prepared.length, 1);
    assert.equal(prepared[0].sourceText, cue.sourceText);
});

test("only corresponding complete sentences become separate bilingual cues", () => {
    const cue = Object.freeze({...sentenceCaption});
    const parts = Core.getCaptionDisplayCues([cue]);
    assert.equal(parts.length, 3);
    assertTimeline(parts, cue);
    assert.equal(parts.map((part) => part.sourceText).join(" "), cue.sourceText);
    assert.equal(parts.map((part) => part.translatedText).join(""), cue.translatedText);
    assert.equal(parts[1].sourceText, "The team can now make a decision.");
    assert.equal(parts[1].translatedText, "团队现在可以做出决定。");
    assert.ok(parts.every((part) => part.sentenceComplete));
});

test("screenshot fragments ending in to help, them and and are rejoined without changing cache objects", () => {
    const cues = fragments.map((cue) => Object.freeze({...cue}));
    const before = JSON.stringify(cues);
    const parts = Core.getCaptionDisplayCues(cues);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].startMs, 98000);
    assert.equal(parts[0].endMs, 119000);
    assert.match(parts[0].sourceText, /to help them make/);
    assert.match(parts[0].sourceText, /longer and try/);
    assert.equal(parts[0].translatedText.replace(/\s/g, ""), cues.map((cue) => cue.translatedText).join(""));
    assert.equal(JSON.stringify(cues), before);
    for (const cue of cues) assert.equal(Core.findCueAtTime(parts, cue.startMs), parts[0]);
});

test("unpunctuated text, uncertain tails and unmatched bilingual sentence counts are never hard split", () => {
    for (const cue of [
        {...longCaption, sourceText: "word ".repeat(200)},
        {...longCaption, sourceText: "这是没有标点的字幕".repeat(30)},
        {...longCaption, sourceText: "First complete sentence. But we still need to"},
        {...sentenceCaption, translatedText: "只有一句对应不确定的译文。"},
        {...sentenceCaption, translatedText: "第一句。第二句。剩下半句，"}
    ]) assert.deepEqual(Core.getCaptionDisplayCues([cue]), [cue]);
});

test("periods in titles, initials, decimals and abbreviations are not sentence boundaries", () => {
    const cue = {...longCaption, sourceText: "Dr. Smith and J. Doe use 3.14 as a value, e.g. in tests. It works.", translatedText: ""};
    const parts = Core.prepareSentenceCaptionCues([cue]);
    assert.deepEqual(parts.map((part) => part.sourceText), [
        "Dr. Smith and J. Doe use 3.14 as a value, e.g. in tests.", "It works."
    ]);
});

test("local preparation joins fragments and never manufactures a period at a character limit", () => {
    const input = fragments.map((cue) => ({...cue, status: "pending", translatedText: ""}));
    const parts = Core.prepareSentenceCaptionCues(input);
    assert.equal(parts.length, 1);
    assert.match(parts[0].sourceText, /to help them make/);
    assert.equal(parts[0].displaySourceText, parts[0].sourceText);
    assert.equal(Core.prepareSentenceCaptionCues(input, true).length, 1);
});

test("model sentence punctuation maps back to exact raw source words before translation", () => {
    const cue = {...longCaption, sourceText: "the model works we can use it",
        displaySourceText: "The model works. We can use it.", translatedText: "", status: "pending"};
    const parts = Core.prepareSentenceCaptionCues([cue], true);
    assert.deepEqual(parts.map((part) => part.sourceText), ["the model works", "we can use it"]);
    assert.deepEqual(parts.map((part) => part.displaySourceText), ["The model works.", "We can use it."]);
    assertTimeline(parts, cue);
});

test("layout cache follows asynchronous translations and preserves uncertain alignment", () => {
    const cue = {...sentenceCaption};
    const cues = [cue];
    const before = Core.getCaptionDisplayCues(cues);
    assert.equal(Core.getCaptionDisplayCues(cues), before);
    cue.translatedText = "只有一句译文。";
    const after = Core.getCaptionDisplayCues(cues);
    assert.notEqual(after, before);
    assert.deepEqual(after, [cue]);
    cue.translatedText = sentenceCaption.translatedText;
    assert.equal(Core.getCaptionDisplayCues(cues).length, 3);
});
