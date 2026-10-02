import {useState} from "react";
import {Core} from "../shared/settings";
import {Modal} from "../shared/Modal";
import {ModelRows} from "./ModelRows";
import {ModelPicker} from "./ModelPicker";
import {useModelCatalog} from "./useModelCatalog";

export function ServiceDialog({service, onSave, onClose}) {
    const [draft, setDraft] = useState(() => ({
        name: "",
        baseUrl: "",
        apiKey: "",
        apiProtocol: "openai-compatible",
        ...service,
        models: service?.models.length
            ? service.models.map((model) => ({...model}))
            : [{id: "", displayName: ""}],
    }));
    const catalog = useModelCatalog(
        service?.id || "new",
        draft.baseUrl,
        draft.apiKey,
    );
    const edit = (key, value) => setDraft((old) => ({...old, [key]: value}));
    const field = (key) => ({
        value: draft[key],
        onChange: (event) => edit(key, event.target.value),
    });

    function save() {
        if (!draft.name.trim()) {
            catalog.setStatus("请填写供应方名称。");
            return;
        }
        onSave({
            ...draft,
            name: draft.name.trim(),
            baseUrl: draft.baseUrl.trim(),
            apiKey: draft.apiKey.trim(),
            models: Core.normalizeTranslationServices([{...draft, id: "draft"}])[0]
                .models,
        });
    }

    return (
        <>
            <Modal
                id="service-dialog"
                titleId="service-dialog-title"
                open
                onClose={onClose}
                inert={!!catalog.ids}
                initialFocus="#service-name"
                returnFocus={service ? "#edit-service" : "#add-service"}
            >
                <h2 id="service-dialog-title">
                    {service ? "编辑" : "添加"}自定义供应方
                </h2>
                <label className="field">
                    <span>供应方名称</span>
                    <input
                        id="service-name"
                        type="text"
                        autoComplete="off"
                        placeholder="例如：我的中转服务"
                        {...field("name")}
                    />
                </label>
                <label className="field">
                    <span>API 地址</span>
                    <input
                        id="service-base-url"
                        type="url"
                        autoComplete="off"
                        placeholder="https://api.example.com/v1"
                        {...field("baseUrl")}
                    />
                </label>
                <label className="field">
                    <span>API 协议</span>
                    <select id="service-protocol" {...field("apiProtocol")}>
                        {Object.keys(Core.TRANSLATION_SERVICE_PROTOCOLS).map((protocol) => (
                            <option key={protocol}>{protocol}</option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    <span>密钥</span>
                    <input
                        id="service-api-key"
                        type="password"
                        autoComplete="off"
                        placeholder="sk-..."
                        {...field("apiKey")}
                    />
                </label>
                <div className="field">
                    <div className="model-catalog-heading">
                        <span>模型目录</span>
                        <button
                            type="button"
                            id="fetch-models"
                            className="secondary"
                            disabled={catalog.busy}
                            onClick={catalog.fetchModels}
                        >
                            获取可用模型
                        </button>
                    </div>
                    <div className="model-rows" id="service-models">
                        <ModelRows
                            models={draft.models}
                            onChange={(models) => edit("models", models)}
                        />
                    </div>
                    <div className="inline-actions">
                        <button
                            type="button"
                            id="add-model-row"
                            className="secondary"
                            onClick={() =>
                                edit("models", [...draft.models, {id: "", displayName: ""}])
                            }
                        >
                            添加
                        </button>
                    </div>
                    <small id="service-models-status" role="status">
                        {catalog.status}
                    </small>
                </div>
                <div className="modal-actions">
                    <button
                        type="button"
                        id="cancel-service"
                        className="secondary"
                        onClick={onClose}
                    >
                        取消
                    </button>
                    <button type="button" id="save-service" onClick={save}>
                        保存
                    </button>
                </div>
                <p className="dialog-save-hint">保存供应方后会立即应用更改。</p>
            </Modal>
            {catalog.ids && (
                <ModelPicker
                    ids={catalog.ids}
                    returnFocus="#fetch-models"
                    existing={draft.models.map((model) => model.id.trim())}
                    onClose={() => catalog.setIds(null)}
                    onApply={(ids) => {
                        edit("models", [
                            ...draft.models.filter((model) => model.id.trim()),
                            ...ids.map((id) => ({id, displayName: ""})),
                        ]);
                        catalog.setIds(null);
                        catalog.setStatus(`已添加 ${ids.length} 个模型。`);
                    }}
                />
            )}
        </>
    );
}
