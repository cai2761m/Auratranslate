import {useEffect, useRef, useState} from "react";
import {Modal} from "../shared/Modal";
import {Core, storageGet, storageSet} from "../shared/settings";

const keyFor = (service, model) =>
    "modelTestResult:" + JSON.stringify([service.id, service.baseUrl, model.id]);

export function ModelTestDialog({service: source, onClose}) {
    const [service] = useState(() => ({
        ...source,
        baseUrl: source.baseUrl.trim().replace(/\/+$/, ""),
        models: source.models.filter(
            (model, i, all) =>
                model.id.trim() && all.findIndex((item) => item.id === model.id) === i,
        ),
    }));
    const [records, setRecords] = useState({});
    const [phases, setPhases] = useState({});
    const [ready, setReady] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const active = useRef(true);
    const busy = useRef(false);
    const controllers = useRef(new Set());
    useEffect(() => {
        active.current = true;
        const defaults = Object.fromEntries(
            service.models.map((model) => [keyFor(service, model), null]),
        );
        storageGet(defaults)
            .then((saved) => {
                if (!active.current) return;
                const valid = Object.fromEntries(
                    service.models
                        .map((model) => [model.id, saved[keyFor(service, model)]])
                        .filter(
                            ([, record]) =>
                                record &&
                                ["success", "error"].includes(record.state) &&
                                Number.isFinite(record.latencyMs) &&
                                record.latencyMs >= 0,
                        ),
                );
                setRecords(valid);
                setReady(true);
            })
            .catch((error) => {
                if (active.current) {
                    setError(`读取测试记录失败：${error.message}`);
                    setReady(true);
                }
            });
        return () => {
            active.current = false;
            controllers.current.forEach((controller) => controller.abort());
        };
    }, [service]);

    function close() {
        active.current = false;
        controllers.current.forEach((controller) => controller.abort());
        onClose();
    }

    async function run() {
        if (busy.current || !ready || !service.baseUrl || !service.models.length)
            return;
        busy.current = true;
        setRunning(true);
        setError("");
        setPhases(
            Object.fromEntries(service.models.map((model) => [model.id, "等待测试"])),
        );
        let next = 0;

        async function worker() {
            while (active.current && next < service.models.length) {
                const model = service.models[next++];
                setPhases((old) => ({...old, [model.id]: "测试中…"}));
                const controller = new AbortController();
                controllers.current.add(controller);
                const timer = setTimeout(() => controller.abort(), 20000);
                const started = performance.now();
                let record;
                try {
                    const response = await fetch(
                        Core.buildChatCompletionsUrl(service.baseUrl),
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                ...(service.apiKey.trim()
                                    ? {Authorization: `Bearer ${service.apiKey.trim()}`}
                                    : {}),
                            },
                            body: JSON.stringify({
                                model: model.id,
                                messages: [{role: "user", content: "Reply with OK."}],
                            }),
                            signal: controller.signal,
                        },
                    );
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    let payload;
                    try {
                        payload = await response.json();
                    } catch (error) {
                        if (controller.signal.aborted) throw error;
                        throw new Error("返回非 JSON 数据");
                    }
                    if (payload?.error) throw new Error("接口返回错误");
                    const content = payload?.choices?.[0]?.message?.content;
                    if (
                        !(typeof content === "string" && content.trim()) &&
                        !(
                            Array.isArray(content) &&
                            content.some(
                                (part) => typeof part?.text === "string" && part.text.trim(),
                            )
                        )
                    )
                        throw new Error("未返回有效回复");
                    record = {state: "success", message: ""};
                } catch (error) {
                    record = {
                        state: "error",
                        message: controller.signal.aborted
                            ? "请求超时"
                            : error instanceof TypeError
                                ? "网络请求失败"
                                : String(error.message || "请求失败").slice(0, 50),
                    };
                } finally {
                    clearTimeout(timer);
                    controllers.current.delete(controller);
                }
                if (!active.current) return;
                record = {
                    ...record,
                    latencyMs: Math.max(1, Math.round(performance.now() - started)),
                    testedAt: Date.now(),
                };
                setRecords((old) => ({...old, [model.id]: record}));
                setPhases((old) => ({...old, [model.id]: ""}));
                try {
                    await storageSet({[keyFor(service, model)]: record});
                } catch (error) {
                    if (active.current)
                        setError(`测试已完成，但保存记录失败：${error.message}`);
                }
            }
        }

        await Promise.all(
            Array.from({length: Math.min(3, service.models.length)}, worker),
        );
        if (active.current) {
            busy.current = false;
            setRunning(false);
        }
    }

    return (
        <Modal
            id="model-test-dialog"
            titleId="model-test-title"
            open
            onClose={close}
            initialFocus="#close-model-test"
            returnFocus="#detail-test-models"
        >
            <div className="model-test-heading">
                <h2 id="model-test-title">测试模型</h2>
                <button
                    type="button"
                    id="start-model-test"
                    disabled={
                        !ready || running || !service.models.length || !service.baseUrl
                    }
                    title={service.baseUrl ? "测试全部模型" : "请先填写 API 地址"}
                    onClick={run}
                >
                    {running ? "测试中…" : "测试"}
                </button>
            </div>
            <ul
                id="model-test-results"
                className="model-test-results"
                aria-busy={running}
            >
                {service.models.map((model) => {
                    const record = records[model.id];
                    const latency = !record
                        ? "unknown"
                        : record.state === "error" || record.latencyMs > 10000
                            ? "slow"
                            : record.latencyMs > 3000
                                ? "medium"
                                : "fast";
                    return (
                        <li
                            className="model-test-result"
                            key={model.id}
                            data-state={record?.state || "untested"}
                            data-latency={latency}
                        >
              <span className="model-test-result-name">
                {model.displayName
                    ? `${model.displayName}（${model.id}）`
                    : model.id}
              </span>
                            <span className="model-test-result-phase">
                {phases[model.id] || ""}
              </span>
                            <span
                                className="model-test-result-status"
                                title={
                                    record
                                        ? `上次测试：${new Date(record.testedAt).toLocaleString()}；完整响应耗时 ${record.latencyMs} ms`
                                        : "尚无测试记录"
                                }
                            >
                {record
                    ? `${record.state === "error" ? record.message + " · " : ""}${record.latencyMs} ms`
                    : "未测试"}
              </span>
                        </li>
                    );
                })}
                {!service.models.length && (
                    <li className="model-empty">当前供应方没有可测试的模型。</li>
                )}
            </ul>
            <p role="status">{error}</p>
            <div className="modal-actions">
                <button
                    type="button"
                    id="close-model-test"
                    className="secondary"
                    onClick={close}
                >
                    关闭
                </button>
            </div>
        </Modal>
    );
}
