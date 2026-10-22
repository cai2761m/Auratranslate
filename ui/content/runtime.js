// Every in-page component renders through the single React instance exported
// by the vendor bundle. Importing React here (rather than from the package)
// keeps content scripts from bundling a second copy.
export const React = globalThis.AuraReact.React;
