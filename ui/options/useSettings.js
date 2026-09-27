import { useEffect, useRef, useState } from "react";
import {
  Core,
  hydrateSettings,
  normalizeSelection,
  settingsPatch,
  storageGet,
  storageSet,
  storageRemove,
} from "../shared/settings";

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("正在读取设置…");
  const current = useRef(null);
  const pending = useRef(null);
  const timer = useRef(null);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const mounted = useRef(true);
  function flush() {
    clearTimeout(timer.current);
    if (!pending.current) return queue.current;
    const values = pending.current;
    const version = revision.current;
    pending.current = null;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        await storageSet(values);
        await storageRemove([
          "deepseekApiKey",
          "immersiveFallbackProvider",
          "immersiveGoogleApiKey",
        ]);
        if (mounted.current && version === revision.current)
          setStatus("设置已自动保存。");
      })
      .catch(() => {
        if (mounted.current && version === revision.current)
          setStatus("保存失败，请检查扩展存储空间后重试。");
      });
    return queue.current;
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    storageGet(Core.DEFAULT_SETTINGS)
      .then(async (saved) => {
        await storageRemove([
          "immersiveFallbackProvider",
          "immersiveGoogleApiKey",
        ]);
        if (cancelled) return;
        current.current = hydrateSettings(saved);
        setSettings(current.current);
        setStatus("");
      })
      .catch((error) => {
        if (!cancelled) setStatus(`无法读取设置：${error.message}`);
      });
    const hide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelled = true;
      mounted.current = false;
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  function update(patch, immediate = true) {
    const next = normalizeSelection({
      ...current.current,
      ...(typeof patch === "function" ? patch(current.current) : patch),
    });
    current.current = next;
    setSettings(next);
    revision.current++;
    // Snapshot now so subsequent edits cannot mutate a queued storage write.
    pending.current = JSON.parse(JSON.stringify(settingsPatch(next)));
    setStatus("正在保存修改…");
    clearTimeout(timer.current);
    if (immediate) flush();
    else timer.current = setTimeout(flush, 250);
  }
  async function clearCache() {
    try {
      const all = await storageGet(null);
      const keys = Object.keys(all).filter((key) => key.startsWith("ytbt:"));
      if (keys.length) await storageRemove(keys);
      await storageSet({ cacheVersion: String(Date.now()) });
      setStatus(`已清空 ${keys.length} 组翻译缓存。`);
    } catch (error) {
      setStatus(`清空失败：${error.message}`);
    }
  }
  return { settings, update, status, clearCache, flush };
}
