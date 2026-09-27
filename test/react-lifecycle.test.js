const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mount,
  settle,
  setValue,
  click,
} = require("../scripts/ui-test-helpers.cjs");

const service = {
  id: "a",
  name: "Provider",
  apiKey: "key",
  baseUrl: "https://provider.test/v1",
  models: [{ id: "old" }],
};

test("autosave serializes immutable snapshots and preserves unrelated popup/cache settings", async (t) => {
  const stored = {
    translationServices: [service],
    translationServiceId: "a",
    immersiveAutoTranslate: true,
    "ytbt:cached": "译文",
  };
  const writes = [];
  let finish;
  const chrome = {
    runtime: {},
    storage: {
      local: {
        get(defaults, done) {
          done({ ...defaults, ...stored });
        },
        set(patch, done) {
          writes.push(JSON.parse(JSON.stringify(patch)));
          finish = () => {
            Object.assign(stored, patch);
            done();
          };
        },
        remove(keys, done) {
          done();
        },
      },
    },
  };
  const page = await mount(t, "options", { chrome });
  setValue(page.field("targetLanguage"), "zh-TW");
  await settle(page.window);
  assert.equal(writes.length, 1);
  setValue(page.$(".detail-model-id"), "new");
  setValue(page.field("targetLanguage"), "zh-CN");
  await settle(page.window);
  assert.equal(writes.length, 1, "second write waits for the first one");
  assert.equal(writes[0].translationServices[0].models[0].id, "old");
  finish();
  await settle(page.window);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].translationServices[0].models[0].id, "new");
  finish();
  await settle(page.window);
  assert.equal(stored.immersiveAutoTranslate, true);
  assert.equal(stored["ytbt:cached"], "译文");
  assert.equal(stored.targetLanguage, "zh-CN");
  assert.match(page.field("status").textContent, /已自动保存/);
});

test("storage failure keeps the editable draft and a later change can save it", async (t) => {
  const runtime = {};
  let fail = true;
  const stored = {};
  const chrome = {
    runtime,
    storage: {
      local: {
        get(defaults, done) {
          done({ ...defaults });
        },
        set(patch, done) {
          if (fail) runtime.lastError = { message: "quota" };
          else Object.assign(stored, patch);
          done();
          delete runtime.lastError;
        },
        remove(keys, done) {
          done();
        },
      },
    },
  };
  const page = await mount(t, "options", { chrome });
  setValue(page.field("targetLanguage"), "zh-TW");
  await settle(page.window);
  assert.match(page.field("status").textContent, /保存失败/);
  assert.equal(page.field("targetLanguage").value, "zh-TW");
  fail = false;
  setValue(page.field("fontScale"), "0.65");
  await page.save();
  assert.equal(stored.targetLanguage, "zh-TW");
  assert.equal(stored.fontScale, 0.65);
});

test("cache clearing only removes translation caches and bumps cacheVersion", async (t) => {
  const storage = {
    "ytbt:a": "translation",
    "modelTestResult:a": { latencyMs: 20 },
    immersiveAutoTranslate: true,
  };
  const page = await mount(t, "options", { storage });
  click(page.field("clear-cache"));
  await settle(page.window);
  assert.equal(storage["ytbt:a"], undefined);
  assert.equal(storage["modelTestResult:a"].latencyMs, 20);
  assert.equal(storage.immersiveAutoTranslate, true);
  assert.ok(storage.cacheVersion);
});

test("changing API credentials invalidates an in-flight catalog request", async (t) => {
  const page = await mount(t, "options", {
    storage: { translationServices: [service] },
  });
  let finish, signal;
  page.window.fetch = (url, options) => {
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  click(page.field("detail-fetch-models"));
  setValue(page.field("detail-api-key"), "new-key");
  assert.equal(signal.aborted, true);
  finish({ ok: true, json: async () => ({ data: [{ id: "stale" }] }) });
  await settle(page.window);
  assert.equal(page.field("model-picker-dialog"), null);
  assert.equal(page.$(".detail-model-id").value, "old");
});

test("unmounting a popup removes status polling and never starts translation", async (t) => {
  const messages = [];
  const page = await mount(t, "popup", {
    chrome: {
      runtime: { getManifest: () => ({ version: "test" }) },
      storage: {
        local: {
          get(defaults, done) {
            done(defaults);
          },
        },
      },
      tabs: {
        query(query, done) {
          done([{ id: 1, url: "https://example.test" }]);
        },
        sendMessage(id, message, options, done) {
          messages.push(message.type);
          done({ ok: true, mode: "idle" });
        },
      },
    },
  });
  let cleared = 0;
  const original = page.window.clearInterval.bind(page.window);
  page.window.clearInterval = (id) => {
    cleared++;
    original(id);
  };
  page.window.__ui.flushSync(() => page.window.__ui.unmount());
  assert.equal(cleared, 1);
  assert.deepEqual(messages, ["IMMERSIVE_POPUP_STATUS"]);
});
