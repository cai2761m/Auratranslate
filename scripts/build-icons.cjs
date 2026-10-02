// Renders the extension icon. Run `npm run icons` after changing the artwork,
// and commit the regenerated files under icons/.
//
// The artwork is the floating control's mark -- the letter A crossed by an
// aurora ribbon -- on a night-glass tile. The three paths below must stay the
// same as the ones in src/immersive-controls.js (test/icons.test.js checks it).
const fs = require("node:fs");
const path = require("node:path");

const MARK = {
  a: "M6.5 22 13 6.8a1.1 1.1 0 0 1 2 0L21.5 22",
  trail: "M5 21c4-5.5 7-4.3 11-2.6 2.9 1.2 5.4.5 7-1.2",
  ribbon: "M4.5 18.5c4-5.6 7.4-4.2 11.1-2.3 3.1 1.6 5.8 1.2 8-1.8",
};
const PALETTE = {
  tile: [["0", "#1d4b59"], ["0.55", "#26344e"], ["1", "#352a58"]],
  // Teal light pooled bottom-left, violet top-right, as on the control's ball.
  glows: [["#3fd6b4", 0.5, "18%", "88%", "62%"], ["#9b7cf0", 0.55, "88%", "8%", "58%"]],
  edge: "rgba(255,255,255,0.16)",
  a: "#f6f8ff",
  ribbon: [["0", "#70e7c5"], ["0.5", "#82cafa"], ["1", "#b19afa"]],
  trail: "#b2b9ff",
};
const PNG_SIZES = [16, 32, 48, 96, 128];

// `bleed` drops the transparent margin: the PNGs keep Chrome's store padding
// (8px at 128), while the SVG fills its box for use inside the extension pages.
function iconSvg(size, { bleed = false } = {}) {
  // Toolbar sizes cannot hold the faint trail or the large-size stroke weights:
  // below 32px the trail is dropped and both strokes are thickened.
  const small = size <= 16;
  const mid = size <= 32;
  const margin = bleed ? 0 : size >= 96 ? size * 0.0625 : size >= 48 ? 2 : 0;
  const tile = size - margin * 2;
  const radius = tile * 0.24;
  const scale = (tile * (small ? 1.04 : 0.94)) / 28;
  const offset = margin + (tile - 28 * scale) / 2;
  const aWidth = small ? 3.1 : mid ? 2.5 : 1.9;
  const ribbonWidth = small ? 3.0 : mid ? 2.5 : 2.1;
  const stops = (list) => list.map(([at, colour]) => `<stop offset="${at}" stop-color="${colour}"/>`).join("");
  const rect = `x="${margin}" y="${margin}" width="${tile}" height="${tile}"`;
  const glowDefs = PALETTE.glows
    .map(([colour, opacity, cx, cy, r], i) =>
      `<radialGradient id="glow${i}" cx="${cx}" cy="${cy}" r="${r}"><stop stop-color="${colour}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`)
    .join("");
  const glowFills = PALETTE.glows.map((_, i) => `<rect ${rect} fill="url(#glow${i})"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">${stops(PALETTE.tile)}</linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">${stops(PALETTE.ribbon)}</linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${glowDefs}
    <clipPath id="shape"><rect ${rect} rx="${radius}"/></clipPath>
  </defs>
  <g clip-path="url(#shape)">
    <rect ${rect} fill="url(#tile)"/>
    ${glowFills}
    <rect ${rect.replace(`height="${tile}"`, `height="${tile / 2}"`)} fill="url(#sheen)"/>
  </g>
  ${mid ? "" : `<rect x="${margin + 0.5}" y="${margin + 0.5}" width="${tile - 1}" height="${tile - 1}" rx="${radius - 0.5}" fill="none" stroke="${PALETTE.edge}"/>`}
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${MARK.a}" stroke="${PALETTE.a}" stroke-width="${aWidth}"/>
    ${mid ? "" : `<path d="${MARK.trail}" stroke="${PALETTE.trail}" stroke-width="1" opacity="0.7"/>`}
    <path d="${MARK.ribbon}" stroke="url(#ribbon)" stroke-width="${ribbonWidth}"/>
  </g>
</svg>
`;
}

async function build() {
  const { chromium } = require("playwright");
  const out = path.resolve(__dirname, "../icons");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "icon.svg"), iconSvg(128, { bleed: true }));
  const browser = await chromium.launch({ channel: process.env.UI_BROWSER || "chrome", headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const size of PNG_SIZES) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<body style="margin:0">${iconSvg(size)}</body>`);
      await page.screenshot({
        path: path.join(out, `icon-${size}.png`),
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size },
      });
    }
  } finally {
    await browser.close();
  }
  console.log(`Rendered icons/icon.svg and icons/icon-{${PNG_SIZES.join(",")}}.png`);
}

module.exports = { MARK, PNG_SIZES, iconSvg };
if (require.main === module)
  build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
