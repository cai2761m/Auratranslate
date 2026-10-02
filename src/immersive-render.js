// Inline formatting preservation and translated DOM rendering.
// Modules share only YTBTImmersive; startup runs last in immersive.js.
(function () {
    "use strict";
    const App = globalThis.YTBTImmersive;
    if (!App) return;

    function prepareOutlineLabel(element) {
        if (!element.matches("#pagenav-content a[href]")) return element;
        // Keep the number/icon as the first flex item, with source and translation
        // stacked together in the label. Move nodes so link handlers stay intact.
        const label = document.createElement("span");
        label.dataset.ytbtOutlineLabel = "true";
        for (const child of Array.from(element.childNodes)) {
            if (!child.matches?.(`${App.OUTLINE_DECORATION_SELECTOR}, [aria-hidden='true']`)) label.appendChild(child);
        }
        element.appendChild(label);
        return label;
    }

    function mathSourceText(node) {
        const tex = node.querySelector('annotation[encoding="application/x-tex"]');
        if (tex) return tex.textContent.trim();
        const source = (node.matches("math") ? node : node.querySelector("math")) || node;
        const clone = source.cloneNode(true);
        for (const annotation of clone.querySelectorAll("annotation, annotation-xml")) annotation.remove();
        return clone.textContent.trim();
    }

    function copyMath(node) {
        // Copy only inert formula layout from the source page, never model HTML.
        // KaTeX's classes, inline geometry, MathML and SVG paths are all needed.
        const tags = new Set("span math semantics annotation mrow mi mn mo mtext mspace ms mfrac msqrt mroot mstyle merror mpadded mphantom mfenced menclose msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mtd maligngroup malignmark svg g path line rect circle ellipse polygon polyline defs clipPath".toLowerCase().split(" "));
        const attributes = new Set("class aria-hidden aria-label role encoding display mathvariant mathsize mathcolor mathbackground stretchy symmetric fence separator lspace rspace largeop movablelimits accent accentunder linethickness bevelled numalign denomalign scriptlevel displaystyle width height depth voffset rowalign columnalign rowspacing columnspacing columnspan rowspan notation open close separators viewbox preserveaspectratio d x y x1 x2 y1 y2 cx cy r rx ry points fill stroke stroke-width transform".split(" "));

        function copy(source) {
            if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent);
            if (source.nodeType !== Node.ELEMENT_NODE || !tags.has(source.localName.toLowerCase()) ||
                !["http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML", "http://www.w3.org/2000/svg"].includes(source.namespaceURI)) return null;
            const target = document.createElementNS(source.namespaceURI, source.localName);
            for (const attr of source.attributes) {
                if (attributes.has(attr.name.toLowerCase()) && !/url\s*\(/i.test(attr.value)) target.setAttribute(attr.name, attr.value);
            }
            for (const property of Array.from(source.style || [])) {
                const value = source.style.getPropertyValue(property);
                if (/^(?:height|width|min-height|min-width|max-height|max-width|top|bottom|left|right|position|display|vertical-align|overflow|box-sizing|color|background-color|opacity|font(?:-.+)?|line-height|text-align|white-space|margin(?:-.+)?|padding(?:-.+)?|border(?:-.+)?|transform(?:-origin)?)$/.test(property) &&
                    !/url\s*\(|expression\s*\(|var\s*\(/i.test(value)) target.style.setProperty(property, value);
            }
            for (const child of source.childNodes) {
                const cloned = copy(child);
                if (cloned) target.appendChild(cloned);
            }
            return target;
        }

        return copy(node);
    }

    function extractInlineFormatting(element) {
        const formats = new Map();
        const tags = new Set(["CODE", "KBD", "SAMP", "STRONG", "B", "EM", "I", "A", "S", "DEL", "U", "MARK", "SUB", "SUP", "BR"]);

        function visit(node) {
            if (node.nodeType === Node.TEXT_NODE) return node.textContent;
            if (node.nodeType !== Node.ELEMENT_NODE || node.matches("[data-ytbt-immersive-translation], [aria-hidden='true'], script, style")) return "";
            if (node.matches(App.OUTLINE_DECORATION_SELECTOR)) return "";
            if (node.matches(App.MATH_SELECTOR)) {
                const key = `MATH_${formats.size}`;
                const sourceText = mathSourceText(node);
                formats.set(key, {template: copyMath(node), literal: true, math: true, sourceText});
                return `[[YTBT_${key}]]${sourceText}[[/YTBT_${key}]]`;
            }
            if (!tags.has(node.tagName)) return Array.from(node.childNodes, visit).join("");
            const key = `${node.tagName}_${formats.size}`;
            const template = document.createElement(node.tagName.toLowerCase());
            // Copy appearance, never IDs, handlers or arbitrary source attributes.
            template.className = node.className;
            const style = window.getComputedStyle(node);
            for (const property of ["font-family", "font-size", "font-weight", "font-style", "color", "background-color", "border", "border-radius", "padding", "text-decoration", "vertical-align", "white-space"]) {
                const value = style.getPropertyValue(property);
                if (value) template.style.setProperty(property, value);
            }
            if (node.tagName === "A") {
                const href = node.getAttribute("href");
                try {
                    if (href && /^(https?:|mailto:|tel:)$/i.test(new URL(href, document.baseURI).protocol)) template.setAttribute("href", href);
                } catch (_) { /* Malformed links remain readable text. */
                }
            }
            const literal = /^(CODE|KBD|SAMP)$/.test(node.tagName);
            formats.set(key, {template, literal, sourceText: node.textContent});
            const content = literal ? node.textContent : Array.from(node.childNodes, visit).join("");
            return `[[YTBT_${key}]]${content}[[/YTBT_${key}]]`;
        }

        const formattedText = Array.from(element.childNodes, visit).join("").replace(/\s+/g, " ").trim();
        // Do not interpret marker-like source text as our own formatting protocol.
        if (/\[\[\/?YTBT_/.test(element.textContent)) return {formats: new Map()};
        return {
            formats,
            formattedText: formats.size && formattedText.length <= App.BATCH_CHAR_LIMIT ? formattedText : undefined
        };
    }

    function renderInlineTranslation(block, translatedText) {
        const fragment = document.createDocumentFragment();
        const formats = block.formats;
        if (!formats.size) {
            fragment.appendChild(document.createTextNode(translatedText));
            return fragment;
        }
        const marker = /\[\[(\/?)YTBT_([A-Z]+_\d+)\]\]/g;
        const stack = [{node: fragment, key: null}];
        const used = new Set();
        let cursor = 0;
        let valid = true;
        for (const match of translatedText.matchAll(marker)) {
            stack[stack.length - 1].node.appendChild(document.createTextNode(translatedText.slice(cursor, match.index)));
            cursor = match.index + match[0].length;
            const [, closing, key] = match;
            const format = formats.get(key);
            if (!format || (closing ? stack[stack.length - 1].key !== key : used.has(key))) {
                valid = false;
                break;
            }
            if (closing) {
                const entry = stack.pop();
                if (format.math) entry.node.replaceChildren(...format.template.cloneNode(true).childNodes);
                else if (format.literal) entry.node.textContent = format.sourceText;
            } else {
                const node = format.template.cloneNode(false);
                stack[stack.length - 1].node.appendChild(node);
                stack.push({node, key});
                used.add(key);
            }
        }
        if (valid && stack.length === 1 && used.size === formats.size) {
            fragment.appendChild(document.createTextNode(translatedText.slice(cursor)));
            return fragment;
        }
        // Old cached translations and providers that drop markers still retain
        // literal code styling locally, without another billable translation.
        const plain = translatedText.replace(marker, "");
        const literals = Array.from(formats.values()).filter((format) => format.literal && format.sourceText)
            .sort((a, b) => b.sourceText.length - a.sourceText.length);
        const fallback = document.createDocumentFragment();
        let start = 0;
        for (let index = 0; index < plain.length; index += 1) {
            const format = literals.find(({sourceText}) => plain.startsWith(sourceText, index) &&
                !(/[\w$]/.test(sourceText[0]) && /[\w$]/.test(plain[index - 1] || "")) &&
                !(/[\w$]/.test(sourceText.at(-1)) && /[\w$]/.test(plain[index + sourceText.length] || "")));
            if (!format) continue;
            let end = index + format.sourceText.length;
            let before = index;
            // Some providers add Markdown backticks even to old plain-text input.
            while (before > start && plain[before - 1] === "`" && plain[end] === "`") {
                before -= 1;
                end += 1;
            }
            fallback.appendChild(document.createTextNode(plain.slice(start, before)));
            const node = format.template.cloneNode(Boolean(format.math));
            if (!format.math) node.textContent = format.sourceText;
            fallback.appendChild(node);
            start = end;
            index = end - 1;
        }
        fallback.appendChild(document.createTextNode(plain.slice(start)));
        return fallback;
    }

    function clearExistingTranslations() {
        App.state.nextBlockId = 0;
        App.restoreOriginalNodes();
        for (const node of document.querySelectorAll("[data-ytbt-immersive-translation]")) {
            node.remove();
        }
        for (const source of document.querySelectorAll("[data-ytbt-immersive-source]")) {
            delete source.dataset.ytbtImmersiveSource;
            source.classList.remove("ytbt-immersive-source");
        }
        for (const label of document.querySelectorAll("[data-ytbt-outline-label]")) label.replaceWith(...label.childNodes);
    }

    function createTranslationContainer(block) {
        const previous = document.querySelector(`[data-ytbt-immersive-for="${block.id}"]`);
        if (previous) {
            previous.remove();
        }

        const container = document.createElement("span");
        container.className = "ytbt-immersive-translation";
        if ((block.element.closest(App.TOC_SELECTOR) && block.element.matches("a[href], [data-ytbt-outline-label]")) ||
            (block.element.closest(App.CALLOUT_SELECTOR) && block.element.closest(App.CALLOUT_TITLE_SELECTOR))) {
            container.classList.add("ytbt-immersive-stacked");
        }
        container.dataset.ytbtImmersiveTranslation = "true";
        container.dataset.ytbtImmersiveFor = block.id;
        container.dataset.ytbtState = "loading";
        container.setAttribute("aria-busy", "true");

        const text = document.createElement("span");
        text.className = "ytbt-immersive-text";
        const spinner = document.createElement("span");
        spinner.className = "ytbt-immersive-spinner";
        spinner.setAttribute("role", "status");
        spinner.setAttribute("aria-label", "正在翻译");
        text.appendChild(spinner);

        container.appendChild(text);
        block.element.appendChild(container);

        return container;
    }

    function renderTranslation(block, translatedText) {
        const container = block.container;
        if (!container || !block.element.isConnected) {
            return;
        }
        container.hidden = false;
        const text = container.querySelector(".ytbt-immersive-text");
        if (text) {
            text.replaceChildren(renderInlineTranslation(block, translatedText));
        }
        container.dataset.ytbtState = "done";
        container.removeAttribute("aria-busy");
        App.applyDisplayMode();
    }

    function renderTranslationError(block, message) {
        const container = block.container;
        if (!container) {
            return;
        }
        const text = container.querySelector(".ytbt-immersive-text");
        if (text) {
            text.textContent = message || "Translation failed.";
        }
        container.dataset.ytbtState = "error";
        container.removeAttribute("aria-busy");
    }

    Object.assign(App, {
        mathSourceText,
        prepareOutlineLabel,
        extractInlineFormatting,
        clearExistingTranslations,
        createTranslationContainer,
        renderTranslation,
        renderTranslationError
    });
})();
