/*
 * In-page React UI entry point.
 *
 * Loaded after ui/content/vendor.js and after the shared API scripts. The guard
 * makes the file idempotent: several manifest entries include it (YouTube
 * pages, the embed player, immersive translation, the selection toolbar), and
 * the extension's isolated world evaluates every matching entry.
 */
"use strict";

if (!globalThis.AuraContentUI) {
    if (!globalThis.AuraReact) {
        console.error("AuraTranslate: load src/ui/react-vendor.js before src/ui/content-ui.js.");
    } else {
        const {mountView} = require("./mount.js");
        const {Overlay} = require("./Overlay.jsx");
        const {PlayerButton} = require("./PlayerButton.jsx");
        const {PlayerTools} = require("./PlayerTools.jsx");
        const {SelectionUI} = require("./SelectionUI.jsx");
        const {ImmersiveBallUI, ImmersiveMenuUI, ImmersivePanelUI} = require("./ImmersiveUI.jsx");

        function mountWith(Component, container, props) {
            const view = mountView(container, Component);
            view.update(props);
            return view;
        }

        function mountOverlay(container, props) {
            return mountWith(Overlay, container, props);
        }

        function mountPlayerTools(container, props) {
            return mountWith(PlayerTools, container, props);
        }

        function mountPlayerButton(container, props) {
            return mountWith(PlayerButton, container, props);
        }

        function mountSelection(container, props) {
            return mountWith(SelectionUI, container, props);
        }

        function mountImmersiveBall(container, props) {
            return mountWith(ImmersiveBallUI, container, props);
        }

        function mountImmersiveMenu(container, props) {
            return mountWith(ImmersiveMenuUI, container, props);
        }

        function mountImmersivePanel(container, props) {
            return mountWith(ImmersivePanelUI, container, props);
        }

        globalThis.AuraContentUI = Object.freeze({
            mountOverlay, mountPlayerButton, mountPlayerTools, mountSelection,
            mountImmersiveBall, mountImmersiveMenu, mountImmersivePanel
        });
    }
}
