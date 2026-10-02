import {Core, modelLabel} from "../shared/settings";

export function TranslationSettings({
                                        settings,
                                        update,
                                        immersive = false,
                                        hidden,
                                        navigate,
                                    }) {
    const prefix = immersive ? "immersiveTranslation" : "translation";
    const serviceId = `${prefix}ServiceId`,
        modelId = `${prefix}ModelId`;
    const dedicated = Core.findTranslationService(
        settings.translationServices,
        settings[serviceId],
    );
    const service =
        dedicated ||
        (immersive
            ? Core.findTranslationService(
                settings.translationServices,
                settings.translationServiceId,
            )
            : null);
    const models = service?.models.filter((model) => model.id.trim()) || [];
    const model =
        immersive && !dedicated ? settings.translationModelId : settings[modelId];
    const page = immersive ? "immersive-api" : "realtime-api";
    return (
        <section
            id={page}
            className="settings-section"
            role="tabpanel"
            aria-labelledby={`tab-${page}`}
            tabIndex={0}
            hidden={hidden}
        >
            <div className="section-heading">
                <p className="section-kicker">
                    {immersive ? "Webpage" : "YouTube / Google Drive"}
                </p>
                <h2>{immersive ? "沉浸式翻译" : "实时字幕"}</h2>
                <p>
                    {immersive
                        ? "在阅读的位置，呈现自然的双语对照。"
                        : "为 YouTube 和 Google Drive 视频选择字幕翻译服务。"}
                </p>
            </div>
            {immersive ? (
                <p className="section-note">
                    默认沿用实时字幕选中的服务和模型；也可以单独选择另一个翻译服务。
                </p>
            ) : (
                <p
                    className="section-note"
                    id="realtime-service-hint"
                    hidden={!!dedicated}
                >
                    尚未选择默认翻译服务，请先到{" "}
                    <button
                        type="button"
                        className="link-button"
                        data-goto="translation-services"
                        onClick={() => navigate("translation-services")}
                    >
                        翻译服务
                    </button>
                    {" "}
                    页添加并选择服务和模型。
                </p>
            )}
            <label className="field">
                <span>翻译服务</span>
                <select
                    id={serviceId}
                    value={settings[serviceId]}
                    disabled={!settings.translationServices.length}
                    onChange={(event) =>
                        update({[serviceId]: event.target.value, [modelId]: ""})
                    }
                >
                    <option value="">
                        {immersive
                            ? "沿用实时字幕服务"
                            : settings.translationServices.length
                                ? "选择默认服务"
                                : "尚未添加翻译服务"}
                    </option>
                    {settings.translationServices.map((item) => (
                        <option key={item.id} value={item.id}>
                            {item.name || "未命名供应方"}
                        </option>
                    ))}
                </select>
            </label>
            <label className="field">
                <span>模型</span>
                <select
                    id={modelId}
                    value={model}
                    disabled={!models.length || (immersive && !dedicated)}
                    onChange={(event) => update({[modelId]: event.target.value})}
                >
                    {models.length ? (
                        models.map((item) => (
                            <option key={item.id} value={item.id}>
                                {modelLabel(item)}
                            </option>
                        ))
                    ) : (
                        <option value="">暂无模型</option>
                    )}
                </select>
                <small id={`${prefix}ModelHint`}>
                    {!models.length
                        ? "请先在“翻译服务”页为这个供应方添加模型。"
                        : immersive && !dedicated
                            ? `沿用实时字幕模型（${models.length} 个可选）。`
                            : `共 ${models.length} 个模型，来自“翻译服务”页的模型目录。`}
                </small>
            </label>
            <label className="toggle">
                <input
                    id={`${prefix}JsonResponse`}
                    type="checkbox"
                    checked={settings[`${prefix}JsonResponse`] !== false}
                    onChange={(event) =>
                        update({[`${prefix}JsonResponse`]: event.target.checked})
                    }
                />
                <span>JSON 输出模式<small>让模型返回结构化结果，服务不兼容时可关闭。</small></span>
            </label>
        </section>
    );
}
