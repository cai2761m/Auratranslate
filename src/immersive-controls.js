// Floating control, dragging, preferences, and display modes.
// Modules share only YTBTImmersive; startup runs last in immersive.js.
(function () {
    "use strict";
    const App = globalThis.YTBTImmersive;
    if (!App) return;
    const {Core, state} = App;

    const BALL_EDGE_PADDING_PX = 8;
    const BALL_DOCK_GAP_PX = 12;
    const BALL_DRAG_THRESHOLD_PX = 4;
    let themeObserver = null;
    let themeUpdateScheduled = false;

    function mountControls() {
        if (state.ball || !document.body) {
            return;
        }

        const ballContainer = document.createElement("div");
        ballContainer.className = "ytbt-immersive-tab";
        ballContainer.dataset.ytbtImmersiveRoot = "true";

        const ball = document.createElement("button");
        ball.type = "button";
        ball.className = "ytbt-immersive-ball";
        ball.setAttribute("aria-label", "翻译当前网页");
        ball.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M6.5 22 13 6.8a1.1 1.1 0 0 1 2 0L21.5 22"/>
      <path class="ytbt-aurora-trail" d="M5 21c4-5.5 7-4.3 11-2.6 2.9 1.2 5.4.5 7-1.2"/>
      <path class="ytbt-aurora-ribbon" d="M4.5 18.5c4-5.6 7.4-4.2 11.1-2.3 3.1 1.6 5.8 1.2 8-1.8"/>
    </svg>`;

        ballContainer.appendChild(ball);

        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "ytbt-immersive-dismiss";
        dismiss.title = "关闭悬浮小球";
        dismiss.setAttribute("aria-label", "关闭悬浮小球");
        dismiss.setAttribute("aria-haspopup", "dialog");
        dismiss.setAttribute("aria-expanded", "false");
        dismiss.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
        ballContainer.appendChild(dismiss);

        const dismissMenu = document.createElement("div");
        dismissMenu.className = "ytbt-immersive-dismiss-menu";
        dismissMenu.dataset.ytbtImmersiveRoot = "true";
        dismissMenu.setAttribute("role", "dialog");
        dismissMenu.setAttribute("aria-label", "关闭悬浮小球");
        dismissMenu.hidden = true;
        dismissMenu.innerHTML = '<button type="button" data-dismiss="session">本次关闭（刷新后恢复）</button><button type="button" data-dismiss="site">禁用本网站</button><p role="status" hidden></p>';
        dismiss.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            dismissMenu.hidden = !dismissMenu.hidden;
            dismiss.setAttribute("aria-expanded", String(!dismissMenu.hidden));
            ballContainer.dataset.ytbtDismissOpen = String(!dismissMenu.hidden);
            positionDismissMenu();
            if (!dismissMenu.hidden) dismissMenu.querySelector("button").focus();
            syncPanel();
        });
        dismissMenu.addEventListener("click", async (event) => {
            const action = event.target.closest("[data-dismiss]")?.dataset.dismiss;
            if (!action) return;
            event.stopPropagation();
            if (action === "session") {
                state.controlDismissed = true;
                syncControlVisibility();
                return;
            }
            try {
                const stored = await App.storageGet({immersiveDisabledSites: []});
                const sites = [...new Set([...(Array.isArray(stored.immersiveDisabledSites) ? stored.immersiveDisabledSites : []), location.hostname.toLowerCase()])];
                await App.storageSet({immersiveDisabledSites: sites});
                state.preferences.immersiveDisabledSites = sites;
                syncControlVisibility();
            } catch (error) {
                const message = dismissMenu.querySelector("p");
                message.textContent = "保存失败，请稍后重试。";
                message.hidden = false;
            }
        });
        dismissMenu.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") { closeDismissMenu(); dismiss.focus(); }
        });
        document.addEventListener("pointerdown", (event) => {
            if (!event.target.closest?.(".ytbt-immersive-dismiss-menu, .ytbt-immersive-tab")) closeDismissMenu();
        });

        const panel = document.createElement("div");
        panel.className = "ytbt-immersive-panel";
        panel.dataset.ytbtImmersiveRoot = "true";
        panel.hidden = true;
        panel.setAttribute("role", "status");

        ballContainer.addEventListener("pointerdown", handleBallPointerDown, true);
        ballContainer.addEventListener("click", handleBallClick);
        ballContainer.addEventListener("pointerenter", handleControlPointerEnter);
        ballContainer.addEventListener("pointerleave", handleControlPointerLeave);
        ballContainer.addEventListener("transitionend", (event) => {
            if (event.target === ballContainer && event.propertyName === "right") updateBallTheme();
        });
        ball.addEventListener("focus", handleControlPointerEnter);
        ball.addEventListener("blur", handleControlPointerLeave);
        panel.addEventListener("pointerenter", handleControlPointerEnter);
        panel.addEventListener("pointerleave", handleControlPointerLeave);
        document.body.appendChild(ballContainer);
        document.body.appendChild(panel);
        document.body.appendChild(dismissMenu);

        state.ball = ballContainer;
        state.ballText = null;
        state.panel = panel;
        state.dismissMenu = dismissMenu;
        loadBallPosition();
        updateBallMode("idle");
        updateBallTheme();
        observePageTheme();
        syncControlVisibility();
        state.preferencesReady.then(() => { syncControlVisibility(); maybeAutoTranslate(); });
    }

    function isSiteDisabled() {
        return Array.isArray(state.preferences.immersiveDisabledSites) && state.preferences.immersiveDisabledSites.includes(location.hostname.toLowerCase());
    }

    function closeDismissMenu() {
        if (state.dismissMenu) state.dismissMenu.hidden = true;
        if (state.ball) {
            state.ball.dataset.ytbtDismissOpen = "false";
            state.ball.querySelector(".ytbt-immersive-dismiss")?.setAttribute("aria-expanded", "false");
        }
    }

    function syncControlVisibility() {
        if (!state.ball) return;
        state.ball.hidden = Boolean(state.controlDismissed || isSiteDisabled());
        if (state.ball.hidden) {
            closeDismissMenu();
            state.pointerOverControl = false;
        }
        syncPanel();
    }

    function observePageTheme() {
        const scheduleUpdate = () => {
            if (themeUpdateScheduled) return;
            themeUpdateScheduled = true;
            requestAnimationFrame(() => {
                themeUpdateScheduled = false;
                updateBallTheme();
            });
        };

        themeObserver = new MutationObserver(scheduleUpdate);
        for (const element of [document.documentElement, document.body]) {
            if (element) themeObserver.observe(element, {attributes: true, attributeFilter: ["class", "style"]});
        }
        window.addEventListener("scroll", scheduleUpdate, {passive: true, capture: true});
        window.addEventListener("resize", scheduleUpdate, {passive: true});
        window.addEventListener("pageshow", scheduleUpdate);
        const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
        colorScheme?.addEventListener?.("change", scheduleUpdate);
    }

    function updateBallTheme() {
        if (!state.ball) return;
        const rect = state.ball.getBoundingClientRect();
        const x = App.clamp(rect.left + rect.width / 2, 0, Math.max(0, window.innerWidth - 1));
        const y = App.clamp(rect.top + rect.height / 2, 0, Math.max(0, window.innerHeight - 1));
        const layers = document.elementsFromPoint?.(x, y) || [];
        const pageElement = layers.find((element) => !element.closest?.("[data-ytbt-immersive-root]"));
        const brightness = samplePageBrightness(pageElement);
        state.ball.dataset.ytbtTheme = brightness >= 0.5 ? "light" : "dark";
        if (state.panel) state.panel.dataset.ytbtTheme = state.ball.dataset.ytbtTheme;
        if (state.dismissMenu) state.dismissMenu.dataset.ytbtTheme = state.ball.dataset.ytbtTheme;
        positionStatusPanel();
        positionDismissMenu();
    }

    function samplePageBrightness(element) {
        const scheme = getComputedStyle(document.documentElement).colorScheme || "";
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        let color = scheme.includes("dark") || prefersDark ? [0, 0, 0] : [255, 255, 255];

        const backgrounds = [];
        for (let current = element; current; current = current.parentElement) {
            const background = parseRgba(getComputedStyle(current).backgroundColor);
            if (!background) continue;
            backgrounds.push(background);
            if (background[3] >= 1) break;
        }
        // Paint ancestors first so a translucent child remains above its parent.
        for (const background of backgrounds.reverse()) {
            const alpha = background[3];
            color = background.slice(0, 3).map((channel, index) => channel * alpha + color[index] * (1 - alpha));
        }

        const linear = color.map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }

    function parseRgba(value) {
        const channels = value?.match(/[\d.]+/g)?.map(Number);
        if (!channels || channels.length < 3) return null;
        return [channels[0], channels[1], channels[2], channels.length > 3 ? channels[3] : 1];
    }

    async function loadPreferences() {
        try {
            state.preferences = {...await App.storageGet(Core.DEFAULT_SETTINGS)};
        } catch (_) { /* Manual translation can still report a storage error. */
        }
        applyDisplayMode();
        syncControlVisibility();
    }

    function maybeAutoTranslate() {
        if (state.controlDismissed || isSiteDisabled()) return;
        const rule = state.preferences.immersiveSiteRules?.[location.hostname];
        const enabled = rule === "always" || (rule !== "never" && state.preferences.immersiveAutoTranslate === true);
        if (enabled && state.ball && !state.translated && state.mode === "idle") App.translateCurrentPage();
    }

    function applyDisplayMode() {
        const translationOnly = state.preferences.immersiveDisplayMode === "translation";
        document.documentElement.classList.toggle("ytbt-translation-only", translationOnly);
        for (const container of document.querySelectorAll("[data-ytbt-immersive-translation][data-ytbt-state='done']")) {
            const source = container.parentElement;
            if (translationOnly && !source.querySelector(":scope > [data-ytbt-original]")) {
                const original = document.createElement("span");
                original.dataset.ytbtOriginal = "true";
                for (const child of Array.from(source.childNodes)) if (child !== container) original.appendChild(child);
                source.insertBefore(original, container);
            }
        }
        if (!translationOnly) restoreOriginalNodes();
    }

    function restoreOriginalNodes() {
        for (const original of document.querySelectorAll("[data-ytbt-original]")) original.replaceWith(...original.childNodes);
    }

    function handleControlPointerEnter() {
        state.pointerOverControl = true;
        syncPanel();
    }

    function handleControlPointerLeave() {
        state.pointerOverControl = false;
        syncPanel();
    }

    async function handleBallClick(event) {
        event.preventDefault();
        event.stopPropagation();
        App.syncPageIdentity();

        if (state.ballDrag.suppressClick) {
            state.ballDrag.suppressClick = false;
            return;
        }

        if (state.mode === "translating") {
            showStatus("Translation is already running...", true);
            return;
        }

        if (state.translated) {
            state.visible = !state.visible;
            document.documentElement.classList.toggle("ytbt-immersive-hidden", !state.visible);
            showStatus(state.visible ? "Bilingual translations shown." : "Bilingual translations hidden.");
            updateBallMode(state.visible ? "done" : "idle");
            return;
        }

        await App.translateCurrentPage();
    }

    function handleBallPointerDown(event) {
        if (event.target.closest?.(".ytbt-immersive-dismiss")) return;
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }
        if (state.ballDrag.pointerId != null) {
            cancelBallDrag();
        }

        const rect = state.ball.getBoundingClientRect();
        state.ballDrag.pointerId = event.pointerId;
        state.ballDrag.startClientX = event.clientX;
        state.ballDrag.startClientY = event.clientY;
        state.ballDrag.offsetY = event.clientY - rect.top;
        state.ballDrag.startRight = parseFloat(window.getComputedStyle(state.ball).right) || 0;
        state.ballDrag.active = false;

        state.ball.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", handleBallPointerMove, true);
        document.addEventListener("pointerup", handleBallPointerUp, true);
        document.addEventListener("pointercancel", handleBallPointerCancel, true);
    }

    function handleBallPointerMove(event) {
        const drag = state.ballDrag;
        if (drag.pointerId !== event.pointerId) {
            return;
        }

        const distanceX = Math.abs(event.clientX - drag.startClientX);
        const distanceY = Math.abs(event.clientY - drag.startClientY);
        if (!drag.active && (distanceX >= BALL_DRAG_THRESHOLD_PX || distanceY >= BALL_DRAG_THRESHOLD_PX)) {
            drag.active = true;
            state.ball.classList.add("ytbt-immersive-dragging");
        }

        if (!drag.active) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        moveBallToClient(event.clientX, event.clientY);
    }

    function handleBallPointerUp(event) {
        const drag = state.ballDrag;
        if (drag.pointerId !== event.pointerId) {
            return;
        }

        if (drag.active) {
            event.preventDefault();
            event.stopPropagation();
            drag.suppressClick = true;
            state.ball.style.right = `${BALL_DOCK_GAP_PX}px`;
            updateBallTheme();
            saveBallPosition();
        }
        cancelBallDrag();
    }

    function handleBallPointerCancel(event) {
        if (event && state.ballDrag.pointerId !== event.pointerId) {
            return;
        }
        if (state.ballDrag.active && state.ball) {
            state.ball.style.right = `${BALL_DOCK_GAP_PX}px`;
            updateBallTheme();
        }
        cancelBallDrag();
    }

    function cancelBallDrag() {
        if (state.ball && state.ballDrag.pointerId != null) {
            try {
                state.ball.releasePointerCapture(state.ballDrag.pointerId);
            } catch (error) {
                // Ignore browsers that already released the pointer.
            }
            state.ball.classList.remove("ytbt-immersive-dragging");
        }

        document.removeEventListener("pointermove", handleBallPointerMove, true);
        document.removeEventListener("pointerup", handleBallPointerUp, true);
        document.removeEventListener("pointercancel", handleBallPointerCancel, true);

        state.ballDrag.pointerId = null;
        state.ballDrag.active = false;
    }

    function moveBallToClient(clientX, clientY) {
        if (!state.ball) {
            return;
        }

        const rect = state.ball.getBoundingClientRect();
        const halfHeight = rect.height / 2 || 16;
        const minCenterY = BALL_EDGE_PADDING_PX + halfHeight;
        const maxCenterY = window.innerHeight - BALL_EDGE_PADDING_PX - halfHeight;
        const rawCenterY = clientY - state.ballDrag.offsetY + halfHeight;
        const centerY = App.clamp(rawCenterY, Math.min(minCenterY, maxCenterY), Math.max(minCenterY, maxCenterY));

        state.ballTopPct = (centerY / Math.max(1, window.innerHeight)) * 100;

        let newRight = state.ballDrag.startRight - (clientX - state.ballDrag.startClientX);
        newRight = App.clamp(newRight, 0, window.innerWidth - rect.width);
        state.ball.style.right = `${newRight}px`;

        applyBallPosition();
    }

    function applyBallPosition() {
        const topPct = App.clamp(Number(state.ballTopPct) || App.DEFAULT_BALL_TOP_PCT, 4, 96);
        state.ballTopPct = topPct;

        if (state.ball) {
            const edge = BALL_EDGE_PADDING_PX + (state.ball.offsetHeight || 38) / 2;
            state.ball.style.top = `clamp(${edge}px, ${topPct}%, calc(100% - ${edge}px))`;
            updateBallTheme();
        }
        positionStatusPanel();
    }

    async function loadBallPosition() {
        try {
            const values = await App.storageGet({immersiveBallTopPct: App.DEFAULT_BALL_TOP_PCT});
            state.ballTopPct = normalizeBallTopPct(values.immersiveBallTopPct);
            applyBallPosition();
        } catch (error) {
            applyBallPosition();
        }
    }

    async function saveBallPosition() {
        const topPct = normalizeBallTopPct(state.ballTopPct);
        state.ballTopPct = topPct;
        applyBallPosition();
        try {
            await App.storageSet({immersiveBallTopPct: topPct});
        } catch (error) {
            // Position persistence is nice-to-have; dragging should still work.
        }
    }

    function normalizeBallTopPct(value) {
        const number = Number(value);
        return Number.isFinite(number) ? App.clamp(number, 4, 96) : App.DEFAULT_BALL_TOP_PCT;
    }

    function updateBallMode(mode) {
        state.mode = mode;
        if (!state.ball) {
            return;
        }
        state.ball.dataset.ytbtState = mode;
        const button = state.ball.querySelector("button");
        if (button) {
            const label = mode === "translating" ? "正在翻译"
                : mode === "done" ? "隐藏网页译文"
                    : mode === "error" ? "翻译失败，点击重试"
                        : state.translated ? "显示网页译文" : "翻译当前网页";
            button.setAttribute("aria-label", label);
            button.setAttribute("aria-busy", String(mode === "translating"));
            state.ball.dataset.ytbtLabel = `${label}\n拖动调整位置`;
        }
    }

    // The panel is a hover surface: translation progress is recorded here but is
    // never pushed on screen on its own. Only the pointer over the floating
    // control opens it, so reading the page stays unobstructed while the
    // background work runs.
    function showStatus(message, persistent) {
        if (state.panelTimer) {
            clearTimeout(state.panelTimer);
            state.panelTimer = null;
        }

        state.panelStatusText = message || "";
        state.panelStatusPersistent = Boolean(persistent) && Boolean(state.panelStatusText);

        if (state.panelStatusText && !state.panelStatusPersistent) {
            state.panelTimer = setTimeout(() => {
                state.panelTimer = null;
                state.panelStatusText = "";
                state.panelStatusPersistent = false;
                syncPanel();
            }, 3600);
        }

        syncPanel();
    }

    function syncPanel() {
        const panel = state.panel;
        if (!panel) {
            return;
        }

        const text = state.panelStatusText;
        // Mirror the stored status exactly: a cleared status must not leave the
        // previous message behind for the next hover to reveal.
        if (panel.textContent !== text) {
            panel.textContent = text;
        }
        panel.hidden = !text || !state.pointerOverControl || state.ball?.hidden || Boolean(state.dismissMenu && !state.dismissMenu.hidden);
        if (state.ball) state.ball.dataset.ytbtHasStatus = String(Boolean(text));
        positionStatusPanel();
    }

    function positionStatusPanel() {
        if (!state.ball || !state.panel || state.panel.hidden) return;
        const rect = state.ball.getBoundingClientRect();
        const height = state.panel.getBoundingClientRect().height;
        const below = rect.bottom + 12;
        const top = below + height <= window.innerHeight - 8 ? below : rect.top - height - 12;
        state.panel.style.top = `${Math.max(8, top)}px`;
    }

    function positionDismissMenu() {
        if (!state.ball || !state.dismissMenu || state.dismissMenu.hidden) return;
        const rect = state.ball.getBoundingClientRect();
        const height = state.dismissMenu.getBoundingClientRect().height;
        const below = rect.bottom + 12;
        state.dismissMenu.style.top = `${Math.max(8, below + height <= window.innerHeight - 8 ? below : rect.top - height - 12)}px`;
    }

    Object.assign(App, {
        mountControls,
        loadPreferences,
        maybeAutoTranslate,
        syncControlVisibility,
        isSiteDisabled,
        applyDisplayMode,
        restoreOriginalNodes,
        updateBallMode,
        showStatus
    });
})();
