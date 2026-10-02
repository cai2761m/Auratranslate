import {useState} from "react";
import {Core} from "../shared/settings";
import {Icon} from "../shared/Icon";

export function DisabledSites({settings, update}) {
    const [input, setInput] = useState("");
    const [error, setError] = useState("");
    const sites = Core.normalizeDisabledSites(settings.immersiveDisabledSites);
    function add(event) {
        event.preventDefault();
        const hostname = Core.normalizeSiteHostname(input);
        if (!hostname) { setError("请输入有效的网站域名或网址。"); return; }
        update((current) => ({immersiveDisabledSites: Core.normalizeDisabledSites([...current.immersiveDisabledSites, hostname])}));
        setInput("");
        setError("");
    }
    return (
        <div className="disabled-sites-settings">
            <h3 className="preference-heading">禁用小球的网站</h3>
            <form className="disabled-site-add" onSubmit={add}>
                <input id="disabled-site-input" type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder="example.com" aria-label="网站域名" aria-describedby={error ? "disabled-site-error" : undefined}/>
                <button id="add-disabled-site" type="submit" className="secondary"><Icon name="plus"/>添加</button>
            </form>
            {error && <p id="disabled-site-error" className="status" role="alert" data-error="true">{error}</p>}
            <ul className="disabled-site-list" id="disabled-site-list">
                {sites.map((hostname) => <li key={hostname}><span>{hostname}</span><button type="button" className="icon-button" data-remove-disabled-site={hostname} title={`删除 ${hostname}`} aria-label={`删除 ${hostname}`} onClick={() => update((current) => ({immersiveDisabledSites: current.immersiveDisabledSites.filter((site) => site !== hostname)}))}><Icon name="close"/></button></li>)}
            </ul>
            {!sites.length && <p className="section-note">暂无禁用网站</p>}
        </div>
    );
}
