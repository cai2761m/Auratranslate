export function ModelRows({ models, onChange, detail = false }) {
  const Tag = detail ? "li" : "div";
  const prefix = detail ? "detail-" : "";
  function edit(index, key, value) {
    onChange(
      models.map((model, i) =>
        i === index ? { ...model, [key]: value } : model,
      ),
    );
  }
  return models.map((model, index) => (
    <Tag className={`${prefix}model-row`} key={index}>
      <input
        type="text"
        className={`${prefix}model-id`}
        value={model.id}
        aria-label="模型 id"
        placeholder="模型 id，例如 gpt-6-astra"
        onChange={(event) => edit(index, "id", event.target.value)}
      />
      <input
        type="text"
        className={`${prefix}model-display-name`}
        value={model.displayName || ""}
        aria-label="模型显示名称"
        placeholder="显示名称（可选）"
        onChange={(event) => edit(index, "displayName", event.target.value)}
      />
      <button
        type="button"
        className="icon-button"
        data-action={`remove-${prefix}model`}
        aria-label={`删除模型 ${model.id}`}
        onClick={() => onChange(models.filter((_, i) => i !== index))}
      >
        ×
      </button>
    </Tag>
  ));
}
