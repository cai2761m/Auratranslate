// Share requests across tabs and retain completed results even if storage fails.
const inFlightVideoSummaries = new Map();
const completedVideoSummaries = new Map();
let summaryCacheWriteQueue = Promise.resolve();
const SUMMARY_MAX_CHARACTERS = 120000;

async function handleSummarizeVideo(message) {
    const settings = await storageGet(Core.DEFAULT_SETTINGS);
    const config = Core.resolveTranslationConfig(settings);
    const endpoint = config.apiStyle === "gemini" ? config.generateContentUrl : config.chatCompletionsUrl;
    if (!config.apiKey || !endpoint || !config.model) {
        throw new Error("请先在扩展设置中配置字幕翻译服务和模型。");
    }
    const input = Array.isArray(message.cues) ? message.cues : [];
    if (!input.length || input.length > 20000) throw new Error("没有可总结的字幕，或字幕条数超过 20000 条。");
    const cues = input.map((cue) => ({
        startMs: Number(cue && cue.startMs),
        sourceText: Core.normalizeSubtitleText(cue && cue.sourceText)
    }));
    if (cues.some((cue) => !Number.isFinite(cue.startMs) || cue.startMs < 0 || !cue.sourceText)) {
        throw new Error("字幕内容或时间戳无效，请刷新视频后重试。");
    }
    if (cues.reduce((total, cue) => total + cue.sourceText.length, 0) > SUMMARY_MAX_CHARACTERS) {
        throw new Error("字幕超过 12 万字符，暂不支持整段总结。");
    }
    // Sentence preparation changes cue boundaries while preserving source words.
    // Keep a completed summary reusable as those windows finish in the background.
    const transcriptText = cues.map((cue) => cue.sourceText).join("").replace(/\s+/g, "");
    const fingerprint = Core.fingerprintText(JSON.stringify([
        "summary-v1", message.videoId, transcriptText, settings.sourceLanguage, config.provider, endpoint, config.model,
        settings.targetLanguage, settings.cacheVersion
    ]));
    const key = `ytbt:summary:${fingerprint}`;
    const cached = await storageGet({[key]: null});
    if (cached[key] && typeof cached[key].text === "string" && cached[key].text.trim()) {
        return {type: "SUMMARIZE_VIDEO_RESULT", ok: true, videoId: message.videoId, text: cached[key].text, cached: true};
    }
    // Cache-only reads let reopening the panel restore a result without spending tokens.
    if (message.cacheOnly && !completedVideoSummaries.has(key) && !inFlightVideoSummaries.has(key)) {
        return {type: "SUMMARIZE_VIDEO_RESULT", ok: true, videoId: message.videoId, text: "", cached: false};
    }
    let pending = inFlightVideoSummaries.get(key);
    if (!pending) {
        pending = (async () => {
            const text = completedVideoSummaries.get(key) || await translateBatch({
                translationConfig: config, targetLanguage: settings.targetLanguage,
                sourceLanguage: settings.sourceLanguage, cues, mode: "summary"
            });
            completedVideoSummaries.set(key, text);
            while (completedVideoSummaries.size > 30) completedVideoSummaries.delete(completedVideoSummaries.keys().next().value);
            let warning = "";
            try {
                const write = summaryCacheWriteQueue.then(async () => {
                    await storageSet({[key]: {kind: "video-summary", text, updatedAt: Date.now()}});
                    const all = await storageGet(null);
                    const old = Object.entries(all).filter(([name]) => name.startsWith("ytbt:summary:") && name !== key)
                        .sort((a, b) => Number(b[1] && b[1].updatedAt || 0) - Number(a[1] && a[1].updatedAt || 0)).slice(29);
                    if (old.length) await storageRemove(old.map(([name]) => name));
                });
                summaryCacheWriteQueue = write.catch(() => {});
                await write;
            } catch (error) {
                warning = "总结已生成，但本地缓存保存失败。";
            }
            return {type: "SUMMARIZE_VIDEO_RESULT", ok: true, videoId: message.videoId, text, warning};
        })();
        inFlightVideoSummaries.set(key, pending);
        pending.finally(() => {
            if (inFlightVideoSummaries.get(key) === pending) inFlightVideoSummaries.delete(key);
        }).catch(() => {});
    }
    return pending;
}
