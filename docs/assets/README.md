# README media

These assets accompany the [English](../../README.md) and [Chinese](../../README_zh.md) READMEs. All content is original demo material. No personal browser profile, real API key, third-party video, or paid translation request is used.

| Asset | Source |
| --- | --- |
| `hero.svg` | Hand-authored vector artwork using the current Aurora A motif |
| `immersive-demo.gif`, `immersive-preview.png` | Production immersive scripts, page extraction and formatting; synthetic article and mocked runtime responses |
| `aurora-demo.gif`, `aurora-preview.png` | Production control markup and stylesheet in an enlarged light/dark state showcase |
| `subtitles.png` | Production subtitle overlay rendered over an original HTML/CSS lesson illustration; sample caption cues |
| `settings.png`, `popup.png` | Production React bundles through the local preview server; empty credential and demo provider/model names |

The GIFs illustrate interactions, not API latency or translation quality. The current settings/popup interface is Chinese; the English README labels the relevant actions. Static alternatives are linked beside each animation.

## Regenerate

Requirements: repository Node dependencies (`npm ci`), installed Chrome (or Edge), and Python 3 with Pillow. Pillow is only needed for documentation GIF encoding and is not an extension dependency.

```sh
npm run build:check
node scripts/capture-readme.cjs
python scripts/encode-readme-gifs.py
```

Set `UI_BROWSER=msedge` to capture in Edge. On Windows, use `npm.cmd` if needed and substitute your Python executable path when `python` is not on PATH.

The capture script starts a loopback-only preview server and denies external browser requests. It writes PNGs here and temporary frame sequences under the ignored `node_modules/.cache/readme-frames/`. The encoder uses those sequences to write optimized looping GIFs here. Assertions check translated text blocks, preserved links/code, display toggling without new translation requests, empty credentials, subtitle text, and browser errors.

Review the generated images and GIF keyframes before committing. The vector header is maintained directly rather than regenerated from a screenshot.
