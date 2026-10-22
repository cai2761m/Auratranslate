import {React} from "./runtime.js";
import shadowStyles from "./selection.css";

// Selection UI renders inside a shadow root so webpage styles cannot reach it.
// selection.js keeps the selection state machine and the shadow host; this
// component renders the toolbar or the translation card into it.
export function SelectionUI(props) {
    return (
        <>
            <style>{shadowStyles}</style>
            {props.mode === "toolbar"
                ? <SelectionToolbar {...props}/>
                : <SelectionCard {...props}/>}
        </>
    );
}

function SelectionToolbar({toolbar, copied, toolbarError, onAction}) {
    const Core = globalThis.YTBTCore || {};
    const actions = Core.SELECTION_TOOLBAR_ACTIONS || [];
    const moveFocus = (event) => {
        const buttons = [...event.currentTarget.querySelectorAll("button")];
        const root = event.currentTarget.getRootNode();
        const index = buttons.indexOf(root.activeElement);
        if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
            (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
    };
    return (
        <div className="surface selection-toolbar" role="toolbar" aria-label="划词工具栏"
             data-size={toolbar.size} data-labels={String(toolbar.showLabels)}
             onKeyDown={moveFocus}>
            {toolbar.actions.map((id) => {
                const definition = actions.find((action) => action.id === id);
                const actionCopied = id === "copy" && copied;
                return (
                    <button key={id} type="button"
                            className={`selection-tool${id === "translate" ? " selection-trigger" : ""}`}
                            data-action={id}
                            data-copied={actionCopied ? "true" : undefined}
                            aria-label={definition ? definition.title : id}
                            title={actionCopied ? "已复制" : (definition ? definition.title : id)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onAction(id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
                             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={actionCopied ? "m5 12 4 4L19 6" : (definition ? definition.path : "")}/>
                        </svg>
                        {toolbar.showLabels && <span>{definition ? definition.label : id}</span>}
                    </button>
                );
            })}
            {(toolbarError || copied) && (
                <p className={toolbarError ? "toolbar-feedback error" : "sr-only"} role="status">
                    {toolbarError || "已复制所选文字"}
                </p>
            )}
        </div>
    );
}

function SelectionCard({selection, result, translating, saving, saved, error, onAction}) {
    return (
        <section className="surface selection-card" role="dialog" aria-label="划词翻译">
            <header>
                <button type="button" className="close" aria-label="关闭划词翻译"
                        onClick={() => onAction("dismiss")}>×</button>
            </header>
            <p className="source">{selection ? selection.sourceText : ""}</p>
            <p className={`translation${error ? " error" : ""}`} role="status" aria-live="polite">
                {translating ? "正在翻译…" : (error || (result ? result.translatedText : ""))}
            </p>
            <div className="actions">
                {result ? (
                    <button type="button" className="save" disabled={saving || saved}
                            onClick={() => onAction("save")}>
                        {saving ? "正在收藏…" : saved ? "已收藏" : "收藏到生词本"}
                    </button>
                ) : !translating ? (
                    <button type="button" className="retry" onClick={() => onAction("retry")}>重试翻译</button>
                ) : null}
                <button type="button" className="book" onClick={() => onAction("book")}>打开生词本</button>
            </div>
            {saved && <p className="hint">已保存原文、译文、上下文和来源。</p>}
        </section>
    );
}
