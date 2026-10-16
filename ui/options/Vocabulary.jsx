import {useEffect, useMemo, useRef, useState} from "react";
import {Core} from "../shared/settings";
import {Icon} from "../shared/Icon";

const PAGE_SIZE = 30;
const LANGUAGES = {auto: "自动检测", "zh-CN": "简体中文", "zh-TW": "繁体中文", zh: "中文", en: "英语",
    ja: "日语", ko: "韩语", fr: "法语", de: "德语", es: "西班牙语", pt: "葡萄牙语", ru: "俄语", it: "意大利语"};
const languageLabel = code => LANGUAGES[code] || LANGUAGES[code.split("-")[0]] || code;
const request = async (message) => {
    const result = await Core.sendRuntimeMessage(chrome.runtime, {type: "VOCABULARY", ...message}, 30000);
    if (!result?.ok) throw new Error(result?.error || "生词本未返回结果，请重试。");
    return result;
};

function download(contents, type, suffix) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `AuraTranslate-生词本-${new Date().toISOString().slice(0, 10)}.${suffix}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
    let text = String(value ?? "");
    if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

export function Vocabulary({hidden, navigate}) {
    const [entries, setEntries] = useState(null);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [page, setPage] = useState(0);
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    const [drafts, setDrafts] = useState({});
    const [deleted, setDeleted] = useState(null);
    const fileInput = useRef(null);
    const locked = useRef(false);
    const active = useRef(false);
    const loadRevision = useRef(0);

    async function load() {
        const revision = ++loadRevision.current;
        const result = await request({action: "list"});
        if (active.current && revision === loadRevision.current) setEntries(result.entries);
        return result.entries;
    }

    useEffect(() => {
        active.current = !hidden;
        if (hidden) return;
        const refresh = () => load().catch((error) => {
            if (active.current) setNotice({text: `无法读取生词本：${error.message}`, error: true});
        });
        refresh();
        const changed = (changes, area) => {
            if (area === "local" && changes[Core.VOCABULARY_STORAGE_KEY]) refresh();
        };
        chrome.storage.onChanged?.addListener(changed);
        return () => {
            active.current = false;
            loadRevision.current++;
            chrome.storage.onChanged?.removeListener?.(changed);
        };
    }, [hidden]);

    async function operate(task) {
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        try { await task(); }
        catch (error) { if (active.current) setNotice({text: `操作失败：${error.message}`, error: true}); }
        finally { locked.current = false; setBusy(false); }
    }

    const filtered = useMemo(() => {
        const text = query.trim().toLocaleLowerCase();
        return (entries || []).filter((entry) =>
            (filter === "all" || (filter === "learned" ? entry.learned : !entry.learned)) &&
            (!text || [entry.sourceText, entry.translatedText, entry.contextText, entry.sourceTitle, entry.notes]
                .some((value) => value.toLocaleLowerCase().includes(text))))
            .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    }, [entries, query, filter]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const learned = entries?.filter((entry) => entry.learned).length || 0;
    const unavailable = busy || !entries;

    function updateEntry(entry, patch) {
        operate(async () => {
            await request({action: "update", id: entry.id, patch});
            await load();
            if (active.current) {
                setDrafts((old) => { const next = {...old}; delete next[entry.id]; return next; });
                setNotice({text: patch.notes !== undefined ? "笔记已保存。" : patch.learned ? "已标记为掌握。" : "已移回待学习。"});
            }
        });
    }

    async function exportBook(csv = false) {
        const items = await load();
        if (csv) {
            const fields = ["sourceText", "translatedText", "sourceLanguage", "targetLanguage", "contextText", "sourceTitle", "sourceUrl", "notes", "learned", "createdAt"];
            const rows = [["原文", "译文", "原文语言", "译文语言", "上下文", "来源标题", "来源网址", "笔记", "已掌握", "收藏时间"],
                ...items.map((entry) => fields.map((field) => field === "createdAt" ? new Date(entry[field]).toISOString() : entry[field]))];
            download(`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8", "csv");
        } else download(JSON.stringify({format: "auratranslate-vocabulary", version: 1,
            exportedAt: new Date().toISOString(), entries: items}, null, 2), "application/json;charset=utf-8", "json");
        if (active.current) setNotice({text: `已导出全部 ${items.length} 条词条。`});
    }

    function importFile(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        operate(async () => {
            if (file.size > 16 * 1024 * 1024) throw new Error("导入文件超过 16 MB。");
            let book;
            try { book = JSON.parse(await file.text()); }
            catch (_) { throw new Error("文件不是有效的 JSON 生词本。"); }
            const result = await request({action: "import", book});
            await load();
            if (active.current) setNotice({text: `已导入 ${result.imported} 条，跳过 ${result.skipped} 条重复词条。`});
        });
    }

    return (
        <section id="vocabulary" className="settings-section" role="tabpanel" aria-labelledby="tab-vocabulary" tabIndex={0} hidden={hidden}>
            <div className="section-heading">
                <p className="section-kicker">Vocabulary</p>
                <h2>生词本</h2>
                <p>收藏阅读中遇到的词句，让上下文帮助记忆。词条保存在本机，清空翻译缓存会保留生词本。</p>
            </div>
            <div className="vocabulary-toolbar">
                <label className="vocabulary-search"><span className="sr-only">搜索生词本</span>
                    <input id="vocabulary-search" type="search" placeholder="搜索原文、译文、上下文或笔记" value={query}
                           onChange={(event) => {setQuery(event.target.value); setPage(0);}}/>
                </label>
                <select id="vocabulary-filter" aria-label="学习状态" value={filter}
                        onChange={(event) => {setFilter(event.target.value); setPage(0);}}>
                    <option value="all">全部</option><option value="learning">待学习</option><option value="learned">已掌握</option>
                </select>
            </div>
            <div className="vocabulary-tools">
                <span className="vocabulary-count">共 {entries?.length || 0} 条 · 待学习 {(entries?.length || 0) - learned} · 已掌握 {learned}</span>
                <div className="vocabulary-exports">
                    <button type="button" id="vocabulary-export-json" className="secondary" disabled={unavailable} onClick={() => operate(() => exportBook())}>导出 JSON</button>
                    <button type="button" id="vocabulary-export-csv" className="secondary" disabled={unavailable} onClick={() => operate(() => exportBook(true))}>导出 CSV</button>
                    <button type="button" id="vocabulary-import" className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>导入 JSON</button>
                    <input ref={fileInput} id="vocabulary-import-file" className="sr-only" type="file" accept=".json,application/json" aria-label="导入生词本 JSON 文件" onChange={importFile}/>
                </div>
            </div>
            <p className="vocabulary-status" role="status" data-error={notice?.error === true}>
                {notice?.text || (!entries ? "正在读取生词本…" : "JSON 可用于备份和合并导入；CSV 可在表格软件中查看。")}
                {deleted && <button type="button" className="link-button" disabled={busy} onClick={() => operate(async () => {
                    await request({action: "import", book: {version: 1, entries: [deleted]}});
                    await load();
                    if (active.current) {setDeleted(null); setNotice({text: "已恢复删除的词条。"});}
                })}>撤销删除</button>}
                {notice?.error && <button type="button" className="link-button" disabled={busy} onClick={() => operate(async () => {
                    await load(); if (active.current) setNotice(null);
                })}>重新读取</button>}
            </p>
            {entries && !filtered.length && <div className="vocabulary-empty">
                <Icon name="book"/>
                <h3>{entries.length ? "没有找到匹配的词条" : "从阅读中的第一个生词开始"}</h3>
                <p>{entries.length ? "试试其他关键词或学习状态。" : "在网页上选中文字，翻译后点击“收藏到生词本”。"}</p>
                {!entries.length && <button type="button" className="secondary" onClick={() => navigate("selection-settings")}>查看划词翻译设置</button>}
            </div>}
            <ul className="vocabulary-list" aria-label="生词列表">
                {shown.map((entry) => <li key={entry.id} className="vocabulary-entry" data-word-id={entry.id}>
                    <div className="vocabulary-entry-head">
                        <h3>{entry.sourceText}</h3>
                        <span className={`vocabulary-badge${entry.learned ? " learned" : ""}`}>{entry.learned ? "已掌握" : "待学习"}</span>
                    </div>
                    <p className="vocabulary-translation">{entry.translatedText}</p>
                    <div className="vocabulary-meta">
                        <span>{languageLabel(entry.sourceLanguage)} → {languageLabel(entry.targetLanguage)}</span>
                        <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</time>
                        {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" title={entry.sourceTitle || entry.sourceUrl}>{entry.sourceTitle || new URL(entry.sourceUrl).hostname} ↗</a>}
                    </div>
                    <details className="vocabulary-context">
                        <summary>上下文与笔记</summary>
                        <p>{entry.contextText || "没有保存上下文。"}</p>
                        <label className="field"><span>笔记</span>
                            <textarea aria-label={`${entry.sourceText} 的笔记`} value={drafts[entry.id] ?? entry.notes} maxLength={2000} rows={3}
                                      onChange={(event) => setDrafts((old) => ({...old, [entry.id]: event.target.value}))}/>
                        </label>
                        <button type="button" className="secondary" disabled={busy || (drafts[entry.id] ?? entry.notes) === entry.notes}
                                onClick={() => updateEntry(entry, {notes: drafts[entry.id] ?? entry.notes})}>保存笔记</button>
                    </details>
                    <div className="vocabulary-entry-actions">
                        <button type="button" className="secondary" aria-pressed={entry.learned} disabled={busy}
                                onClick={() => updateEntry(entry, {learned: !entry.learned})}>{entry.learned ? "重新学习" : "标记已掌握"}</button>
                        <button type="button" className="link-button vocabulary-delete" disabled={busy} onClick={() => operate(async () => {
                            await request({action: "remove", id: entry.id});
                            await load();
                            if (active.current) {setDeleted(entry); setNotice({text: `已删除“${entry.sourceText}”。`});}
                        })}>删除</button>
                    </div>
                </li>)}
            </ul>
            {pageCount > 1 && <div className="vocabulary-pagination">
                <button type="button" className="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button>
                <span>第 {currentPage + 1} / {pageCount} 页 · {filtered.length} 条</span>
                <button type="button" className="secondary" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>下一页</button>
            </div>}
        </section>
    );
}
