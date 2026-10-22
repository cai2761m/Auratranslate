import {React} from "./runtime.js";

// React roots are rendered synchronously: content-script controllers read the
// DOM they just produced (positions, focus, scroll) in the same task.
export function mountView(container, Component) {
    const {createRoot, flushSync} = globalThis.AuraReact;
    const root = createRoot(container);
    const view = {
        update(props) {
            flushSync(() => root.render(React.createElement(Component, props)));
        },
        unmount() {
            try {
                root.unmount();
            } catch (error) {
                // The host element may already be gone; nothing else to release.
            }
        },
    };
    return view;
}
