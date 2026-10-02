import {useState} from "react";
import {Modal} from "../shared/Modal";

export function ModelPicker({ids, existing, onApply, onClose, returnFocus}) {
    const [selected, setSelected] = useState([]);
    const available = ids.filter((id) => !existing.includes(id));
    return (
        <Modal
            id="model-picker-dialog"
            className="model-picker-modal"
            titleId="model-picker-title"
            open
            onClose={onClose}
            returnFocus={returnFocus}
        >
            <h2 id="model-picker-title">选择要添加的模型</h2>
            <p
                id="model-picker-summary"
                className="model-picker-summary"
                role="status"
            >
                接口返回 {ids.length} 个模型，其中 {ids.length - available.length}{" "}
                个已在目录中。
            </p>
            <p
                id="model-picker-selected-count"
                className="model-picker-selected-count"
                role="status"
                aria-live="polite"
            >
                已选 {selected.length} 个模型
            </p>
            <div className="model-picker-actions">
                <button
                    type="button"
                    id="model-picker-select-all"
                    className="ghost"
                    onClick={() => setSelected(available)}
                >
                    全选新增模型
                </button>
                <button
                    type="button"
                    id="model-picker-clear"
                    className="ghost"
                    onClick={() => setSelected([])}
                >
                    清空选择
                </button>
            </div>
            <ul id="model-picker-list" className="model-picker-list">
                {ids.map((id) => (
                    <li key={id} className="model-picker-item">
                        <label>
                            <input
                                type="checkbox"
                                value={id}
                                disabled={existing.includes(id)}
                                checked={selected.includes(id)}
                                onChange={(event) =>
                                    setSelected(
                                        event.target.checked
                                            ? [...selected, id]
                                            : selected.filter((value) => value !== id),
                                    )
                                }
                            />
                            <span className="model-picker-item-name">{id}</span>
                        </label>
                        {existing.includes(id) && <small>已在目录中</small>}
                    </li>
                ))}
            </ul>
            <div className="modal-actions">
                <button
                    type="button"
                    id="model-picker-cancel"
                    className="secondary"
                    onClick={onClose}
                >
                    取消
                </button>
                <button
                    type="button"
                    id="model-picker-add"
                    disabled={!selected.length}
                    onClick={() => onApply(selected)}
                >
                    添加所选模型
                </button>
            </div>
        </Modal>
    );
}
