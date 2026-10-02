<div align="center">

![AuraTranslate — Read beyond language](docs/assets/hero.svg)

**English** · [简体中文](README_zh.md)

**Read the page. Follow the lesson. Keep the original close.**

An open-source browser extension for bilingual webpages and video subtitles,<br>
with an Aurora-inspired floating control and your choice of translation service.

[![License: MIT](https://img.shields.io/badge/License-MIT-82cafa?style=flat-square)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Extension-Manifest_V3-b19afa?style=flat-square)
![Bring your own API](https://img.shields.io/badge/API-OpenAI_compatible-70e7c5?style=flat-square)

[See it in action](#see-it-in-action) · [Get started](#get-started) · [FAQ](#faq) · [Development](#development)

</div>

## See it in action

### Your reading flow, in two languages

Click the floating **A** to translate. Read the original and translation together, then click again to hide or show the completed results. Links and inline code stay usable; headings, lists, and common formatting retain their structure.

![Click to translate a page, then hide and restore its bilingual text](docs/assets/immersive-demo.gif)

*Recorded with the production page extractor, renderer, and controls. Demo text and API responses are simulated; animation timing is not a speed benchmark. [View a still image](docs/assets/immersive-preview.png).*

### A little Aurora, right where you read

Pearl tones on light pages. Teal and violet on dark pages. The floating control samples the page behind it, with a gentle aurora effect on hover and a moving gradient ring while translating. Drag to reposition it; keyboard access and reduced-motion preferences are supported.

![Aurora floating control in light and dark themes, progressing from ready to translating to done](docs/assets/aurora-demo.gif)

*Enlarged control showcase; the actual button is 44 px. [View a still image](docs/assets/aurora-preview.png).*

### Follow the lesson, not a separate translation window

English and Chinese subtitles appear together on supported **YouTube** and **Google Drive** videos. Reposition the overlay by dragging it, adjust the text size, and choose Simplified or Traditional Chinese.

![Production bilingual subtitle overlay on an illustrated lesson](docs/assets/subtitles.png)

*Illustrative lesson with sample captions, rendered by the actual subtitle overlay. AuraTranslate translates existing captions or transcripts; it does not transcribe videos without them.*

## Built for everyday reading

| What you need | What AuraTranslate does |
| --- | --- |
| Understand the part you are reading | Prioritizes visible webpage text and reuses matching cached translations first. |
| Keep the original within reach | Offers bilingual and translation-only display; changing display mode reuses completed results. |
| Use your preferred model | Connects OpenAI-compatible Chat Completions services, with multiple providers and model catalogs. |
| Choose different tools for different tasks | Lets webpages inherit the subtitle service or use a separate provider and model. Google Translate is also available for webpages without an API key. |
| Control how much video is translated | Economy mode looks ahead **2 minutes** by default; choose 1, 2, or 3 minutes, or process the full video. |
| Return to what you were reading | Saves translations locally and preserves completed paragraphs when a later request fails. |

## Get started

### 1. Load the extension

[Download the source ZIP](https://github.com/cai2761m/auratranslate/archive/refs/heads/main.zip) and extract it, or clone the repository:

```sh
git clone https://github.com/cai2761m/auratranslate.git
```

In **Chrome** (`chrome://extensions`) or **Edge** (`edge://extensions`):

1. Turn on **Developer mode**.
2. Choose **Load unpacked** and select the folder containing `manifest.json`.
3. Pin AuraTranslate for easy access, then open its popup.

The built UI is included in the repository. **You do not need Node.js or npm to load it.**

### 2. Choose a translation service

**For a quick webpage trial:** choose **Google 翻译 · 免 Key** in the popup. This keyless service depends on network availability and may be rate limited.

**For your own AI service and video subtitles:** open **设置 → 翻译服务** (Settings → Translation services), click **添加自定义供应方**, and enter:

| Field | Example / meaning |
| --- | --- |
| Provider name | A name you recognize |
| API address | `https://api.example.com/v1` — replace with your provider's actual base URL |
| API key | Your own provider credential |
| Models | Exact model IDs; optionally add display names, fetch a model list, or test models |

The example address becomes `https://api.example.com/v1/chat/completions`. Use an **OpenAI-compatible Chat Completions** endpoint, not a website homepage or a native endpoint with a different protocol.

![Current translation-service settings, using an empty demo credential and sample models](docs/assets/settings.png)

Select the provider and model under **实时字幕** (Video subtitles). **沉浸式翻译** (Webpage translation) inherits them by default; select another service there if you prefer. Settings save automatically. No API key or API credit is included, and provider usage may incur charges, including model tests and optional LLM sentence segmentation.

### 3. Start reading or watching

<img src="docs/assets/popup.png" alt="AuraTranslate popup with language, provider, model and webpage translation controls" width="360" align="right">

- **Webpages:** click the floating A, or choose your languages and service in the popup and press **翻译当前网页**. The default is automatic source detection → Simplified Chinese.
- **Display mode:** use the icon beside the Translate button to switch between bilingual and translation-only display.
- **Site rules:** expand **更多功能** to follow the global setting, always translate the current site, or never translate it. Automatic webpage translation is off by default.
- **YouTube:** open a video with English captions. The **AuraTranslate icon in the player controls** opens the subtitle switch, style settings, floating transcript, and AI summary. Style settings include bilingual/translation/original display, size, text color, background opacity, and position reset. The transcript supports search, playback following, timestamp seeking, and dragging; it can be opened with translated subtitles turned off.
- **Google Drive:** open a video with an accessible transcript. The extension briefly opens the transcript panel to read it, then restores the panel.

<br clear="all">

## A few useful settings

| Setting | Default / choices |
| --- | --- |
| Subtitle translation | English → Simplified Chinese; Traditional Chinese also available |
| Translation scope | Economy mode, 2-minute lookahead; 1 / 2 / 3 minutes or full video |
| Subtitle size | `1.00×`; adjustable from `0.30×` to `3.00×` |
| LLM sentence segmentation | On; combines fragmented captions before translation and uses the subtitle API |
| Caption text correction | On; asks the model to correct obvious recognition errors in existing captions |
| Original technical terms | On; includes original terms alongside their Chinese translations |
| JSON output mode | On; turn off if your compatible endpoint rejects the option |

## FAQ

<details>
<summary><strong>Which browsers and video sources are supported?</strong></summary>

Source loading is intended for desktop Chrome and Edge. The manifest also declares Firefox desktop **140+** and Firefox for Android **142+**. Normal Firefox installation requires a Mozilla-signed extension package; this repository's source ZIP is not one. Android support applies to webpages in Firefox, not the native YouTube app. Device and website behavior can vary.

Video translation requires existing English captions on YouTube or a transcript accessible through the Google Drive player. There is no audio recording or speech-to-text fallback.

**AI summary** uses the selected subtitle service and model after you click **生成总结** (Generate summary). Opening the panel only checks the cache. Summaries use the existing transcript, are cached locally, and support copying. Requests are not automatically retried after a failure. Whole-video summaries currently accept up to 120,000 transcript characters and 20,000 cues; API charges may apply when generating a new summary.

</details>

<details>
<summary><strong>Will refreshing or switching modes translate everything again?</strong></summary>

Matching successful translations are cached locally. Switching bilingual/translation-only display, hiding/showing results, or changing subtitle size does not request a new translation. Changing the model, endpoint, language, or relevant caption-processing settings may require new results. Cache entries have a size limit and older entries can be evicted.

When a webpage request times out with an uncertain outcome, the extension checks for late cached results instead of automatically resending it. Completed paragraphs remain available. Return to the tab to recover results, or manually continue missing work. Requests already sent to a provider may still finish and incur charges.

</details>

<details>
<summary><strong>Why is some content missing, or an API call failing?</strong></summary>

- Confirm the API key, exact model ID, base URL, and model access. Disable JSON output mode if the endpoint rejects it.
- Google Translate can be rate limited or unavailable; try your configured AI service.
- Form controls, code blocks, decorative elements, and excluded regions are intentionally skipped. Text inside images, canvas, nested frames, or unsupported page structures may not be extracted.
- No video subtitles? Check the popup switch and that the video provides a supported caption track or transcript.
- After updating: reload the extension, then refresh existing tabs. Clearing the cache is usually unnecessary; use it when you need to discard saved results or reread changed source captions.

</details>

<details>
<summary><strong>Where do my text and API key go?</strong></summary>

No AuraTranslate account is required. Caption and webpage text is sent to the translation service you select; LLM sentence segmentation also sends caption text to your configured service. Google mode sends webpage text to Google's public translation endpoint without browser cookies.

Settings, keys, positions, and caches are stored in browser extension local storage. **API keys are not additionally encrypted by the extension.** The password field only masks their display. `storage` permission supports these local settings; HTTP/HTTPS host access lets the extension read page text, render translations, and contact your chosen API, including local endpoints.

</details>

## Development

The popup and settings pages use **React + esbuild**. Content scripts and the translation engine use plain JavaScript. Use a Node.js version accepted by the locked jsdom dependency: `^22.22.2`, `^24.15.0`, or `>=26.0.0`.

```sh
npm ci
npm run build
npm test
npm run test:ui:browser
```

| Command / directory | Purpose |
| --- | --- |
| `npm run dev` | Rebuild the React UI when sources change |
| `npm run preview` | Mock UI at `http://127.0.0.1:5174`; no real API calls |
| `npm run build:check` | Verify committed UI bundles match their sources |
| `npm run test:ui:browser` | Check production UI in installed Chrome; set `UI_BROWSER=msedge` for Edge |
| `ui/` | React popup, settings, and shared components |
| `src/` | Translation, captions, caching, page rendering, and floating controls |
| `test/` | Automated tests and fixtures |
| [Media generation](docs/assets/README.md) | Reproduce the screenshots and GIFs in this README |

Edit the React sources rather than generated `options/options.js` or `popup/popup.js`, and commit rebuilt bundles with UI changes. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Browser previews and tests use simulated storage/provider responses; live API and device validation are separate.

## Contributing

Found a page that does not translate correctly? [Open an issue](https://github.com/cai2761m/auratranslate/issues) with the page URL, browser/version, reproduction steps, and error text. Remove API keys and other private information from screenshots and logs. Focused fixes, documentation improvements, and reproducible examples are welcome.

Licensed under [MIT](LICENSE).
