// A single background queue prevents concurrent tabs/imports losing saved words.
let vocabularyWriteQueue = Promise.resolve();

async function readVocabularyBook() {
    const key = Core.VOCABULARY_STORAGE_KEY;
    const values = await storageGet({[key]: {version: 1, entries: []}});
    const book = values[key];
    if (!book || book.version !== 1 || !Array.isArray(book.entries) ||
        book.entries.length > Core.VOCABULARY_MAX_ENTRIES) throw new Error("生词本数据格式无法读取，请先备份扩展数据。");
    const entries = book.entries.map(Core.normalizeVocabularyEntry);
    if (entries.some((entry) => !entry || !entry.id) || new Set(entries.map((entry) => entry.id)).size !== entries.length)
        throw new Error("生词本数据不完整，请先备份扩展数据。");
    return {version: 1, entries};
}

function newVocabularyId() {
    return typeof crypto.randomUUID === "function" ? `word-${crypto.randomUUID()}`
        : `word-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function mutateVocabulary(mutate) {
    const pending = vocabularyWriteQueue.catch(() => {}).then(async () => {
        const book = await readVocabularyBook();
        const result = mutate(book);
        if (book.entries.length > Core.VOCABULARY_MAX_ENTRIES)
            throw new Error(`生词本最多保存 ${Core.VOCABULARY_MAX_ENTRIES} 条，请导出备份并删除部分词条后重试。`);
        await storageSet({[Core.VOCABULARY_STORAGE_KEY]: book});
        return {type: "VOCABULARY_RESULT", ok: true, ...result};
    });
    vocabularyWriteQueue = pending.then(() => {}, () => {});
    return pending;
}

async function handleVocabulary(message) {
    if (message.action === "list") {
        await vocabularyWriteQueue;
        return {type: "VOCABULARY_RESULT", ok: true, ...(await readVocabularyBook())};
    }
    if (message.action === "add") {
        const entry = Core.normalizeVocabularyEntry(message.entry);
        if (!entry) throw new Error("请先完成划词翻译，再收藏到生词本。");
        return mutateVocabulary((book) => {
            const identity = Core.vocabularyIdentity(entry);
            const existing = book.entries.find((item) => Core.vocabularyIdentity(item) === identity);
            if (existing) return {entry: existing, duplicate: true};
            entry.id = newVocabularyId();
            entry.createdAt = entry.updatedAt = Date.now();
            book.entries.push(entry);
            return {entry, duplicate: false};
        });
    }
    if (message.action === "update" || message.action === "remove") {
        return mutateVocabulary((book) => {
            const index = book.entries.findIndex((entry) => entry.id === message.id);
            if (index < 0) throw new Error("这个词条已被删除，请刷新生词本。");
            if (message.action === "remove") {
                book.entries.splice(index, 1);
                return {id: message.id};
            }
            const patch = message.patch || {};
            const entry = book.entries[index];
            if (typeof patch.learned === "boolean") entry.learned = patch.learned;
            if (typeof patch.notes === "string") entry.notes = patch.notes.trim().slice(0, 2000);
            entry.updatedAt = Date.now();
            return {entry};
        });
    }
    if (message.action === "import") {
        if (!message.book || message.book.version !== 1 || !Array.isArray(message.book.entries) ||
            message.book.entries.length > Core.VOCABULARY_MAX_ENTRIES)
            throw new Error("请选择 AuraTranslate 导出的生词本 JSON 文件（版本 1）。");
        const entries = message.book.entries.map(Core.normalizeVocabularyEntry);
        if (entries.some((entry) => !entry)) throw new Error("导入文件含有无效词条，未导入任何内容。");
        return mutateVocabulary((book) => {
            const identities = new Set(book.entries.map(Core.vocabularyIdentity));
            const ids = new Set(book.entries.map((entry) => entry.id));
            let imported = 0;
            for (const entry of entries) {
                const identity = Core.vocabularyIdentity(entry);
                if (identities.has(identity)) continue;
                if (!entry.id || ids.has(entry.id)) entry.id = newVocabularyId();
                ids.add(entry.id);
                identities.add(identity);
                book.entries.push(entry);
                imported++;
            }
            return {imported, skipped: entries.length - imported};
        });
    }
    throw new Error("不支持的生词本操作。");
}

async function handleSelectionTranslate(message, sender) {
    const sourceText = typeof message.sourceText === "string" ? message.sourceText.replace(/\s+/g, " ").trim() : "";
    if (!sourceText || sourceText.length > Core.SELECTION_MAX_CHARS)
        throw new Error(`请选择 1–${Core.SELECTION_MAX_CHARS} 个字符进行翻译。`);
    const contextText = typeof message.contextText === "string" ? message.contextText.slice(0, 1800) : "";
    const sourceTitle = typeof message.sourceTitle === "string" ? message.sourceTitle.slice(0, 300) : (sender.tab?.title || "").slice(0, 300);
    const sourceUrl = Core.vocabularySourceUrl(message.sourceUrl || sender.url);
    const result = await handleImmersiveTranslate({
        type: "SELECTION_TRANSLATE", pageUrl: sourceUrl,
        items: [{id: "selection", sourceText, contextText: `${sourceTitle}\n${contextText}`.slice(0, 1800)}],
    });
    const item = result.items[0];
    if (!item?.translatedText) throw new Error("翻译服务未返回译文，请重试。");
    return {type: "SELECTION_TRANSLATE_RESULT", ok: true, sourceText, translatedText: item.translatedText,
        sourceLanguage: result.sourceLanguage, targetLanguage: result.targetLanguage,
        contextText, sourceTitle, sourceUrl, cached: item.cached === true};
}
