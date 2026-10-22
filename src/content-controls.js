// Player tools share the content-script scope, but React owns their markup.
// The controller keeps the player/caption state and pushes snapshots into the
// mounted PlayerTools component.
var playerControls = null;
var playerControlsTimer = null;

function startPlayerControls() {
    if (IS_DRIVE_PLAYER || playerControlsTimer) return;
    updatePlayerControls();
    playerControlsTimer = setInterval(updatePlayerControls, 250);
    document.addEventListener("pointerdown", (event) => {
        if (playerControls && !event.target.closest(".ytbt-player-ui, .ytbt-player-button")) closePlayerMenu();
    });
    document.addEventListener("fullscreenchange", () => {
        if (playerControls) playerControls.panel.style.removeProperty("left");
        if (playerControls) playerControls.panel.style.removeProperty("top");
        updatePlayerControls();
    });
}

function createPlayerControls() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ytp-button ytbt-player-button";
    button.title = "AuraTranslate";
    button.setAttribute("aria-label", "AuraTranslate");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "ytbt-player-menu");

    const root = document.createElement("div");
    root.className = "ytbt-player-ui";
    root.setAttribute("translate", "no");

    playerControls = {
        button, root, menu: null, panel: null,
        data: null, view: "transcript", rows: [], query: "", limit: 200,
        activeCue: null, follow: true, menuOpen: false, styleView: false, panelOpen: false,
        error: "", react: null, dragBound: false
    };
    if (globalThis.AuraContentUI) {
        globalThis.AuraContentUI.mountPlayerButton(button, {iconUrl: chrome.runtime.getURL("icons/icon-32.png")});
        playerControls.react = globalThis.AuraContentUI.mountPlayerTools(root, buildPlayerToolsProps(playerControls));
    } else {
        const logo = document.createElement("img");
        logo.src = chrome.runtime.getURL("icons/icon-32.png");
        logo.alt = "";
        logo.draggable = false;
        button.appendChild(logo);
    }
    playerControls.menu = root.querySelector(".ytbt-player-menu");
    playerControls.panel = root.querySelector(".ytbt-tools-panel");

    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = !playerControls.menuOpen;
        playerControls.menuOpen = open;
        playerControls.styleView = false;
        button.setAttribute("aria-expanded", String(open));
        if (open) {
            playerControls.panelOpen = false;
            positionPlayerTools();
        }
        renderPlayerTools();
        if (open) {
            root.querySelector("[data-setting]")?.focus();
        }
    });
    button.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") closePlayerMenu();
    });
    for (const type of ["click", "dblclick", "pointerdown", "pointerup", "keyup"]) root.addEventListener(type, (event) => event.stopPropagation());
    root.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
            event.preventDefault();
            if (playerControls.styleView && playerControls.menuOpen) showPlayerStyle(false);
            else {
                closePlayerMenu();
                closePlayerPanel();
                button.focus();
            }
        }
    });
    bindPlayerPanelDrag();
    syncPlayerControlsSettings();
    return playerControls;
}

function buildPlayerToolsProps(ui) {
    const config = Core.resolveTranslationConfig(state.settings);
    const data = ui.data;
    return {
        menuOpen: ui.menuOpen,
        styleView: ui.styleView,
        panelOpen: ui.panelOpen,
        view: ui.view,
        error: ui.error,
        settings: {
            subtitleEnabled: state.settings.subtitleEnabled,
            subtitleDisplayMode: state.settings.subtitleDisplayMode,
            fontScale: state.settings.fontScale,
            subtitleBackgroundOpacity: state.settings.subtitleBackgroundOpacity,
            subtitleColor: state.settings.subtitleColor
        },
        transcript: {
            rows: ui.rows,
            count: ui.matchCount || 0,
            hasMore: (ui.matchCount || 0) > ui.limit,
            hasCues: playerToolCues().length > 0,
            loading: Boolean(data && data.loading),
            empty: data && data.loading
                ? "正在读取字幕..."
                : (data && data.error) || (ui.query ? "没有匹配的字幕" : "暂无字幕"),
            query: ui.query,
            follow: ui.follow
        },
        summary: {
            model: config.model || "未配置模型",
            text: (data && data.summary) || "",
            status: (data && (data.summaryStatus || data.error)) || "",
            summarizing: Boolean(data && data.summarizing)
        },
        onAction: (action) => handlePlayerControlAction(action).catch(showPlayerControlError),
        onSetting: applyPlayerSetting,
        onSearch: updatePlayerSearch,
        onFollow: updatePlayerFollow,
        onSeek: seekPlayerCue
    };
}

function renderPlayerTools() {
    const ui = playerControls;
    if (!ui || !ui.react) return;
    ui.react.update(buildPlayerToolsProps(ui));
}

function applyPlayerSetting(key, value) {
    state.settings[key] = value;
    state.settings = normalizeSettings(state.settings);
    applySettings();
    savePlayerSettings({[key]: value}).catch(showPlayerControlError);
}

function updatePlayerSearch(value) {
    const ui = playerControls;
    if (!ui) return;
    ui.query = String(value || "").trim().toLocaleLowerCase();
    ui.limit = 200;
    renderPlayerTranscript();
}

function updatePlayerFollow(checked) {
    const ui = playerControls;
    if (!ui || ui.follow === Boolean(checked)) return;
    ui.follow = Boolean(checked);
    if (!ui.follow) ui.activeCue = null;
    renderPlayerTools();
}

function seekPlayerCue(cue) {
    const video = state.video || document.querySelector("video");
    if (!video) return;
    video.currentTime = cue.startMs / 1000;
    handleSeek();
}

function readPlayerSetting(input) {
    return input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
}

async function savePlayerSettings(values) {
    try {
        await storageSet(values);
        state.settings = normalizeSettings(Object.assign({}, state.settings, values));
        applySettings();
        if (values.subtitleEnabled) requestPlayerResponse();
        showPlayerControlError(null);
    } catch (error) {
        await loadSettings();
        applySettings();
        throw error;
    }
}

function syncPlayerControlsSettings() {
    if (!playerControls) return;
    playerControls.button.dataset.enabled = String(state.settings.subtitleEnabled);
    renderPlayerTools();
}

function closePlayerMenu() {
    if (!playerControls || !playerControls.menuOpen) return;
    playerControls.menuOpen = false;
    playerControls.button.setAttribute("aria-expanded", "false");
    renderPlayerTools();
}

function closePlayerPanel() {
    if (!playerControls || !playerControls.panelOpen) return;
    playerControls.panelOpen = false;
    renderPlayerTools();
}

function showPlayerStyle(show) {
    if (!playerControls) return;
    playerControls.styleView = Boolean(show);
    renderPlayerTools();
    if (show) playerControls.root.querySelector("[data-action='back']")?.focus();
}

function showPlayerControlError(error) {
    if (!playerControls) return;
    playerControls.error = error ? (error.message || String(error)) : "";
    renderPlayerTools();
}

async function handlePlayerControlAction(action) {
    const ui = playerControls;
    if (!ui) return;
    if (action === "style") showPlayerStyle(true);
    else if (action === "back") showPlayerStyle(false);
    else if (action === "close-menu") {
        closePlayerMenu();
        ui.button.focus();
    } else if (action === "close-panel") {
        closePlayerPanel();
        ui.button.focus();
    } else if (action === "reset-style") await savePlayerSettings({fontScale: 1, subtitleColor: "#ffffff", subtitleBackgroundOpacity: 0.88, subtitleDisplayMode: "bilingual"});
    else if (action === "reset-position") await savePlayerSettings({subtitlePosition: null});
    else if (action === "transcript" || action === "summary") {
        closePlayerMenu();
        ui.panelOpen = true;
        ui.view = action;
        renderPlayerTools();
        positionPlayerTools();
        ui.root.querySelector(action === "transcript" ? ".ytbt-transcript-search" : ".ytbt-summary-text")?.focus();
        await loadPlayerToolCues();
        if (action === "summary") await requestPlayerSummary(true);
    } else if (action === "more") {
        ui.limit += 200;
        renderPlayerTranscript();
    } else if (action === "load-captions") await loadPlayerToolCues();
    else if (action === "generate-summary") await requestPlayerSummary(false);
    else if (action === "copy-summary") {
        try {
            await navigator.clipboard.writeText(ui.data.summary);
            ui.data.summaryStatus = "已复制";
        } catch (error) {
            ui.data.summaryStatus = "复制失败，请选中总结文字复制。";
        }
        renderPlayerSummary();
    }
}

function updatePlayerControls() {
    const player = findVideoPlayer();
    if (!player) {
        if (playerControls) {
            closePlayerPanel();
            closePlayerMenu();
            playerControls.root.remove();
            playerControls.button.remove();
        }
        return;
    }
    const controls = player.querySelector(".ytp-right-controls");
    if (!controls) {
        if (playerControls && !playerControls.button.isConnected) {
            closePlayerPanel();
            closePlayerMenu();
            playerControls.root.remove();
            playerControls.button.remove();
        }
        return;
    }
    const ui = playerControls || createPlayerControls();
    if (ui.button.parentElement !== controls) controls.insertBefore(ui.button, controls.firstChild);
    const host = document.fullscreenElement || document.body;
    if (host && ui.root.parentElement !== host) {
        host.appendChild(ui.root);
        ui.panel.style.removeProperty("left");
        ui.panel.style.removeProperty("top");
    }
    syncPlayerToolsTheme();
    positionPlayerTools();
    const videoId = getUrlVideoId() || state.videoId;
    const config = Core.resolveTranslationConfig(state.settings);
    const key = JSON.stringify([videoId, state.settings.sourceLanguage, state.settings.targetLanguage,
        config.provider, config.model, config.baseUrl, state.settings.cacheVersion]);
    if (!ui.data || ui.data.key !== key) {
        ui.data = {key, videoId, rawCues: [], loading: null, error: "", summary: "", summaryStatus: "", summarizing: false, cacheChecked: false};
        ui.activeCue = null;
        ui.query = "";
        ui.limit = 200;
        if (ui.panelOpen) loadPlayerToolCues();
    }
    if (ui.panelOpen) {
        clampPlayerPanel();
        if (ui.view === "transcript") renderPlayerTranscript();
        else renderPlayerSummary();
    }
}

function playerToolCues() {
    const data = playerControls && playerControls.data;
    return data && data.videoId === state.videoId && state.cues.length ? state.cues : data ? data.rawCues : [];
}

async function loadPlayerToolCues() {
    const ui = playerControls;
    if (!ui) return;
    const data = ui.data;
    if (!data || playerToolCues().length) return;
    if (data.loading) return data.loading;
    data.error = "";
    data.loading = (async () => {
        try {
            if (state.captionLoadPromise && state.videoId === data.videoId) await state.captionLoadPromise;
            if (ui.data !== data || playerToolCues().length) return;
            let response = state.lastPlayerResponse;
            if (!response || response.videoId !== data.videoId) {
                requestPlayerResponse();
                for (let attempt = 0; attempt < 15; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    if (ui.data !== data) return;
                    response = state.lastPlayerResponse;
                    if (response && response.videoId === data.videoId) break;
                }
            }
            if (!response || response.videoId !== data.videoId) throw new Error("尚未读取到视频信息，请稍后重新读取。");
            const track = selectSourceTrack(response.captionTracks || []);
            if (!track && !hasTranscriptApi(response.transcript)) throw new Error("当前视频没有可用的源语言字幕。");
            // Reading the list must not enable subtitle translation or segmentation.
            const cues = await fetchCaptionData(track, data.videoId, response.transcript);
            if (ui.data !== data) return;
            data.rawCues = cues;
            if (!cues.length) throw new Error("当前视频没有可用字幕。");
        } catch (error) {
            if (ui.data === data) data.error = formatCaptionLoadError(error);
        } finally {
            data.loading = null;
            if (ui.data === data) {
                renderPlayerTranscript();
                renderPlayerSummary();
            }
        }
    })();
    return data.loading;
}

function playerTimestamp(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderPlayerTranscript() {
    const ui = playerControls;
    if (!ui || !ui.data) return;
    const cues = Core.getCaptionDisplayCues(playerToolCues());
    const current = Core.findCueAtTime(cues, getCurrentTimeMs());
    if (ui.follow && !ui.query && current && cues.indexOf(current) >= ui.limit) {
        ui.limit = cues.indexOf(current) + 100;
    }
    const matches = cues.filter((cue) => !ui.query || `${cue.sourceText} ${cue.displaySourceText || ""} ${cue.translatedText || ""}`.toLocaleLowerCase().includes(ui.query));
    const followMoved = ui.follow && current && current !== ui.activeCue;
    ui.rows = matches.slice(0, ui.limit).map((cue) => ({
        cue,
        start: playerTimestamp(cue.startMs),
        original: cue.displaySourceText || cue.sourceText || "",
        translation: cue.translatedText || "",
        current: cue === current
    }));
    ui.matchCount = matches.length;
    ui.activeCue = current;
    renderPlayerTools();
    if (followMoved && ui.panelOpen && ui.view === "transcript") {
        const list = ui.root.querySelector(".ytbt-cue-list");
        const row = list && list.querySelector('.ytbt-cue-row[aria-current="true"]');
        if (list && row) list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - list.clientHeight / 3);
    }
}

async function requestPlayerSummary(cacheOnly) {
    const ui = playerControls;
    if (!ui) return;
    const data = ui.data;
    if (!data || data.summarizing || data.summary || (cacheOnly && data.cacheChecked)) return;
    data.summarizing = true;
    data.summaryStatus = cacheOnly ? "正在读取总结缓存..." : "正在生成总结...";
    renderPlayerSummary();
    try {
        await loadPlayerToolCues();
        if (ui.data !== data) return;
        const cues = playerToolCues();
        if (!cues.length) throw new Error(data.error || "没有可总结的字幕。");
        const result = await Core.sendRuntimeMessage(chrome.runtime, {
            type: "SUMMARIZE_VIDEO", videoId: data.videoId, cacheOnly,
            cues: cues.map((cue) => ({startMs: cue.startMs, sourceText: cue.sourceText}))
        }, 130000);
        if (ui.data !== data) return;
        if (!result || !result.ok) throw new Error(result && result.error || "总结请求失败。");
        data.cacheChecked = true;
        data.summary = result.text || "";
        data.summaryStatus = result.warning || (result.cached && result.text ? "已读取缓存" : "");
    } catch (error) {
        if (ui.data === data) data.summaryStatus = error.message || String(error);
    } finally {
        data.summarizing = false;
        if (ui.data === data) renderPlayerSummary();
    }
}

function renderPlayerSummary() {
    renderPlayerTools();
}

function clampPlayerPanel() {
    const panel = playerControls && playerControls.panel;
    if (!panel || !panel.style.left) return;
    panel.style.left = `${Math.max(8, Math.min(parseFloat(panel.style.left), window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(parseFloat(panel.style.top), window.innerHeight - panel.offsetHeight - 8))}px`;
}

function syncPlayerToolsTheme() {
    const html = document.documentElement;
    const page = document.querySelector("ytd-app") || document.body;
    let dark = html.hasAttribute("dark");
    if (!dark) {
        let background;
        for (let element = page; element; element = element.parentElement) {
            const channels = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number);
            if (channels && channels.length >= 3 && (channels.length < 4 || channels[3] >= 0.5)) { background = channels; break; }
        }
        dark = background ? background[0] * 0.2126 + background[1] * 0.7152 + background[2] * 0.0722 < 128
            : getComputedStyle(html).colorScheme === "dark" || window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
    if (playerControls) playerControls.root.dataset.theme = dark ? "dark" : "light";
}

function positionPlayerTools() {
    const ui = playerControls;
    const player = findVideoPlayer();
    if (!ui || !player || !ui.menu || !ui.panel) return;
    const rect = player.getBoundingClientRect();
    const control = ui.button.getBoundingClientRect();
    ui.menu.style.right = `${Math.max(8, window.innerWidth - Math.min(rect.right - 8, control.right + 16))}px`;
    ui.menu.style.bottom = `${Math.max(8, window.innerHeight - control.top + 8)}px`;
    ui.menu.style.maxHeight = `${Math.max(80, control.top - 16)}px`;
    const fullscreen = Boolean(document.fullscreenElement);
    ui.root.dataset.fullscreen = String(fullscreen);
    if (!ui.panel.style.left) {
        ui.panel.style.top = `${fullscreen ? 12 : Math.max(12, Math.min(rect.top, 80))}px`;
        ui.panel.style.height = `${Math.max(160, window.innerHeight - parseFloat(ui.panel.style.top) - 16)}px`;
    }
}

function bindPlayerPanelDrag() {
    const ui = playerControls;
    const panel = ui && ui.panel;
    const handle = panel && panel.querySelector(".ytbt-panel-handle");
    if (!handle || ui.dragBound) return;
    ui.dragBound = true;
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button") || window.innerWidth < 760) return;
        const rect = panel.getBoundingClientRect();
        drag = {x: event.clientX - rect.left, y: event.clientY - rect.top};
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
        if (!drag) return;
        panel.style.left = `${event.clientX - drag.x}px`;
        panel.style.top = `${event.clientY - drag.y}px`;
        clampPlayerPanel();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(type, () => { drag = null; });
}
