import {React} from "./runtime.js";

// The logo inside YouTube's control-bar button. The button element itself is
// owned by content-controls.js because YouTube inserts it directly into
// .ytp-right-controls and replaces that container while navigating.
export function PlayerButton({iconUrl}) {
    return <img src={iconUrl} alt="" draggable={false}/>;
}
