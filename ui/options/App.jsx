import {useEffect, useState} from "react";
import {Core} from "../shared/settings";
import {useSettings} from "./useSettings";
import {ServiceDetail} from "./ServiceDetail";
import {ServiceDialog} from "./ServiceDialog";
import {ModelTestDialog} from "./ModelTestDialog";
import {TranslationSettings} from "./TranslationSettings";
import {GeneralSettings} from "./GeneralSettings";
import {Icon} from "../shared/Icon";

const PAGES = [
    ["translation-services", "翻译服务", "供应方与模型目录"],
    ["realtime-api", "实时字幕", "视频双语字幕"],
    ["immersive-api", "沉浸式翻译", "网页翻译"],
    ["general-settings", "通用设置", "语言、字幕与缓存"],
];
const currentPage = () =>
    PAGES.find(([id]) => id === location.hash.replace(/^#\/?/, ""))?.[0] ||
    PAGES[0][0];

export function OptionsApp() {
    const {settings, update, status, clearCache} = useSettings();
    const [page, setPage] = useState(currentPage);
    const [selectedId, setSelectedId] = useState("");
    const [draft, setDraft] = useState(undefined);
    const [testing, setTesting] = useState(null);
    const [picking, setPicking] = useState(false);
    const modal = draft !== undefined || !!testing;
    const service =
        settings &&
        (Core.findTranslationService(settings.translationServices, selectedId) ||
            Core.findTranslationService(
                settings.translationServices,
                settings.translationServiceId,
            ) ||
            settings.translationServices[0]);
    useEffect(() => {
        const follow = () => setPage(currentPage());
        window.addEventListener("hashchange", follow);
        window.addEventListener("popstate", follow);
        return () => {
            window.removeEventListener("hashchange", follow);
            window.removeEventListener("popstate", follow);
        };
    }, []);
    useEffect(() => {
        document.title = `${PAGES.find(([id]) => id === page)[1]} · AuraTranslate 设置`;
    }, [page]);

    function navigate(id, focus = false) {
        setPage(id);
        if (location.hash !== `#${id}`) {
            try {
                history.pushState(null, "", `#${id}`);
            } catch {
            }
        }
        if (focus) document.getElementById(`tab-${id}`)?.focus();
        window.scrollTo({
            top: Math.max(
                0,
                (document.querySelector(".settings-layout")?.getBoundingClientRect()
                    .top || 0) +
                window.scrollY -
                20,
            ),
            behavior: "smooth",
        });
    }

    function navigateKey(event, index) {
        const next = {
            ArrowDown: index + 1,
            ArrowRight: index + 1,
            ArrowUp: index - 1,
            ArrowLeft: index - 1,
            Home: 0,
            End: PAGES.length - 1,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        navigate(PAGES[(next + PAGES.length) % PAGES.length][0], true);
    }

    function changeService(patch) {
        update(
            (current) => ({
                translationServices: current.translationServices.map((item) =>
                    item.id === service.id ? {...item, ...patch} : item,
                ),
            }),
            false,
        );
    }

    function saveDraft(value) {
        const id =
            value.id ||
            `service-${1 + Math.max(0, ...settings.translationServices.map((item) => Number(/^service-(\d+)$/.exec(item.id)?.[1] || 0)))}`;
        update((current) => ({
            translationServices: value.id
                ? current.translationServices.map((item) =>
                    item.id === id ? {...value, id} : item,
                )
                : [...current.translationServices, {...value, id}],
        }));
        setSelectedId(id);
        setDraft(undefined);
    }

    return (
        <main className="page">
            <header className="page-header">
                <div className="brand">
                    <img className="brand-mark" src="../icons/icon.svg" alt=""/>
                    <span className="brand-name">AuraTranslate</span>
                    <span className="header-divider"/>
                    <h1>设置</h1>
                </div>
                <span className="save-note">更改自动保存</span>
            </header>
            <div className="settings-layout">
                <aside className="settings-sidebar" inert={modal || picking}>
                    <nav
                        className="sidebar-nav"
                        role="tablist"
                        aria-orientation="vertical"
                        aria-label="设置导航"
                    >
                        {PAGES.map(([id, label, desc], index) => (
                            <button
                                type="button"
                                id={`tab-${id}`}
                                key={id}
                                className="sidebar-link"
                                role="tab"
                                aria-controls={id}
                                aria-selected={page === id}
                                tabIndex={page === id ? 0 : -1}
                                onClick={() => navigate(id)}
                                onKeyDown={(event) => navigateKey(event, index)}
                            >
                                <Icon name={["services", "subtitles", "webpage", "settings"][index]}/>
                                <span className="sidebar-copy">
                  <span className="sidebar-title">{label}</span>
                  <span className="sidebar-desc">{desc}</span>
                </span>
                            </button>
                        ))}
                    </nav>
                </aside>
                <div className="settings-content">
                    <div id="settings-form" className="panel" inert={modal || picking}>
                        {settings && (
                            <>
                                <section
                                    id="translation-services"
                                    className="settings-section"
                                    role="tabpanel"
                                    aria-labelledby="tab-translation-services"
                                    tabIndex={0}
                                    hidden={page !== "translation-services"}
                                >
                                    <div className="section-heading">
                                        <p className="section-kicker">Providers</p>
                                        <h2>翻译服务</h2>
                                        <p>
                                            连接你的 AI 服务，为网页与字幕选择合适的翻译模型。
                                        </p>
                                    </div>
                                    <div className="services-workspace">
                                        <aside
                                            className="services-sidebar"
                                            aria-label="翻译服务列表"
                                        >
                                            <div className="services-scroll">
                                                <div className="service-group">
                                                    <h3>我的服务 <span>{settings.translationServices.length}</span></h3>
                                                    <div
                                                        className="service-list"
                                                        id="custom-service-list"
                                                    >
                                                        {settings.translationServices.map((item) => (
                                                            <button
                                                                type="button"
                                                                key={item.id}
                                                                className="service-entry"
                                                                data-select-service={item.id}
                                                                aria-controls="service-detail"
                                                                aria-current={item.id === service?.id}
                                                                onClick={() => setSelectedId(item.id)}
                                                            >
                                <span className="service-avatar">
                                  <Icon name="services"/>
                                </span>
                                                                <span className="service-entry-copy">
                                  <span className="service-entry-name">
                                    {item.name || "未命名供应方"}
                                  </span>
                                  <span className="service-entry-hint">
                                    {[
                                            item.id === settings.translationServiceId &&
                                            "默认",
                                            item.id === settings.immersiveTranslationServiceId &&
                                            "网页默认",
                                        ].filter(Boolean).join(" · ") ||
                                        `${item.models.length} 个模型`}
                                  </span>
                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <p
                                                        className="service-empty"
                                                        id="custom-service-empty"
                                                        hidden={!!settings.translationServices.length}
                                                    >
                                                        暂无自定义供应方
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="services-add">
                                                <button
                                                    type="button"
                                                    id="add-service"
                                                    onClick={() => setDraft(null)}
                                                >
                                                    <Icon name="plus"/> 添加翻译服务
                                                </button>
                                            </div>
                                        </aside>
                                        <ServiceDetail
                                            service={service}
                                            onChange={changeService}
                                            onEdit={() => setDraft(service)}
                                            onTest={() => setTesting(service)}
                                            blocked={modal}
                                            setPicking={setPicking}
                                            onDelete={() => {
                                                update({
                                                    translationServices:
                                                        settings.translationServices.filter(
                                                            (item) => item.id !== service.id,
                                                        ),
                                                });
                                                setSelectedId("");
                                            }}
                                        />
                                        {!service && (
                                            <div className="service-welcome">
                                                <span className="welcome-icon"><Icon name="services"/></span>
                                                <h3>连接第一个翻译服务</h3>
                                                <p>添加兼容 OpenAI 的服务地址和模型，<br/>开始使用 AI 翻译。</p>
                                                <button type="button" className="secondary"
                                                        onClick={() => setDraft(null)}>
                                                    添加翻译服务 <Icon name="arrow"/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </section>
                                <TranslationSettings
                                    settings={settings}
                                    update={update}
                                    hidden={page !== "realtime-api"}
                                    navigate={navigate}
                                />
                                <TranslationSettings
                                    settings={settings}
                                    update={update}
                                    immersive
                                    hidden={page !== "immersive-api"}
                                />
                                <GeneralSettings
                                    settings={settings}
                                    update={update}
                                    clearCache={clearCache}
                                    hidden={page !== "general-settings"}
                                />
                            </>
                        )}
                        <p id="status" className="status" role="status" data-error={/失败|无法/.test(status)}>
                            {status}
                        </p>
                    </div>
                </div>
            </div>
            {draft !== undefined && (
                <ServiceDialog
                    service={draft}
                    onSave={saveDraft}
                    onClose={() => setDraft(undefined)}
                />
            )}
            {testing && (
                <ModelTestDialog service={testing} onClose={() => setTesting(null)}/>
            )}
        </main>
    );
}
