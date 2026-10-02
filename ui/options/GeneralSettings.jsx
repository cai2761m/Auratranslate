import {Core, THEME_LABELS, applyTheme} from "../shared/settings";
import {Icon} from "../shared/Icon";

export function GeneralSettings({settings, update, clearCache, hidden}) {
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
                <p>调整扩展外观与翻译缓存。</p>
            </div>
            <fieldset className="theme-choice" id="ui-theme">
                <legend className="preference-heading">外观</legend>
                <div className="theme-options">
                    {Core.UI_THEMES.map((theme) => (
                        <label key={theme} className="theme-option">
                            <input
                                type="radio"
                                name="uiTheme"
                                value={theme}
                                checked={Core.normalizeUiTheme(settings.uiTheme) === theme}
                                onChange={() => {
                                    applyTheme(theme);
                                    update({uiTheme: theme});
                                }}
                            />
                            <Icon name={`theme-${theme}`}/>
                            <span>{THEME_LABELS[theme]}</span>
                        </label>
                    ))}
                </div>
                <small>设置页与弹出窗口使用同一外观。网页上的悬浮按钮会自动匹配所在页面的明暗。</small>
            </fieldset>

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
