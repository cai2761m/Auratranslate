// This file is served only by npm run preview; never loaded by the extension.
(() => {
  const initial = {
    translationServices: [
      {
        id: "demo",
        name: "演示供应方",
        apiProtocol: "openai-compatible",
        baseUrl: "https://demo.invalid/v1",
        apiKey: "",
        models: [
          { id: "demo-fast", displayName: "快速模型" },
          { id: "demo-quality", displayName: "高质量模型" },
        ],
      },
    ],
    translationServiceId: "demo",
    translationModelId: "demo-fast",
  };
  let values =
    JSON.parse(localStorage.getItem("auratranslate-ui-preview") || "null") ||
    initial;
  let translated = false;
  const persist = () =>
    localStorage.setItem("auratranslate-ui-preview", JSON.stringify(values));
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "React 预览" }),
      openOptionsPage: (done) => {
        location.href = "/options/options.html";
        done?.();
      },
    },
    storage: {
      local: {
        get(defaults, done) {
          done({ ...defaults, ...values });
        },
        set(patch, done) {
          values = { ...values, ...patch };
          persist();
          done?.();
        },
        remove(keys, done) {
          [].concat(keys).forEach((key) => delete values[key]);
          persist();
          done?.();
        },
      },
    },
    tabs: {
      query(query, done) {
        done([{ id: 1, url: "https://docs.example.org/guide" }]);
      },
      sendMessage(id, message, options, done) {
        if (message.type === "IMMERSIVE_POPUP_TRANSLATE") translated = true;
        done({ ok: true, mode: "idle", translated });
      },
    },
  };
  window.fetch = async (url, options) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 300);
      options?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
    return {
      ok: true,
      json: async () =>
        String(url).endsWith("/models")
          ? {
              data: [
                { id: "demo-fast" },
                { id: "demo-quality" },
                { id: "demo-new" },
              ],
            }
          : { choices: [{ message: { content: "OK" } }] },
    };
  };
})();
