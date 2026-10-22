const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MARK, PNG_SIZES, iconSvg } = require("../scripts/build-icons.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

function pngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString("latin1", 1, 4), "PNG", `${file} is a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("every icon the manifest declares exists at the size it is declared for", () => {
  const declared = [...Object.entries(manifest.icons), ...Object.entries(manifest.action.default_icon)];
  assert.ok(declared.length >= PNG_SIZES.length);
  for (const [size, file] of declared) {
    assert.deepEqual(pngSize(file), [Number(size), Number(size)], file);
  }
  assert.deepEqual(Object.keys(manifest.icons).map(Number), PNG_SIZES, "build-icons renders every manifest size");
});

test("the icon uses the floating control's mark", () => {
  const control = fs.readFileSync(path.join(root, "ui/content/ImmersiveUI.jsx"), "utf8");
  for (const [part, d] of Object.entries(MARK)) assert.ok(control.includes(`d="${d}"`), `${part} path matches`);
  // The committed vector is the one the generator produces. Line endings are
  // normalised because a Windows checkout writes text files with CRLF.
  const committed = fs.readFileSync(path.join(root, "icons/icon.svg"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(committed, iconSvg(128, { bleed: true }));
});

test("toolbar sizes drop the faint trail, larger sizes keep it", () => {
  assert.ok(!iconSvg(16).includes(MARK.trail));
  assert.ok(!iconSvg(32).includes(MARK.trail));
  assert.ok(iconSvg(48).includes(MARK.trail));
});
