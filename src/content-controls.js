// Player controls share the content-script scope, but keep their own UI state.
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

function playerControlIcon(name) {
    // Match the extension's existing shared icon set.
    const paths = {
        subtitles: "M3 5h18v14H3zM6 13h5M14 13h4M6 16h3M12 16h6",
        settings: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6",
        list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
        summary: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
        close: "m6 6 12 12M18 6 6 18",
        back: "m14 5-7 7 7 7",
        copy: "M8 8h12v13H8zM16 8V3H3v13h5",
        reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6"
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.subtitles}"/></svg>`;
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
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("icons/icon-32.png");
    logo.alt = "";
    logo.draggable = false;
    button.appendChild(logo);
    const root = document.createElement("div");
    root.className = "ytbt-player-ui";
    root.setAttribute("translate", "no");
    root.innerHTML = `
      <section id="ytbt-player-menu" class="ytbt-player-menu" role="dialog" aria-label="AuraTranslate" hidden>
        <div class="ytbt-menu-main">
          <label class="ytbt-menu-row">${playerControlIcon("subtitles")}<span>视频字幕</span><input type="checkbox" role="switch" data-setting="subtitleEnabled" aria-label="视频字幕"><span class="ytbt-switch" aria-hidden="true"></span></label>
          <button type="button" class="ytbt-menu-row" data-action="style">${playerControlIcon("settings")}<span>字幕样式</span><span aria-hidden="true">›</span></button>
          <button type="button" class="ytbt-menu-row" data-action="transcript">${playerControlIcon("list")}<span>悬浮字幕列表</span></button>
          <button type="button" class="ytbt-menu-row" data-action="summary">${playerControlIcon("summary")}<span>AI 总结</span></button>
        </div>
        <div class="ytbt-menu-style" hidden>
          <div class="ytbt-style-heading"><button type="button" class="ytbt-icon-button" data-action="back" title="返回" aria-label="返回">${playerControlIcon("back")}</button><strong>字幕样式</strong><button type="button" class="ytbt-icon-button" data-action="reset-style" title="恢复默认样式" aria-label="恢复默认样式">${playerControlIcon("reset")}</button></div>
          <label class="ytbt-style-field">显示模式<select data-setting="subtitleDisplayMode" aria-label="显示模式"><option value="bilingual">双语字幕</option><option value="translation">仅译文</option><option value="original">仅原文</option></select></label>
          <label class="ytbt-style-field">字号<output class="ytbt-font-value"></output><input type="range" min="0.3" max="3" step="0.05" data-setting="fontScale" aria-label="字幕字号"></label>
          <label class="ytbt-style-field">背景不透明度<output class="ytbt-opacity-value"></output><input type="range" min="0" max="1" step="0.05" data-setting="subtitleBackgroundOpacity" aria-label="背景不透明度"></label>
          <label class="ytbt-style-field ytbt-color-field">文字颜色<input type="color" data-setting="subtitleColor" aria-label="字幕文字颜色"></label>
          <button type="button" class="ytbt-text-button" data-action="reset-position">重置字幕位置</button>
        </div>
        <p class="ytbt-tools-error" role="status" hidden></p>
      </section>
      <section class="ytbt-tools-panel" role="dialog" aria-label="AuraTranslate 字幕与总结" hidden>
        <div class="ytbt-panel-tabs ytbt-panel-handle"><button type="button" data-action="transcript" aria-pressed="true">字幕列表</button><button type="button" data-action="summary" aria-pressed="false">AI 总结</button><button type="button" class="ytbt-icon-button" data-action="close-panel" title="关闭面板" aria-label="关闭面板">${playerControlIcon("close")}</button></div>
        <div class="ytbt-transcript-view">
          <div class="ytbt-list-toolbar"><input type="search" class="ytbt-transcript-search" placeholder="搜索字幕" aria-label="搜索字幕"><label><input type="checkbox" class="ytbt-follow" checked>跟随播放</label></div>
          <div class="ytbt-cue-list" tabindex="0" aria-label="视频字幕列表"></div>
          <footer class="ytbt-list-footer"><span class="ytbt-cue-count"></span><button type="button" class="ytbt-text-button" data-action="load-captions" hidden>重新读取</button><button type="button" class="ytbt-text-button" data-action="more" hidden>加载更多</button></footer>
        </div>
        <div class="ytbt-summary-view" hidden>
          <div class="ytbt-summary-toolbar"><span class="ytbt-summary-model"></span><button type="button" class="ytbt-icon-button" data-action="copy-summary" title="复制总结" aria-label="复制总结" disabled>${playerControlIcon("copy")}</button></div>
          <div class="ytbt-summary-text" tabindex="0"></div>
          <p class="ytbt-summary-status" role="status"></p>
          <button type="button" class="ytbt-primary-button" data-action="generate-summary">${playerControlIcon("summary")}<span>生成总结</span></button>
        </div>
      </section>`;
    playerControls = {
        button, root, menu: root.querySelector(".ytbt-player-menu"), panel: root.querySelector(".ytbt-tools-panel"),
        data: null, view: "transcript", rows: [], renderedCues: null, query: "", limit: 200, activeCue: null
    };
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const open = playerControls.menu.hidden;
        playerControls.menu.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
        if (open) {
            closePlayerPanel();
            showPlayerStyle(false);
            positionPlayerTools();
            playerControls.menu.querySelector("[data-setting]").focus();
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
            if (!root.querySelector(".ytbt-menu-style").hidden && !playerControls.menu.hidden) showPlayerStyle(false);
            else { closePlayerMenu(); closePlayerPanel(); button.focus(); }
        }
    });
    root.addEventListener("click", (event) => {
        const action = event.target.closest("[data-action]");
        if (action) handlePlayerControlAction(action.dataset.action).catch(showPlayerControlError);
    });
    root.addEventListener("input", (event) => {
        const key = event.target.dataset.setting;
        if (key && event.target.type !== "checkbox") {
            state.settings[key] = readPlayerSetting(event.target);
            state.settings = normalizeSettings(state.settings);
            applySettings();
        }
        if (event.target.matches(".ytbt-transcript-search")) {
            playerControls.query = event.target.value.trim().toLocaleLowerCase();
            playerControls.limit = 200;
            playerControls.renderedCues = null;
            renderPlayerTranscript();
        }
    });
    root.addEventListener("change", (event) => {
        const key = event.target.dataset.setting;
        if (key) savePlayerSettings({[key]: readPlayerSetting(event.target)}).catch(showPlayerControlError);
        if (event.target.matches(".ytbt-follow")) playerControls.activeCue = null;
    });
    root.querySelector(".ytbt-cue-list").addEventListener("wheel", () => { root.querySelector(".ytbt-follow").checked = false; }, {passive: true});
    root.querySelector(".ytbt-cue-list").addEventListener("touchmove", () => { root.querySelector(".ytbt-follow").checked = false; }, {passive: true});
    bindPlayerPanelDrag();
    syncPlayerControlsSettings();
    return playerControls;
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
        playerControls.root.querySelector(".ytbt-tools-error").hidden = true;
    } catch (error) {
        await loadSettings();
        applySettings();
        throw error;
    }
}

function syncPlayerControlsSettings() {
    if (!playerControls) return;
    for (const input of playerControls.root.querySelectorAll("[data-setting]")) {
        const value = state.settings[input.dataset.setting];
        if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = String(value);
    }
    playerControls.button.dataset.enabled = String(state.settings.subtitleEnabled);
    playerControls.root.querySelector(".ytbt-font-value").textContent = `${Number(state.settings.fontScale).toFixed(2)}x`;
    playerControls.root.querySelector(".ytbt-opacity-value").textContent = `${Math.round(state.settings.subtitleBackgroundOpacity * 100)}%`;
}

function closePlayerMenu() {
    if (!playerControls) return;
    playerControls.menu.hidden = true;
    playerControls.button.setAttribute("aria-expanded", "false");
}

function closePlayerPanel() {
    if (!playerControls) return;
    playerControls.panel.hidden = true;
}

function showPlayerStyle(show) {
    playerControls.root.querySelector(".ytbt-menu-main").hidden = show;
    playerControls.root.querySelector(".ytbt-menu-style").hidden = !show;
    if (show) playerControls.root.querySelector("[data-action='back']").focus();
}

function showPlayerControlError(error) {
    const node = playerControls.root.querySelector(".ytbt-tools-error");
    node.textContent = error.message || String(error);
    node.hidden = false;
}

async function handlePlayerControlAction(action) {
    const ui = playerControls;
    if (action === "style") showPlayerStyle(true);
    else if (action === "back") showPlayerStyle(false);
    else if (action === "close-menu") { closePlayerMenu(); ui.button.focus(); }
    else if (action === "close-panel") { closePlayerPanel(); ui.button.focus(); }
    else if (action === "reset-style") await savePlayerSettings({fontScale: 1, subtitleColor: "#ffffff", subtitleBackgroundOpacity: 0.88, subtitleDisplayMode: "bilingual"});
    else if (action === "reset-position") await savePlayerSettings({subtitlePosition: null});
    else if (action === "transcript" || action === "summary") {
        closePlayerMenu();
        ui.panel.hidden = false;
        positionPlayerTools();
        ui.view = action;
        ui.root.querySelector(".ytbt-transcript-view").hidden = action !== "transcript";
        ui.root.querySelector(".ytbt-summary-view").hidden = action !== "summary";
        for (const tab of ui.root.querySelectorAll(".ytbt-panel-tabs button")) tab.setAttribute("aria-pressed", String(tab.dataset.action === action));
        ui.root.querySelector(action === "transcript" ? ".ytbt-transcript-search" : ".ytbt-summary-text").focus();
        await loadPlayerToolCues();
        if (action === "summary") await requestPlayerSummary(true);
    } else if (action === "more") { ui.limit += 200; ui.renderedCues = null; renderPlayerTranscript(); }
    else if (action === "load-captions") await loadPlayerToolCues();
    else if (action === "generate-summary") await requestPlayerSummary(false);
    else if (action === "copy-summary") {
        try {
            await navigator.clipboard.writeText(ui.data.summary);
            ui.data.summaryStatus = "已复制";
        } catch (error) { ui.data.summaryStatus = "复制失败，请选中总结文字复制。"; }
        renderPlayerSummary();
    }
}

function updatePlayerControls() {
    const player = findVideoPlayer();
    if (!player) {
        if (playerControls) { closePlayerPanel(); closePlayerMenu(); playerControls.root.remove(); playerControls.button.remove(); }
        return;
    }
    const controls = player.querySelector(".ytp-right-controls");
    if (!controls) {
        if (playerControls && !playerControls.button.isConnected) {
            closePlayerPanel();
            playerControls.root.remove();
            playerControls.button.remove();
        }
        return;
    }
    const ui = playerControls || createPlayerControls();
    if (ui.button.parentElement !== controls) controls.insertBefore(ui.button, controls.firstChild);
    const host = document.fullscreenElement || document.body;
    if (host && ui.root.parentElement !== host) { host.appendChild(ui.root); ui.panel.style.removeProperty("left"); ui.panel.style.removeProperty("top"); }
    syncPlayerToolsTheme();
    positionPlayerTools();
    const videoId = getUrlVideoId() || state.videoId;
    const config = Core.resolveTranslationConfig(state.settings);
    const key = JSON.stringify([videoId, state.settings.sourceLanguage, state.settings.targetLanguage,
        config.provider, config.model, config.baseUrl, state.settings.cacheVersion]);
    if (!ui.data || ui.data.key !== key) {
        ui.data = {key, videoId, rawCues: [], loading: null, error: "", summary: "", summaryStatus: "", summarizing: false, cacheChecked: false};
        ui.renderedCues = null;
        ui.activeCue = null;
        ui.query = "";
        ui.limit = 200;
        ui.root.querySelector(".ytbt-transcript-search").value = "";
        if (!ui.panel.hidden) loadPlayerToolCues();
    }
    if (!ui.panel.hidden) {
        clampPlayerPanel();
        if (ui.view === "transcript") renderPlayerTranscript();
        else renderPlayerSummary();
    }
}

function playerToolCues() {
    const data = playerControls.data;
    return data && data.videoId === state.videoId && state.cues.length ? state.cues : data ? data.rawCues : [];
}

async function loadPlayerToolCues() {
    const ui = playerControls;
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
            if (ui.data === data) { ui.renderedCues = null; renderPlayerTranscript(); renderPlayerSummary(); }
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
    if (!ui || !ui.data || ui.panel.hidden || ui.view !== "transcript") return;
    const cues = Core.getCaptionDisplayCues(playerToolCues());
    const list = ui.root.querySelector(".ytbt-cue-list");
    const current = Core.findCueAtTime(cues, getCurrentTimeMs());
    const follow = ui.root.querySelector(".ytbt-follow").checked;
    if (follow && !ui.query && current && cues.indexOf(current) >= ui.limit) {
        ui.limit = cues.indexOf(current) + 100;
        ui.renderedCues = null;
    }
    if (ui.renderedCues !== cues) {
        ui.renderedCues = cues;
        const matches = cues.filter((cue) => !ui.query || `${cue.sourceText} ${cue.displaySourceText || ""} ${cue.translatedText || ""}`.toLocaleLowerCase().includes(ui.query));
        const fragment = document.createDocumentFragment();
        ui.rows = matches.slice(0, ui.limit).map((cue) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "ytbt-cue-row";
            const time = document.createElement("time");
            time.textContent = playerTimestamp(cue.startMs);
            const text = document.createElement("span");
            const source = document.createElement("span");
            const translation = document.createElement("span");
            source.className = "ytbt-cue-source";
            translation.className = "ytbt-cue-translation";
            text.append(source, translation);
            row.append(time, text);
            row.addEventListener("click", () => {
                const video = state.video || document.querySelector("video");
                if (video) { video.currentTime = cue.startMs / 1000; handleSeek(); }
            });
            fragment.appendChild(row);
            return {cue, row, source, translation};
        });
        if (!matches.length) {
            const empty = document.createElement("p");
            empty.className = "ytbt-list-empty";
            empty.textContent = ui.data.loading ? "正在读取字幕..." : ui.data.error || (ui.query ? "没有匹配的字幕" : "暂无字幕");
            fragment.appendChild(empty);
        }
        list.replaceChildren(fragment);
        ui.root.querySelector(".ytbt-cue-count").textContent = `${matches.length} 条字幕`;
        ui.root.querySelector("[data-action='more']").hidden = matches.length <= ui.limit;
    }
    ui.root.querySelector("[data-action='load-captions']").hidden = Boolean(cues.length || ui.data.loading);
    for (const {cue, row, source, translation} of ui.rows) {
        const original = cue.displaySourceText || cue.sourceText || "";
        if (source.textContent !== original) source.textContent = original;
        if (translation.textContent !== (cue.translatedText || "")) translation.textContent = cue.translatedText || "";
        row.setAttribute("aria-current", String(cue === current));
        if (follow && current !== ui.activeCue && cue === current) list.scrollTop = Math.max(0, row.offsetTop - list.offsetTop - list.clientHeight / 3);
    }
    ui.activeCue = current;
}

async function requestPlayerSummary(cacheOnly) {
    const ui = playerControls;
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
    const ui = playerControls;
    if (!ui || !ui.data) return;
    const config = Core.resolveTranslationConfig(state.settings);
    ui.root.querySelector(".ytbt-summary-model").textContent = config.model || "未配置模型";
    const text = ui.root.querySelector(".ytbt-summary-text");
    const content = ui.data.summary || "";
    if (text.textContent !== content) text.textContent = content;
    ui.root.querySelector(".ytbt-summary-status").textContent = ui.data.summaryStatus || ui.data.error || "";
    const generate = ui.root.querySelector("[data-action='generate-summary']");
    generate.hidden = Boolean(ui.data.summary);
    generate.disabled = ui.data.summarizing;
    generate.querySelector("span").textContent = ui.data.summarizing ? "处理中..." : "生成总结";
    ui.root.querySelector("[data-action='copy-summary']").disabled = !ui.data.summary;
}

function clampPlayerPanel() {
    const panel = playerControls.panel;
    if (!panel.style.left) return;
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
    playerControls.root.dataset.theme = dark ? "dark" : "light";
}

function positionPlayerTools() {
    const ui = playerControls;
    const player = findVideoPlayer();
    if (!ui || !player) return;
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
    const panel = playerControls.panel;
    const handle = panel.querySelector(".ytbt-panel-handle");
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
