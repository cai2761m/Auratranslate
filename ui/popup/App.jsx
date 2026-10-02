import { useEffect, useRef, useState } from "react";
import { Icon } from "../shared/Icon";
import {
  api,
  Core,
  storageGet,
  storageSet,
  storageRemove,
  modelLabel,
  popupSelection,
  popupServicePatch,
  THEME_LABELS,
  nextTheme,
  applyTheme,
} from "../shared/settings";

const LANGUAGES = [
  ["zh-CN", "简体中文"],
  ["zh-TW", "繁体中文"],
  ["en", "英语"],
  ["ja", "日语"],
  ["ko", "韩语"],
  ["fr", "法语"],
  ["de", "德语"],
  ["es", "西班牙语"],
];

export function PopupApp() {
  const [settings, setSettings] = useState(null);
  const [page, setPage] = useState(null);
  const [hostname, setHostname] = useState("");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState(null);
  const busy = useRef(false);
  const startBusy = useRef(false);
  const tab = useRef(null);
  const alive = useRef(true);
  const message = (type) =>
    api((done) =>
      chrome.tabs.sendMessage(tab.current.id, { type }, { frameId: 0 }, done),
    );
  useEffect(() => {
    alive.current = true;
    let interval;
    async function init() {
      const saved = await storageGet(Core.DEFAULT_SETTINGS);
      if (saved.immersiveTranslationService === "google-cloud") {
        saved.immersiveTranslationService = "ai";
        await storageSet({ immersiveTranslationService: "ai" });
        await storageRemove([
          "immersiveFallbackProvider",
          "immersiveGoogleApiKey",
        ]);
      }
      let host = "",
        response = null;
      try {
        [tab.current] = await api((done) =>
          chrome.tabs.query({ active: true, currentWindow: true }, done),
        );
        const url = new URL(tab.current?.url || "");
        if (/^https?:$/.test(url.protocol)) host = url.hostname;
      } catch {
        /* Settings remain usable on restricted pages. */
      }
      if (host) {
        try {
          response = await message("IMMERSIVE_POPUP_STATUS");
        } catch {}
      }
      if (!alive.current) return;
      setSettings(saved);
      setHostname(host);
      setPage(response);
      let probing = false;
      interval = setInterval(async () => {
        if (!host || busy.current || startBusy.current || probing) return;
        probing = true;
        try {
          const next = await message("IMMERSIVE_POPUP_STATUS");
          if (alive.current && !busy.current && !startBusy.current) {
            if (
              `${response?.mode}:${response?.status}:${response?.translated}` !==
              `${next?.mode}:${next?.status}:${next?.translated}`
            )
              setNotice(null);
            response = next;
            setPage(next);
          }
        } catch {
          /* Keep the last useful status when a tab closes. */
        } finally {
          probing = false;
        }
      }, 1000);
    }
    init().catch((error) => {
      if (alive.current)
        setNotice({ text: `无法读取设置：${error.message}`, error: true });
    });
    return () => {
      alive.current = false;
      clearInterval(interval);
    };
  }, []);
  async function save(values) {
    if (busy.current || !values) return false;
    busy.current = true;
    setSaving(true);
    try {
      await storageSet(values);
      if (alive.current) {
        setSettings((old) => ({ ...old, ...values }));
        setNotice({ text: "设置已保存" });
      }
      return true;
    } catch (error) {
      if (alive.current)
        setNotice({ text: `保存失败：${error.message}`, error: true });
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  async function translate() {
    if (
      startBusy.current ||
      busy.current ||
      page?.mode === "translating" ||
      !page?.ok
    )
      return;
    startBusy.current = true;
    setStarting(true);
    try {
      const response = await message("IMMERSIVE_POPUP_TRANSLATE");
      if (!response?.ok) throw new Error(response?.error || "网页未响应");
      if (alive.current) {
        setPage(response);
        setNotice(null);
      }
    } catch (error) {
      if (alive.current)
        setNotice({
          text: `无法启动翻译，请刷新网页后重试。${error.message}`,
          error: true,
        });
    } finally {
      startBusy.current = false;
      if (alive.current) setStarting(false);
    }
  }
  async function cycleTheme() {
    const previous = theme;
    const next = nextTheme(previous);
    // Repaint first so the click feels immediate; undo it if nothing was saved.
    applyTheme(next);
    if (!(await save({ uiTheme: next }))) applyTheme(previous);
  }
  function openSettings() {
    if (chrome.runtime.openOptionsPage)
      chrome.runtime.openOptionsPage(() => window.close());
    else
      chrome.tabs.create(
        { url: chrome.runtime.getURL("options/options.html") },
        () => window.close(),
      );
  }
  const s = settings || Core.DEFAULT_SETTINGS;
  const theme = Core.normalizeUiTheme(s.uiTheme);
  const { plan, service, model } = popupSelection(s);
  const translation = s.immersiveDisplayMode === "translation";
  const running = page?.mode === "translating" || starting;
  const disabled = !settings || saving;
  const ai = s.immersiveTranslationService !== "google-free";
  const hint = !service
    ? "请在设置 → 翻译服务中添加供应商和模型。"
    : !model
      ? "请在设置 → 翻译服务中为此供应商添加模型。"
      : "";
  const rule = s.immersiveSiteRules?.[hostname] || "inherit";
  let status = notice || {
    text: !settings
      ? "正在读取设置…"
      : !hostname
        ? "请在普通网页中使用翻译，设置仍可修改。"
        : !page?.ok
          ? "请刷新当前网页，让扩展连接后再翻译。"
          : running
            ? "正在翻译，完成后会直接显示在网页中。"
            : page.translated
              ? "网页翻译已完成，可随时切换双语或仅译文。"
              : page.status ||
                (translation ? "仅显示译文" : "原文与译文对照显示"),
    error: page?.mode === "error",
  };
  const saveService = (id, requested) =>
    save(popupServicePatch(s, id, requested));
  return (
    <main className={`popup${more ? " more-open" : ""}`}>
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="aurora" />
          </span>
          <div>
            <h1>AuraTranslate</h1>
            <p className="brand-caption">让阅读跨越语言</p>
          </div>
        </div>
        <span id="version" className="version">
          v{chrome.runtime.getManifest().version}
        </span>
      </header>
      <div className="current-page">
        <Icon name="globe" />
        <span>{hostname || "当前页面"}</span>
        <span className="page-kind">网页翻译</span>
      </div>
      <section className="translation-controls" aria-label="网页翻译">
        {/* One card for every input the translation needs. The language pair
            and the provider used to be two nested cards with two shadows,
            which boxed four fields into three layers. */}
        <div className="control-card">
        <div className="language-pair">
          <label className="select-field">
            <span>原文语言</span>
            <select
              id="source-language"
              aria-label="原文语言"
              disabled={disabled || running}
              value={s.immersiveSourceLanguage}
              onChange={(event) =>
                save({ immersiveSourceLanguage: event.target.value })
              }
            >
              <option value="auto">自动检测</option>
              {LANGUAGES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span className="direction" aria-hidden="true">
            <Icon name="arrow" />
          </span>
          <label className="select-field">
            <span>译文语言</span>
            <select
              id="target-language"
              aria-label="译文语言"
              disabled={disabled || running}
              value={s.immersiveTargetLanguage || s.targetLanguage}
              onChange={(event) =>
                save({ immersiveTargetLanguage: event.target.value })
              }
            >
              {LANGUAGES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="service-card">
        <label className="select-field service-field">
          <span>翻译服务</span>
          <select
            id="translation-service"
            aria-label="翻译服务"
            disabled={disabled || running}
            value={
              ai ? (service ? `service:${service.id}` : "ai") : "google-free"
            }
            onChange={(event) =>
              event.target.value.startsWith("service:")
                ? saveService(event.target.value.slice(8))
                : save({ immersiveTranslationService: event.target.value })
            }
          >
            {plan.services.length ? (
              <optgroup label="自定义供应商">
                {plan.services.map((item) => (
                  <option key={item.id} value={`service:${item.id}`}>
                    {item.name || "自定义供应商"}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option value="ai">自定义供应商 · 请先配置</option>
            )}
            <option value="google-free">Google 翻译 · 免 Key</option>
          </select>
        </label>
        <label
          id="model-field"
          className="select-field service-field"
          hidden={!ai}
        >
          <span>模型</span>
          <select
            id="translation-model"
            aria-label="模型"
            value={model}
            disabled={disabled || running || !ai || !model}
            onChange={(event) => saveService(service.id, event.target.value)}
          >
            {service?.models.length ? (
              service.models.map((item) => (
                <option key={item.id} value={item.id}>
                  {modelLabel(item)}
                </option>
              ))
            ) : (
              <option value="">尚未添加模型</option>
            )}
          </select>
          <small id="model-hint" className="model-hint" hidden={!hint}>
            {hint}
          </small>
        </label>
        </div>
        </div>
        <div className="translate-actions">
          <button
            id="display-mode-toggle"
            className="mode-toggle"
            type="button"
            disabled={disabled}
            aria-label={translation ? "切换为双语对照" : "切换为仅译文"}
            title={
              translation
                ? "仅译文 · 点击切换为双语对照"
                : "双语对照 · 点击切换为仅译文"
            }
            onClick={() =>
              save({
                immersiveDisplayMode: translation ? "bilingual" : "translation",
              })
            }
          >
            <span id="mode-icon" aria-hidden="true">
              {translation ? "A" : "文/A"}
            </span>
            <span className="mode-label">{translation ? "仅译文" : "双语"}</span>
          </button>
          <button
            id="translate-page"
            className="primary"
            type="button"
            disabled={disabled || running || !page?.ok}
            onClick={translate}
          >
            {running ? <span className="button-spinner" aria-hidden="true" /> : <Icon name="translate" />}
            <span id="translate-label">
              {running ? "正在翻译…" : "翻译当前网页"}
            </span>
          </button>
        </div>
        <p
          id="status"
          className="status"
          role="status"
          aria-live="polite"
          data-error={!!status.error}
        >
          {status.text}
        </p>
      </section>
      <footer className="popup-footer">
        <button
          id="open-settings"
          className="text-button"
          type="button"
          onClick={openSettings}
        >
          <Icon name="settings" />
          全部设置
        </button>
        <button
          id="theme-toggle"
          className="text-button icon-only"
          type="button"
          disabled={disabled}
          aria-label={`外观：${THEME_LABELS[theme]}，点击切换`}
          title={`外观：${THEME_LABELS[theme]}`}
          data-theme-preference={theme}
          onClick={cycleTheme}
        >
          <Icon name={`theme-${theme}`} />
        </button>
        <button
          id="more-toggle"
          className="text-button"
          type="button"
          aria-expanded={more}
          aria-controls="more-panel"
          onClick={() => setMore(!more)}
        >
          {more ? "收起偏好" : "网站与偏好"}
          <Icon name="chevron" className="chevron" />
        </button>
      </footer>
      <section
        id="more-panel"
        className="more-panel"
        hidden={!more}
        aria-label="更多功能"
      >
        <fieldset id="site-controls" disabled={disabled || !hostname}>
          <legend>当前网站翻译设置</legend>
          <p id="site-name" className="site-name">
            {hostname || "当前页面不支持网页翻译"}
          </p>
          <div className="segmented" role="group" aria-label="当前网站翻译设置">
            {[
              ["inherit", "跟随全局"],
              ["always", "自动翻译"],
              ["never", "不自动翻译"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                data-site-rule={value}
                aria-pressed={rule === value}
                onClick={() => {
                  const rules = { ...s.immersiveSiteRules };
                  if (value === "inherit") delete rules[hostname];
                  else rules[hostname] = value;
                  save({ immersiveSiteRules: rules });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset id="display-controls" disabled={disabled}>
          <legend>译文偏好</legend>
          <div className="segmented" role="group" aria-label="译文偏好">
            {[
              ["bilingual", "文/A", "双语对照"],
              ["translation", "A", "仅译文"],
            ].map(([value, icon, label]) => (
              <button
                type="button"
                key={value}
                data-display-mode={value}
                aria-pressed={s.immersiveDisplayMode === value}
                onClick={() => save({ immersiveDisplayMode: value })}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {/* Same card as the translation screen, so switching screens does not
            switch visual language. */}
        <div className="control-card toggle-card">
        <label className="popup-toggle">
          <span>全局自动翻译</span>
          <input
            id="auto-translate-toggle"
            type="checkbox"
            disabled={disabled}
            checked={s.immersiveAutoTranslate === true}
            onChange={(event) =>
              save({ immersiveAutoTranslate: event.target.checked })
            }
          />
        </label>
        <label className="popup-toggle">
          <span>
            视频实时字幕<small>YouTube / Google Drive</small>
          </span>
          <input
            id="subtitle-enabled-toggle"
            type="checkbox"
            disabled={disabled}
            checked={s.subtitleEnabled !== false}
            onChange={(event) =>
              save({ subtitleEnabled: event.target.checked })
            }
          />
        </label>
        </div>
      </section>
    </main>
  );
}
