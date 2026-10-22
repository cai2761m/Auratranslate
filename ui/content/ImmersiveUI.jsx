import {React} from "./runtime.js";

// The floating control, its dismissal menu and the hover status panel keep
// their host elements in immersive-controls.js (positions, hidden state and
// theme datasets are geometry-driven); React owns the button markup.
export function ImmersiveBallUI({label, busy, dismissOpen}) {
    return (
        <>
            <button type="button" className="ytbt-immersive-ball" aria-label={label}
                    aria-busy={String(Boolean(busy))}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"
                     fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                     strokeLinejoin="round" aria-hidden="true">
                    <path d="M6.5 22 13 6.8a1.1 1.1 0 0 1 2 0L21.5 22"/>
                    <path className="ytbt-aurora-trail" d="M5 21c4-5.5 7-4.3 11-2.6 2.9 1.2 5.4.5 7-1.2"/>
                    <path className="ytbt-aurora-ribbon" d="M4.5 18.5c4-5.6 7.4-4.2 11.1-2.3 3.1 1.6 5.8 1.2 8-1.8"/>
                </svg>
            </button>
            <button type="button" className="ytbt-immersive-dismiss" title="关闭悬浮小球"
                    aria-label="关闭悬浮小球" aria-haspopup="dialog"
                    aria-expanded={String(Boolean(dismissOpen))}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18"/>
                </svg>
            </button>
        </>
    );
}

export function ImmersiveMenuUI({error}) {
    return (
        <>
            <button type="button" data-dismiss="session">本次关闭（刷新后恢复）</button>
            <button type="button" data-dismiss="site">禁用本网站</button>
            <p role="status" hidden={!error}>{error || ""}</p>
        </>
    );
}

export function ImmersivePanelUI({text}) {
    return <>{text}</>;
}
