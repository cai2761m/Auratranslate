import {React} from "./runtime.js";

// Icon geometry matches the extension's previous inline SVG set so the player
// stylesheet keeps rendering the same marks.
const ICON_PATHS = {
    subtitles: "M3 5h18v14H3zM6 13h5M14 13h4M6 16h3M12 16h6",
    settings: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    summary: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
    close: "m6 6 12 12M18 6 6 18",
    back: "m14 5-7 7 7 7",
    copy: "M8 8h12v13H8zM16 8V3H3v13h5",
    reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
};

function Icon({name}) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={ICON_PATHS[name] || ICON_PATHS.subtitles}/>
        </svg>
    );
}

function MenuRow({icon, action, trailing, children, onAction}) {
    return (
        <button type="button" className="ytbt-menu-row" data-action={action}
                onClick={() => onAction(action)}>
            <Icon name={icon}/><span>{children}</span>
            {trailing && <span aria-hidden="true">{trailing}</span>}
        </button>
    );
}

function StyleFields({settings, onSetting, onAction}) {
    return (
        <div className="ytbt-menu-style" hidden={false}>
            <div className="ytbt-style-heading">
                <button type="button" className="ytbt-icon-button" data-action="back" title="返回"
                        aria-label="返回" onClick={() => onAction("back")}><Icon name="back"/></button>
                <strong>字幕样式</strong>
                <button type="button" className="ytbt-icon-button" data-action="reset-style"
                        title="恢复默认样式" aria-label="恢复默认样式"
                        onClick={() => onAction("reset-style")}><Icon name="reset"/></button>
            </div>
            <label className="ytbt-style-field">显示模式
                <select data-setting="subtitleDisplayMode" aria-label="显示模式"
                        value={settings.subtitleDisplayMode}
                        onChange={(event) => onSetting("subtitleDisplayMode", event.target.value)}>
                    <option value="bilingual">双语字幕</option>
                    <option value="translation">仅译文</option>
                    <option value="original">仅原文</option>
                </select>
            </label>
            <label className="ytbt-style-field">字号
                <output className="ytbt-font-value">{Number(settings.fontScale).toFixed(2)}x</output>
                <input type="range" min="0.3" max="3" step="0.05" data-setting="fontScale"
                       aria-label="字幕字号" value={String(settings.fontScale)}
                       onChange={(event) => onSetting("fontScale", Number(event.target.value))}/>
            </label>
            <label className="ytbt-style-field">背景不透明度
                <output className="ytbt-opacity-value">{Math.round(settings.subtitleBackgroundOpacity * 100)}%</output>
                <input type="range" min="0" max="1" step="0.05" data-setting="subtitleBackgroundOpacity"
                       aria-label="背景不透明度" value={String(settings.subtitleBackgroundOpacity)}
                       onChange={(event) => onSetting("subtitleBackgroundOpacity", Number(event.target.value))}/>
            </label>
            <label className="ytbt-style-field ytbt-color-field">文字颜色
                <input type="color" data-setting="subtitleColor" aria-label="字幕文字颜色"
                       value={settings.subtitleColor}
                       onChange={(event) => onSetting("subtitleColor", event.target.value)}/>
            </label>
            <button type="button" className="ytbt-text-button" data-action="reset-position"
                    onClick={() => onAction("reset-position")}>重置字幕位置</button>
        </div>
    );
}

function TranscriptView({transcript, view, onAction, onSearch, onFollow, onSeek}) {
    return (
        <div className="ytbt-transcript-view" hidden={view !== "transcript"}>
            <div className="ytbt-list-toolbar">
                <input type="search" className="ytbt-transcript-search" placeholder="搜索字幕"
                       aria-label="搜索字幕" value={transcript.query}
                       onChange={(event) => onSearch(event.target.value)}/>
                <label>
                    <input type="checkbox" className="ytbt-follow" checked={transcript.follow}
                           onChange={(event) => onFollow(event.target.checked)}/>跟随播放
                </label>
            </div>
            <div className="ytbt-cue-list" tabIndex={0} aria-label="视频字幕列表"
                 onWheel={() => onFollow(false)} onTouchMove={() => onFollow(false)}>
                {transcript.rows.map((row, index) => (
                    <button key={index} type="button" className="ytbt-cue-row"
                            data-index={index}
                            aria-current={row.current ? "true" : "false"}
                            onClick={() => onSeek(row.cue)}>
                        <time>{row.start}</time>
                        <span>
                            <span className="ytbt-cue-source">{row.original}</span>
                            <span className="ytbt-cue-translation">{row.translation}</span>
                        </span>
                    </button>
                ))}
                {!transcript.rows.length && (
                    <p className="ytbt-list-empty">{transcript.empty}</p>
                )}
            </div>
            <footer className="ytbt-list-footer">
                <span className="ytbt-cue-count">{transcript.count} 条字幕</span>
                <button type="button" className="ytbt-text-button" data-action="load-captions"
                        hidden={transcript.hasCues || transcript.loading}
                        onClick={() => onAction("load-captions")}>重新读取</button>
                <button type="button" className="ytbt-text-button" data-action="more"
                        hidden={!transcript.hasMore}
                        onClick={() => onAction("more")}>加载更多</button>
            </footer>
        </div>
    );
}

function SummaryView({summary, view, onAction}) {
    return (
        <div className="ytbt-summary-view" hidden={view !== "summary"}>
            <div className="ytbt-summary-toolbar">
                <span className="ytbt-summary-model">{summary.model}</span>
                <button type="button" className="ytbt-icon-button" data-action="copy-summary"
                        title="复制总结" aria-label="复制总结" disabled={!summary.text}
                        onClick={() => onAction("copy-summary")}><Icon name="copy"/></button>
            </div>
            <div className="ytbt-summary-text" tabIndex={0}>{summary.text}</div>
            <p className="ytbt-summary-status" role="status">{summary.status}</p>
            <button type="button" className="ytbt-primary-button" data-action="generate-summary"
                    hidden={Boolean(summary.text)} disabled={summary.summarizing}
                    onClick={() => onAction("generate-summary")}>
                <Icon name="summary"/><span>{summary.summarizing ? "处理中..." : "生成总结"}</span>
            </button>
        </div>
    );
}

export function PlayerTools(props) {
    const {
        menuOpen, styleView, panelOpen, view, error, settings,
        transcript, summary, onAction, onSetting, onSearch, onFollow, onSeek,
    } = props;
    return (
        <>
            <section id="ytbt-player-menu" className="ytbt-player-menu" role="dialog"
                     aria-label="AuraTranslate" hidden={!menuOpen}>
                <div className="ytbt-menu-main" hidden={styleView}>
                    <label className="ytbt-menu-row">
                        <Icon name="subtitles"/><span>视频字幕</span>
                        <input type="checkbox" role="switch" data-setting="subtitleEnabled"
                               aria-label="视频字幕" checked={Boolean(settings.subtitleEnabled)}
                               onChange={(event) => onSetting("subtitleEnabled", event.target.checked)}/>
                        <span className="ytbt-switch" aria-hidden="true"/>
                    </label>
                    <MenuRow icon="settings" action="style" trailing="›" onAction={onAction}>字幕样式</MenuRow>
                    <MenuRow icon="list" action="transcript" onAction={onAction}>悬浮字幕列表</MenuRow>
                    <MenuRow icon="summary" action="summary" onAction={onAction}>AI 总结</MenuRow>
                </div>
                {styleView && <StyleFields settings={settings} onSetting={onSetting} onAction={onAction}/>}
                <p className="ytbt-tools-error" role="status" hidden={!error}>{error}</p>
            </section>
            <section className="ytbt-tools-panel" role="dialog" aria-label="AuraTranslate 字幕与总结"
                     hidden={!panelOpen}>
                <div className="ytbt-panel-tabs ytbt-panel-handle">
                    <button type="button" data-action="transcript"
                            aria-pressed={view === "transcript"}
                            onClick={() => onAction("transcript")}>字幕列表</button>
                    <button type="button" data-action="summary"
                            aria-pressed={view === "summary"}
                            onClick={() => onAction("summary")}>AI 总结</button>
                    <button type="button" className="ytbt-icon-button" data-action="close-panel"
                            title="关闭面板" aria-label="关闭面板"
                            onClick={() => onAction("close-panel")}><Icon name="close"/></button>
                </div>
                <TranscriptView transcript={transcript} view={view} onAction={onAction} onSearch={onSearch}
                                onFollow={onFollow} onSeek={onSeek}/>
                <SummaryView summary={summary} view={view} onAction={onAction}/>
            </section>
        </>
    );
}
