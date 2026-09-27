import { Core } from "../shared/settings";

export function GeneralSettings({ settings, update, clearCache, hidden }) {
  return (
    <section
      id="general-settings"
      className="settings-section"
      role="tabpanel"
      aria-labelledby="tab-general-settings"
      tabIndex="0"
      hidden={hidden}
    >
      <div className="section-heading">
        <p className="section-kicker">General</p>
        <h2>通用设置</h2>
        <p>按照你的阅读习惯，调整翻译与字幕显示。</p>
      </div>
      <h3 className="preference-heading">翻译与处理</h3>
      <div className="grid">
        <label className="field">
          <span>字幕翻译范围</span>
          <select
            id="subtitleTranslationMode"
            value={settings["subtitleTranslationMode"]}
            onChange={(event) =>
              update({ ["subtitleTranslationMode"]: event.target.value }, true)
            }
          >
            <option value="economy">省 token 模式（默认）</option>
            <option value="full">翻译整部视频</option>
          </select>
          <small>
            省 token
            模式只处理播放位置附近的字幕；整片模式优先处理附近，再继续翻译其余部分。切换模式复用已有缓存。
          </small>
        </label>
        <label className="field">
          <span>省 token 模式预翻译时长</span>
          <select
            id="subtitleLookAheadMinutes"
            value={settings["subtitleLookAheadMinutes"]}
            onChange={(event) =>
              update({ ["subtitleLookAheadMinutes"]: event.target.value }, true)
            }
          >
            <option value="1">未来 1 分钟</option>
            <option value="2">未来 2 分钟（默认）</option>
            <option value="3">未来 3 分钟</option>
          </select>
          <small>
            随播放向前补充；跳转后调整待处理任务。已发出的请求仍会完成并缓存。
          </small>
        </label>
      </div>

      <label className="toggle">
        <input
          id="llmSentenceSegmentationEnabled"
          type="checkbox"
          checked={settings["llmSentenceSegmentationEnabled"] !== false}
          onChange={(event) =>
            update({ ["llmSentenceSegmentationEnabled"]: event.target.checked })
          }
        />
        <span>智能断句<small>先合并跨字幕的完整句子，再进行翻译。</small></span>
      </label>

      <label className="toggle">
        <input
          id="asrCorrectionEnabled"
          type="checkbox"
          checked={settings["asrCorrectionEnabled"] !== false}
          onChange={(event) =>
            update({ ["asrCorrectionEnabled"]: event.target.checked })
          }
        />
        <span>语音识别纠错<small>使用 AI 修正字幕中明显的识别错误。</small></span>
      </label>

      <label className="toggle">
        <input
          id="showOriginalTechnicalTerms"
          type="checkbox"
          checked={settings["showOriginalTechnicalTerms"] !== false}
          onChange={(event) =>
            update({ ["showOriginalTechnicalTerms"]: event.target.checked })
          }
        />
        <span>
          保留专业术语原文<small>在译文中对照显示，例如“翻译 (Translation)”。</small>
        </span>
      </label>

      <h3 className="preference-heading">语言与显示</h3>
      <div className="grid">
        <label className="field">
          <span>源语言</span>
          <select
            id="sourceLanguage"
            value={settings["sourceLanguage"]}
            onChange={(event) =>
              update({ ["sourceLanguage"]: event.target.value }, true)
            }
          >
            <option value="en">English</option>
          </select>
        </label>

        <label className="field">
          <span>目标语言</span>
          <select
            id="targetLanguage"
            value={settings["targetLanguage"]}
            onChange={(event) =>
              update({ ["targetLanguage"]: event.target.value }, true)
            }
          >
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁体中文</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span>
          字幕大小{" "}
          <strong id="fontScaleValue">
            {Core.normalizeFontScale(settings.fontScale).toFixed(2)}x
          </strong>
        </span>
        <input
          id="fontScale"
          type="range"
          min="0.3"
          max="3"
          step="0.05"
          aria-describedby="fontScaleHint"
          value={settings["fontScale"]}
          onChange={(event) =>
            update({ ["fontScale"]: event.target.value }, false)
          }
        />
        <small id="fontScaleHint">
          范围 0.30～3.00 倍，每次调整 0.05 倍。手机字幕偏大时可先试 0.50～0.65
          倍，调整会自动保存。
        </small>
      </label>

      <label className="toggle">
        <input
          id="subtitleEnabled"
          type="checkbox"
          checked={settings["subtitleEnabled"] !== false}
          onChange={(event) =>
            update({ ["subtitleEnabled"]: event.target.checked })
          }
        />
        <span>显示双语字幕<small>使用插件字幕替换 YouTube / Google Drive 原生字幕。</small></span>
      </label>

      <div className="cache-settings">
        <div>
          <h3>翻译缓存</h3>
          <p>清除已保存的字幕和网页译文。之后再次查看时会重新翻译。</p>
        </div>
        <button
          id="clear-cache"
          type="button"
          className="secondary"
          onClick={clearCache}
        >
          清空翻译缓存
        </button>
      </div>
    </section>
  );
}
