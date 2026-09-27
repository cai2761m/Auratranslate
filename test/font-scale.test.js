const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/shared.js");
const { mount, setValue } = require("../scripts/ui-test-helpers.cjs");

test("font scale accepts smaller mobile sizes, finer steps, and larger sizes", () => {
  for (const scale of [0.3, 0.35, 0.5, 0.65, 0.7, 1, 1.8, 2, 3]) {
    assert.equal(Core.normalizeFontScale(scale), scale);
    assert.equal(Core.normalizeFontScale(String(scale)), scale);
  }
  assert.equal(Core.normalizeFontScale(-1), 0.3);
  assert.equal(Core.normalizeFontScale(4), 3);
  for (const invalid of [undefined, null, "", "invalid", NaN, Infinity, true])
    assert.equal(Core.normalizeFontScale(invalid), 1);
});

test("React settings slider saves and reloads fine-grained mobile sizes", async (t) => {
  const storage = { fontScale: 0.7 };
  const page = await mount(t, "options", { storage });
  for (const [name, value] of [
    ["min", Core.FONT_SCALE_MIN],
    ["max", Core.FONT_SCALE_MAX],
    ["step", Core.FONT_SCALE_STEP],
  ]) {
    assert.equal(page.field("fontScale").getAttribute(name), String(value));
  }
  assert.equal(
    page.field("fontScale").getAttribute("aria-describedby"),
    "fontScaleHint",
  );
  assert.ok(page.field("fontScaleHint"));
  assert.equal(Number(page.field("fontScale").value), 0.7);
  for (const scale of [0.3, 0.55, 0.65, 3]) {
    setValue(page.field("fontScale"), String(scale));
    assert.equal(
      page.field("fontScaleValue").textContent,
      `${scale.toFixed(2)}x`,
    );
    await page.save();
    assert.equal(storage.fontScale, scale);
    const reopened = await mount(t, "options", { storage });
    assert.equal(Number(reopened.field("fontScale").value), scale);
  }
});

test("subtitle scope and lookahead settings save and reload", async (t) => {
  const storage = {};
  const page = await mount(t, "options", { storage });
  assert.equal(page.field("subtitleTranslationMode").value, "economy");
  assert.equal(page.field("subtitleLookAheadMinutes").value, "2");
  for (const mode of ["full", "economy"]) {
    for (const minutes of [1, 2, 3]) {
      setValue(page.field("subtitleTranslationMode"), mode);
      setValue(page.field("subtitleLookAheadMinutes"), String(minutes));
      await page.save();
      const reopened = await mount(t, "options", { storage });
      assert.equal(reopened.field("subtitleTranslationMode").value, mode);
      assert.equal(
        reopened.field("subtitleLookAheadMinutes").value,
        String(minutes),
      );
    }
  }
});
