// Selection UI lives in a shadow root so webpage styles cannot alter its controls.
// React renders the toolbar and card; this controller owns selection capture,
// translation, copy fallbacks and the shadow host.
(function () {
    "use strict";
    const Core = globalThis.YTBTCore;
    if (!Core || !globalThis.chrome?.runtime || globalThis.YTBTSelection) return;
    const state = {ready: false, enabled: true, revision: 0, selection: null, host: null,
        shadow: null, container: null, view: null, result: null, translating: false, saving: false,
        saved: false, error: "", toolbar: Core.normalizeSelectionToolbar(), copied: false, toolbarError: ""};
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
        const view = state.view;
        state.view = null;
        Object.assign(state, {host: null, shadow: null, container: null, selection: null, result: null,
            translating: false, saving: false, saved: false, error: "", copied: false, toolbarError: ""});
        if (view) view.unmount();
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
        state.container = document.createElement("div");
        state.shadow.append(state.container);
        document.documentElement.append(host);
        if (globalThis.AuraContentUI) {
            state.view = globalThis.AuraContentUI.mountSelection(state.container, selectionProps());
        }
    }

    function selectionProps() {
        const mode = !state.translating && !state.result && !state.error ? "toolbar" : "card";
        return {
            mode,
            toolbar: state.toolbar,
            selection: state.selection,
            result: state.result,
            translating: state.translating,
            saving: state.saving,
            saved: state.saved,
            error: state.error,
            copied: state.copied,
            toolbarError: state.toolbarError,
            onAction: handleSelectionAction
        };
    }

    function handleSelectionAction(action) {
        if (action === "translate" || action === "retry") translate();
        else if (action === "copy") copySelection();
        else if (action === "vocabulary" || action === "book") openBook();
        else if (action === "save") saveWord();
        else if (action === "dismiss") dismiss();
    }

    function render() {
        if (!state.shadow || !state.selection || !state.view) return;
        const focusedAction = state.shadow.activeElement?.dataset.action;
        state.view.update(selectionProps());
        if (focusedAction) state.shadow.querySelector(`[data-action="${focusedAction}"]`)?.focus();
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
                const input = document.createElement("textarea");
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
