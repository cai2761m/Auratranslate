import { useEffect, useRef, useState } from "react";
import { Core } from "../shared/settings";

export function useModelCatalog(identity, baseUrl, apiKey, enabled = true) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [ids, setIds] = useState(null);
  const active = useRef(null);
  useEffect(() => {
    setIds(null);
    setBusy(false);
    setStatus("");
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [identity, baseUrl, apiKey, enabled]);
  async function fetchModels() {
    if (active.current || !enabled) return;
    if (!baseUrl.trim()) {
      setStatus("请先填写 API 地址。");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true);
    setStatus("正在获取可用模型…");
    try {
      const response = await fetch(Core.buildModelsUrl(baseUrl), {
        headers: apiKey.trim()
          ? { Authorization: `Bearer ${apiKey.trim()}` }
          : {},
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (active.current !== controller) return;
      const models = payload?.data || payload?.models || [];
      const next = [
        ...new Set(
          (Array.isArray(models) ? models : [])
            .map((model) =>
              String(model?.id || model?.name || "")
                .trim()
                .replace(/^models\//, ""),
            )
            .filter(Boolean),
        ),
      ];
      setIds(next.length ? next : null);
      setStatus(
        next.length
          ? `接口返回 ${next.length} 个模型，请在弹窗中勾选要添加的模型。`
          : "接口没有返回可用模型，请手工填写模型 id。",
      );
    } catch (error) {
      if (active.current === controller)
        setStatus(
          `获取失败（${controller.signal.aborted ? "请求超时" : error.message}），已保留现有模型。`,
        );
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, status, ids, setIds, setStatus, fetchModels };
}
