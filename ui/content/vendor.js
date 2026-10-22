/*
 * Shared React runtime for every in-page UI surface.
 *
 * Content scripts are classic scripts sharing one isolated-world scope, so this
 * file publishes the runtime on the global object. Several manifest entries can
 * include it: the guard keeps the second evaluation from initialising React
 * again, and esbuild's lazy CommonJS wrappers mean the guarded `require` calls
 * are skipped entirely on repeat injection.
 */
"use strict";

if (!globalThis.AuraReact) {
    const React = require("react");
    const {createRoot} = require("react-dom/client");
    const {flushSync} = require("react-dom");
    globalThis.AuraReact = Object.freeze({React, createRoot, flushSync});
}
