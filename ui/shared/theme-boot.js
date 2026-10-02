// Resolves the appearance preference onto <html data-theme> before first paint.
// Loaded as a classic, unbundled script in the <head> of the popup and options
// pages, ahead of their stylesheets.
//
// chrome.storage is asynchronous, so it cannot decide the first frame. The
// preference is therefore mirrored into localStorage (shared by every page of
// the extension origin) and read synchronously here; chrome.storage stays the
// source of truth and reconciles the mirror once the page has loaded.
(function bootTheme() {
    "use strict";
    const KEY = "auratranslate:uiTheme";
    const THEMES = ["system", "light", "dark"];
    const root = document.documentElement;
    const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    let preference = "system";

    function normalize(value) {
        return THEMES.includes(value) ? value : "system";
    }

    function render() {
        const dark = preference === "dark" || (preference === "system" && !!media?.matches);
        root.dataset.theme = dark ? "dark" : "light";
        root.dataset.themePreference = preference;
    }

    function apply(value) {
        preference = normalize(value);
        try {
            localStorage.setItem(KEY, preference);
        } catch {
            /* The mirror only saves a flash; chrome.storage still holds the choice. */
        }
        render();
    }

    try {
        preference = normalize(localStorage.getItem(KEY));
    } catch {
        preference = "system";
    }
    render();
    media?.addEventListener?.("change", render);

    window.AuraTheme = {apply, preference: () => preference};

    // chrome is injected after this script in the preview harness, so reconcile
    // once the page's own scripts have run.
    document.addEventListener("DOMContentLoaded", () => {
        const storage = globalThis.chrome?.storage;
        if (!storage?.local) return;
        storage.local.get({uiTheme: "system"}, (saved) => {
            if (!globalThis.chrome.runtime?.lastError && saved) apply(saved.uiTheme);
        });
        // Keep an open popup and settings page in step with each other.
        storage.onChanged?.addListener((changes, area) => {
            if (area === "local" && changes.uiTheme) apply(changes.uiTheme.newValue);
        });
    });
})();
