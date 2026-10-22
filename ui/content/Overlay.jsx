import {React} from "./runtime.js";

/*
 * Subtitle overlay contents. The overlay wrapper itself stays owned by
 * content-overlay.js because dragging, positioning and caption-blocking mutate
 * its geometry and classes on every animation frame; React owns the changing
 * cue text inside it.
 */
export function Overlay({cn, en, status}) {
    return (
        <>
            <div className="ytbt-lines">
                <div className="ytbt-cn">{cn}</div>
                <div className="ytbt-en">{en}</div>
            </div>
            <div className="ytbt-status">{status}</div>
        </>
    );
}
