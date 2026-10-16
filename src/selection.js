// Selection UI lives in a shadow root so webpage styles cannot alter its controls.
(function () {
    "use strict";
    const Core = globalThis.YTBTCore;
    if (!Core || !globalThis.chrome?.runtime || globalThis.YTBTSelection) return;
    const state = {ready: false, enabled: true, revision: 0, selection: null, host: null,
        shadow: null, result: null, translating: false, saving: false, saved: false, error: "",
        toolbar: Core.normalizeSelectionToolbar(), copied: false, toolbarError: ""};
    globalThis.YTBTSelection = {state, dismiss};
    let timer;
    const EDITABLE = "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']";
    const OWN_UI = "[data-ytbt-selection-root],[data-ytbt-immersive-root],script,style,noscript";
    const elementOf = (node) => node?.nodeType === 1 ? node : node?.parentElement;
    const send = (message) => Core.sendRuntimeMessage(chrome.runtime, message, 130000).then((result) => {
        if (!result?.ok) throw new Error(result?.error || "扩展未返回结果，请重试。");
        return result;
    });

    function dismiss() {
        clearTimeout(timer);
        state.revision++;
        state.host?.remove();
        Object.assign(state, {host: null, shadow: null, selection: null, result: null,
            translating: false, saving: false, saved: false, error: "", copied: false, toolbarError: ""});
    }

    function readSelection() {
        const selection = window.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed || elementOf(document.activeElement)?.closest(EDITABLE)) return null;
        const range = selection.getRangeAt(0);
        const start = elementOf(range.startContainer), end = elementOf(range.endContainer);
        if (!start || !end || start.closest(`${EDITABLE},${OWN_UI}`) || end.closest(`${EDITABLE},${OWN_UI}`)) return null;
        const originalText = selection.toString();
        const sourceText = originalText.replace(/\s+/g, " ").trim();
        if (!sourceText || sourceText.length > Core.SELECTION_MAX_CHARS) return null;
        const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
        if (!rect || (!rect.width && !rect.height)) return null;
        const block = start.closest("p,li,blockquote,figcaption,td,dd,h1,h2,h3,h4,h5,h6,article,main") || start;
        const clone = block.cloneNode(true);
        for (const node of clone.querySelectorAll("[data-ytbt-immersive-translation],script,style,[data-ytbt-selection-root]")) node.remove();
        const context = (clone.textContent || "").replace(/\s+/g, " ").trim();
        const index = context.toLowerCase().indexOf(sourceText.toLowerCase());
        const offset = Math.max(0, index - 600);
        return {sourceText, originalText, contextText: context.slice(offset, offset + 1800),
            sourceUrl: location.href, sourceTitle: document.title, rect};
    }

    function capture() {
        if (!state.ready || !state.enabled) return;
        // Selecting/copying the result or focusing its buttons keeps the card open.
        if (document.activeElement === state.host || window.getSelection()?.anchorNode?.getRootNode() === state.shadow ||
            state.host?.contains(window.getSelection()?.anchorNode)) return;
        const selection = readSelection();
        if (!selection) { if (state.host && !state.translating) dismiss(); return; }
        if (state.selection?.originalText === selection.originalText && state.selection?.contextText === selection.contextText &&
            state.selection?.sourceUrl === selection.sourceUrl) {
            state.selection.rect = selection.rect;
            position();
            return;
        }
        dismiss();
        state.selection = selection;
        mount();
        render();
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(capture, 160);
    }

    function mount() {
        const host = document.createElement("div");
        host.dataset.ytbtSelectionRoot = "";
        host.dataset.ytbtImmersiveRoot = "";
        host.style.cssText = "all:initial!important;position:fixed!important;z-index:2147483647!important;pointer-events:none!important;";
        state.host = host;
        state.shadow = host.attachShadow({mode: "open"});
        const style = document.createElement("style");
        style.textContent = `
            :host{color-scheme:light dark}*{box-sizing:border-box}svg{display:block;flex-shrink:0}
            .surface{pointer-events:auto;font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#172033;background:#fff;border:1px solid #dae1eb;border-radius:14px;box-shadow:0 10px 40px #17203326}
            button{font:inherit;cursor:pointer;border:0;border-radius:9px;padding:7px 11px;background:#edf1f7;color:inherit}button:hover{background:#e2e9f3}button:focus-visible{outline:2px solid #6688f2;outline-offset:2px}button:disabled{opacity:.6;cursor:default}
            .selection-toolbar{--tool-size:24px;display:flex;align-items:center;flex-wrap:wrap;gap:2px;width:max-content;max-width:calc(100vw - 16px);padding:1px;border-radius:9px;box-shadow:0 2px 12px #17203318}
            .selection-toolbar[data-size=regular]{--tool-size:28px}.selection-toolbar[data-size=comfortable]{--tool-size:36px}
            .selection-tool{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;width:var(--tool-size);height:var(--tool-size);padding:0;border-radius:6px;background:transparent;color:#596579;font-size:12px;line-height:1;white-space:nowrap}
            .selection-tool svg{width:16px;height:16px}.selection-tool:hover{background:#edf1f7;color:#304dc0}.selection-trigger{color:#4562c8}
            .selection-toolbar[data-labels=true] .selection-tool{width:auto;min-width:var(--tool-size);padding:0 7px}
            .selection-tool[data-copied=true]{color:#267454}.toolbar-feedback{flex-basis:100%;max-width:240px;margin:0;padding:4px 7px;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
            .sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
            .selection-card{padding:16px;width:min(360px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;text-align:left}
            header{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#68758a}header button{padding:0 7px;font-size:20px;background:transparent}
            .source{font-weight:650;margin:10px 0 8px;overflow-wrap:anywhere;white-space:pre-wrap;max-height:100px;overflow:auto}
            .translation{margin:0 0 12px;overflow-wrap:anywhere;white-space:pre-wrap}.error{color:#ba3535}
            .actions{display:flex;flex-wrap:wrap;gap:8px}.save{background:#4562c8;color:#fff}.save:hover{background:#3753b9}.book{background:transparent;color:#4562c8}.hint{font-size:12px;color:#68758a;margin:10px 0 0}
            @media(prefers-color-scheme:dark){.surface{background:#1c2431;color:#e8edf6;border-color:#3d4859}button{background:#303c50}button:hover{background:#3e4e67}.selection-tool{background:transparent;color:#b3bfd2}.selection-tool:hover{background:#303c50;color:#d9e2ff}.selection-trigger,.book{color:#a7baff}.selection-tool[data-copied=true]{color:#89d6b4}header,.hint{color:#a7b1c2}.error{color:#ffaaaa}.save{background:#4562c8}.book,header button{background:transparent}}
        `;
        state.shadow.append(style);
        document.documentElement.append(host);
    }

    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function button(className, text, action) {
        const element = node("button", className, text);
        element.type = "button";
        element.addEventListener("click", action);
        return element;
    }

    function render() {
        if (!state.shadow || !state.selection) return;
        const focusedAction = state.shadow.activeElement?.dataset.action;
        state.shadow.querySelector(".surface")?.remove();
        if (!state.translating && !state.result && !state.error) {
            const toolbar = node("div", "surface selection-toolbar");
            toolbar.setAttribute("role", "toolbar");
            toolbar.setAttribute("aria-label", "划词工具栏");
            toolbar.dataset.size = state.toolbar.size;
            toolbar.dataset.labels = String(state.toolbar.showLabels);
            const actions = {translate, copy: copySelection, vocabulary: openBook, dismiss};
            for (const id of state.toolbar.actions) {
                const action = Core.SELECTION_TOOLBAR_ACTIONS.find(item => item.id === id);
                const tool = button(`selection-tool${id === "translate" ? " selection-trigger" : ""}`, "", actions[id]);
                tool.dataset.action = id;
                const copied = id === "copy" && state.copied;
                tool.setAttribute("aria-label", action.title);
                tool.title = copied ? "已复制" : action.title;
                if (copied) tool.dataset.copied = "true";
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                for (const [key, value] of Object.entries({viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
                    "stroke-width": "1.65", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true"})) svg.setAttribute(key, value);
                const path = document.createElementNS(svg.namespaceURI, "path");
                path.setAttribute("d", copied ? "m5 12 4 4L19 6" : action.path);
                svg.append(path);
                tool.append(svg);
                if (state.toolbar.showLabels) tool.append(node("span", "", action.label));
                // Keep the page selection intact when a mouse activates a toolbar button.
                tool.addEventListener("mousedown", event => event.preventDefault());
                toolbar.append(tool);
            }
            toolbar.addEventListener("keydown", event => {
                const buttons = [...toolbar.querySelectorAll("button")];
                const index = buttons.indexOf(state.shadow.activeElement);
                if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
                    (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next].focus();
            });
            if (state.toolbarError || state.copied) {
                const feedback = node("p", state.toolbarError ? "toolbar-feedback error" : "sr-only", state.toolbarError || "已复制所选文字");
                feedback.setAttribute("role", "status");
                toolbar.append(feedback);
            }
            state.shadow.append(toolbar);
            if (focusedAction) toolbar.querySelector(`[data-action="${focusedAction}"]`)?.focus();
        } else {
            const card = node("section", "surface selection-card");
            card.setAttribute("role", "dialog");
            card.setAttribute("aria-label", "划词翻译");
            const header = node("header");
            header.append(node("span", "", "AuraTranslate · 划词翻译"));
            const close = button("close", "×", dismiss);
            close.setAttribute("aria-label", "关闭划词翻译");
            header.append(close);
            const translated = node("p", `translation${state.error ? " error" : ""}`,
                state.translating ? "正在翻译…" : state.error || state.result?.translatedText);
            translated.setAttribute("role", "status");
            translated.setAttribute("aria-live", "polite");
            card.append(header, node("p", "source", state.selection.sourceText), translated);
            const actions = node("div", "actions");
            if (state.result) {
                const save = button("save", state.saving ? "正在收藏…" : state.saved ? "已收藏" : "收藏到生词本", saveWord);
                save.disabled = state.saving || state.saved;
                actions.append(save);
            } else if (!state.translating) actions.append(button("retry", "重试翻译", translate));
            actions.append(button("book", "打开生词本", openBook));
            card.append(actions);
            if (state.saved) card.append(node("p", "hint", "已保存原文、译文、上下文和来源。"));
            state.shadow.append(card);
        }
        position();
    }

    function position() {
        if (!state.host || !state.selection) return;
        const selected = window.getSelection();
        if (selected?.rangeCount && selected.anchorNode?.getRootNode() !== state.shadow &&
            selected.toString().replace(/\s+/g, " ").trim() === state.selection.sourceText) {
            const range = selected.getRangeAt(0);
            if (typeof range.getBoundingClientRect === "function") {
                const rect = range.getBoundingClientRect();
                if (rect.width || rect.height) state.selection.rect = rect;
            }
        }
        const rect = state.selection.rect;
        const viewport = window.visualViewport;
        const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
        const rightEdge = leftEdge + (viewport?.width || innerWidth);
        const bottomEdge = topEdge + (viewport?.height || innerHeight);
        const surface = state.shadow.querySelector(".surface");
        const isToolbar = surface.classList.contains("selection-toolbar");
        const width = surface.offsetWidth || (isToolbar ? 28 : 360), height = surface.offsetHeight || (isToolbar ? 28 : 44);
        state.host.style.setProperty("left", `${Math.max(leftEdge + 8, Math.min(rect.right, rightEdge - width - 8))}px`, "important");
        const below = rect.bottom + 6, above = rect.top - height - 6;
        const preferAbove = isToolbar && state.toolbar.position === "above";
        const top = preferAbove ? (above >= topEdge + 8 ? above : below) :
            (below + height <= bottomEdge - 8 ? below : above);
        state.host.style.setProperty("top", `${Math.max(topEdge + 8, Math.min(top, bottomEdge - height - 8))}px`, "important");
    }

    async function copySelection() {
        if (!state.selection) return;
        const revision = state.revision;
        const text = state.selection.originalText;
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else {
                // HTTP pages may not expose Clipboard API. Keep a synchronous fallback in the user gesture.
                const selection = window.getSelection();
                const ranges = Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange());
                const focused = state.shadow.activeElement || document.activeElement;
                const input = node("textarea");
                input.value = text;
                input.readOnly = true;
                input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
                state.shadow.append(input);
                try {
                    input.select();
                    if (!document.execCommand?.("copy")) throw new Error("clipboard unavailable");
                } finally {
                    input.remove();
                    selection.removeAllRanges();
                    ranges.forEach(range => selection.addRange(range));
                    focused?.focus({preventScroll: true});
                }
            }
            if (revision === state.revision) { state.copied = true; state.toolbarError = ""; }
        } catch (_) {
            if (revision === state.revision) { state.copied = false; state.toolbarError = "无法复制，请使用系统复制菜单或 Ctrl/Cmd+C。"; }
        }
        if (revision === state.revision) render();
    }

    async function translate() {
        if (!state.selection || state.translating) return;
        const revision = state.revision, selection = state.selection;
        state.translating = true;
        state.error = "";
        render();
        try {
            const {rect, originalText, ...payload} = selection;
            const result = await send({type: "SELECTION_TRANSLATE", ...payload});
            if (revision !== state.revision) return;
            if (location.href !== selection.sourceUrl) { dismiss(); return; }
            state.result = result;
        } catch (error) {
            if (revision !== state.revision) return;
            state.error = `翻译失败：${error.message}`;
        } finally {
            if (revision === state.revision) { state.translating = false; render(); }
        }
    }

    async function saveWord() {
        if (!state.result || state.saving || state.saved) return;
        const revision = state.revision;
        state.saving = true;
        state.error = "";
        render();
        try {
            await send({type: "VOCABULARY", action: "add", entry: state.result});
            if (revision === state.revision) state.saved = true;
        } catch (error) {
            if (revision === state.revision) state.error = `收藏失败：${error.message}`;
        } finally {
            if (revision === state.revision) { state.saving = false; render(); }
        }
    }

    async function openBook() {
        const revision = state.revision;
        try { await send({type: "OPEN_VOCABULARY"}); }
        catch (error) {
            if (revision === state.revision) { state.error = `无法打开生词本：${error.message}`; render(); }
        }
    }

    document.addEventListener("selectionchange", schedule);
    document.addEventListener("pointerup", schedule);
    document.addEventListener("keyup", (event) => {
        if (event.key === "Escape") dismiss();
        else if (event.key.startsWith("Arrow") || event.key === "Shift") schedule();
    });
    document.addEventListener("pointerdown", (event) => {
        if (state.host && !event.composedPath().includes(state.host)) dismiss();
    }, true);
    document.addEventListener("scroll", (event) => {
        if (state.host && !event.composedPath().includes(state.host)) dismiss();
    }, true);
    window.addEventListener("resize", position);
    window.addEventListener("blur", () => {
        if (document.activeElement?.tagName === "IFRAME") dismiss();
    });
    window.visualViewport?.addEventListener("resize", position);
    window.addEventListener("popstate", dismiss);
    window.addEventListener("hashchange", dismiss);
    chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.selectionTranslationEnabled) state.enabled = changes.selectionTranslationEnabled.newValue !== false;
        if (changes.selectionToolbar) state.toolbar = Core.normalizeSelectionToolbar(changes.selectionToolbar.newValue);
        if (!state.enabled) dismiss();
        else if (changes.selectionToolbar) render();
    });
    chrome.storage.local.get({selectionTranslationEnabled: true, selectionToolbar: Core.DEFAULT_SETTINGS.selectionToolbar}, (settings) => {
        const error = chrome.runtime.lastError;
        if (error) return;
        state.enabled = settings.selectionTranslationEnabled !== false;
        state.toolbar = Core.normalizeSelectionToolbar(settings.selectionToolbar);
        state.ready = true;
        capture();
    });
})();
