import { useEffect, useRef } from "react";
import { ModelRows } from "./ModelRows";
import { ModelPicker } from "./ModelPicker";
import { useModelCatalog } from "./useModelCatalog";

export function ServiceDetail({
  service,
  onChange,
  onEdit,
  onDelete,
  onTest,
  blocked,
  setPicking,
}) {
  const catalog = useModelCatalog(
    service?.id,
    service?.baseUrl || "",
    service?.apiKey || "",
    !blocked,
  );
  const panel = useRef(null);
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [service?.id]);
  useEffect(() => {
    setPicking(!!catalog.ids);
    return () => setPicking(false);
  }, [!!catalog.ids]);
  return (
    <>
      <article
        className="service-detail"
        id="service-detail"
        ref={panel}
        data-service-id={service?.id || ""}
        aria-labelledby="detail-name"
        hidden={!service}
      >
        <div className="service-detail-head">
          <div>
            <p className="section-kicker" id="detail-kind">
              OpenAI Compatible
            </p>
            <h3 id="detail-name">{service?.name || ""}</h3>
          </div>
          <div className="service-actions" id="detail-actions">
            <button
              type="button"
              id="edit-service"
              className="ghost"
              onClick={onEdit}
            >
              编辑
            </button>
            <button
              type="button"
              id="delete-service"
              className="ghost danger"
              onClick={onDelete}
            >
              删除
            </button>
          </div>
        </div>
        <p className="detail-description" id="detail-description">
          管理连接信息和可用模型。
        </p>
        <div id="detail-connection">
          <label className="field">
            <span>API Key</span>
            <input
              id="detail-api-key"
              type="password"
              autoComplete="off"
              placeholder="输入 API Key"
              value={service?.apiKey || ""}
              onChange={(event) => onChange({ apiKey: event.target.value })}
            />
          </label>
          <label className="field">
            <span>API 地址</span>
            <input
              id="detail-base-url"
              type="url"
              autoComplete="off"
              placeholder="https://api.example.com/v1"
              value={service?.baseUrl || ""}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
            />
          </label>
          <label className="field protocol-field">
            <span>API 协议</span>
            <input
              id="detail-protocol"
              type="text"
              readOnly
              value={service?.apiProtocol || ""}
            />
          </label>
        </div>
        <div id="detail-model-catalog" hidden={!service}>
          <div className="model-catalog-heading">
            <h4>
              模型列表{" "}
              <span id="detail-model-count">
                ({service?.models.length || 0})
              </span>
            </h4>
            <div className="inline-actions">
              <button
                type="button"
                id="detail-test-models"
                className="ghost"
                onClick={onTest}
              >
                测试模型
              </button>
              <button
                type="button"
                id="detail-add-model"
                className="ghost"
                onClick={() =>
                  onChange({
                    models: [...service.models, { id: "", displayName: "" }],
                  })
                }
              >
                添加模型
              </button>
              <button
                type="button"
                id="detail-fetch-models"
                className="ghost"
                disabled={catalog.busy}
                onClick={catalog.fetchModels}
              >
                获取模型列表
              </button>
            </div>
          </div>
          <ul className="detail-models" id="detail-models">
            <ModelRows
              detail
              models={service?.models || []}
              onChange={(models) => onChange({ models })}
            />
            {!service?.models.length && (
              <li className="model-empty">
                暂无模型，可添加模型或获取模型列表。
              </li>
            )}
          </ul>
          <p className="model-status" id="detail-model-status" role="status">
            {catalog.status}
          </p>
        </div>
      </article>
      {catalog.ids && (
        <ModelPicker
          ids={catalog.ids}
          returnFocus="#detail-fetch-models"
          existing={service.models.map((model) => model.id.trim())}
          onClose={() => catalog.setIds(null)}
          onApply={(ids) => {
            onChange({
              models: [
                ...service.models,
                ...ids.map((id) => ({ id, displayName: "" })),
              ],
            });
            catalog.setIds(null);
            catalog.setStatus(`已添加 ${ids.length} 个模型。`);
          }}
        />
      )}
    </>
  );
}
