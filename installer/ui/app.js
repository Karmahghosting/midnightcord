/* Midnightcord installer renderer. SPDX-License-Identifier: GPL-3.0-or-later */
"use strict";

const bridge = window.midnightcordInstaller;
const byId = id => document.getElementById(id);
const selected = new Set();
let state = { targets: [], running: [], busy: false };
let mode = "install";
let working = false;
let scanning = false;
let unsubscribe;

function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", `#${name}`);
    svg.setAttribute("aria-hidden", "true");
    svg.append(use);
    return svg;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function showView(name) {
    for (const view of ["loading", "selection", "progress"]) byId(`${view}-view`).hidden = view !== name;
}

function announce(message) { byId("announcement").textContent = message; }
function eligible(target) { return !!target && !target.conflict && target.writable !== false && (mode === "install" || target.installed); }
function errorText(error) { return error?.message || "Une erreur est survenue. Réessayez après avoir fermé Discord."; }

function updateSelection() {
    const targets = state.targets.filter(target => selected.has(target.id));
    const count = targets.length;
    byId("selection-count").textContent = count ? `${count} installation${count > 1 ? "s" : ""} sélectionnée${count > 1 ? "s" : ""}` : "Aucune installation sélectionnée";
    byId("perform").disabled = !count || working || scanning || !!state.error || !!state.running?.length;
    byId("perform-label").textContent = mode === "uninstall" ? "Retirer Midnightcord" : count && targets.every(target => target.installed) ? "Réparer Midnightcord" : "Installer Midnightcord";
    byId("perform").classList.toggle("remove", mode === "uninstall");
    for (const card of byId("targets").children) card.classList.toggle("selected", selected.has(card.dataset.id));
}

function renderTargets() {
    const ids = new Set(state.targets.filter(eligible).map(target => target.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
    byId("targets").replaceChildren();
    for (const target of state.targets) {
        const allowed = eligible(target);
        const card = element("label", `target-card${allowed ? "" : " unavailable"}`);
        card.dataset.id = target.id;
        if (target.conflict) card.title = target.conflict;
        else if (target.writable === false) card.title = "Vous n’avez pas la permission de modifier cette installation.";
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.value = target.id;
        checkbox.checked = selected.has(target.id);
        checkbox.disabled = !allowed || working;
        checkbox.setAttribute("aria-label", `${target.name || target.channel}${target.version ? ` ${target.version}` : ""} — ${target.path}`);
        checkbox.addEventListener("change", () => { checkbox.checked ? selected.add(target.id) : selected.delete(target.id); updateSelection(); });
        const top = element("div", "card-top");
        const badgeIcon = element("span", "channel-icon");
        badgeIcon.append(icon("discord"));
        const check = element("span", "card-check");
        check.append(icon("check"));
        top.append(badgeIcon, check);
        const name = element("div", "card-name", target.name || `Discord ${target.channel}`);
        const status = target.conflict ? "À vérifier" : target.writable === false ? "Accès restreint" : target.installed ? "Midnightcord installé" : target.channel === "stable" ? "STABLE" : target.channel.toUpperCase();
        name.append(element("span", "card-badge", status));
        const detail = element("div", "card-detail");
        detail.title = target.path;
        detail.append(icon("folder"), element("span", "", target.version ? `Version ${target.version} · ${target.path}` : target.path));
        card.append(checkbox, top, name, detail);
        byId("targets").append(card);
    }
    const count = state.targets.length;
    byId("target-count").textContent = `${count} installation${count > 1 ? "s" : ""} détectée${count > 1 ? "s" : ""}`;
    byId("empty").hidden = count > 0;
    const running = state.running ?? [];
    byId("notice").classList.toggle("warning", running.length > 0);
    byId("notice-text").textContent = running.length
        ? `${running.join(", ")} est encore ouvert. Fermez complètement Discord, puis actualisez la liste.`
        : mode === "uninstall" ? "Discord sera restauré. Vos réglages Midnightcord sont conservés." : "Fermez complètement Discord avant de continuer, y compris dans la zone de notification.";
    byId("version").textContent = state.version ? `v${state.version}` : "Midnightcord";
    byId("platform").textContent = ({ win32: "Windows", darwin: "macOS", linux: "Linux" })[state.platform] || "";
    byId("scan-error").textContent = state.error || "";
    byId("scan-error").hidden = !state.error;
    updateSelection();
}

function lockControls(value) {
    working = value;
    for (const id of ["install-mode", "uninstall-mode", "close", "rescan"]) byId(id).disabled = value;
    for (const checkbox of byId("targets").querySelectorAll("input")) checkbox.disabled = value || !eligible(state.targets.find(target => target.id === checkbox.value));
    updateSelection();
}

async function scan(initial = false) {
    if (working || scanning) return;
    scanning = true;
    byId("rescan").disabled = true;
    byId("rescan").classList.add("scanning");
    byId("scan-error").hidden = true;
    updateSelection();
    try {
        state = await (initial ? bridge.getState() : bridge.scan());
        if (!Array.isArray(state?.targets)) throw new Error("Impossible de lire les installations Discord.");
        renderTargets();
        announce(`${state.targets.length} installations Discord détectées.`);
    } catch (error) {
        state.error = errorText(error);
        byId("scan-error").textContent = errorText(error);
        byId("scan-error").hidden = false;
        announce(errorText(error));
    } finally {
        scanning = false;
        byId("rescan").disabled = false;
        byId("rescan").classList.remove("scanning");
        showView("selection");
        updateSelection();
    }
}

function onProgress(event) {
    if (!working) return;
    const percent = Math.max(0, Math.min(100, Number(event.percent) || 0));
    byId("progress").value = percent;
    byId("progress-number").textContent = `${Math.round(percent)} %`;
    byId("progress-label").textContent = event.message || "Opération en cours";
    const stages = mode === "uninstall" ? ["checking", "restoring"] : ["checking", "copying", "injecting"];
    const current = event.stage === "done" ? stages.length : stages.indexOf(event.stage);
    [...document.querySelectorAll(".progress-steps span:not([hidden])")].forEach((node, index) => {
        node.classList.toggle("current", index === current);
        node.classList.toggle("complete", current > index);
    });
    if (event.message) announce(event.message);
}

function showResult(result) {
    const ok = result.ok === true;
    byId("progress-view").classList.toggle("complete", ok);
    byId("progress-view").classList.toggle("failed", !ok);
    byId("stage-symbol").replaceChildren(icon(ok ? "check" : "info"));
    byId("progress-eyebrow").textContent = ok ? "VOUS ÊTES CHEZ VOUS." : "ENCORE UN PETIT DÉTAIL.";
    byId("progress-title").textContent = ok ? mode === "uninstall" ? "Discord, comme avant." : "Faites place à Midnightcord." : "L’opération n’a pas abouti.";
    byId("progress-description").textContent = result.message || (ok ? "Vous pouvez relancer Discord." : "Consultez le détail ci-dessous, puis réessayez.");
    if (ok) { byId("progress").value = 100; byId("progress-number").textContent = "100 %"; byId("progress-label").textContent = "Terminé"; }
    const results = result.results || [];
    byId("result-list").replaceChildren();
    for (const item of results) {
        const row = element("div", `result-row${item.ok ? "" : " failed"}`);
        const target = state.targets.find(target => target.id === item.id);
        row.append(icon(item.ok ? "check" : "info"), element("span", "", `${target?.name || "Discord"} — ${item.message || (item.ok ? "Terminé" : "Échec")}`));
        byId("result-list").append(row);
    }
    byId("result-list").hidden = results.length === 0;
    byId("progress-footnote").textContent = ok ? "Relancez votre Discord habituel pour retrouver votre espace." : "Aucune autre installation n’a été sélectionnée automatiquement.";
    byId("back").hidden = false;
    announce(byId("progress-title").textContent);
    byId("back").focus();
}

async function perform() {
    if (working || scanning || !selected.size || state.error || state.running?.length) return;
    lockControls(true);
    byId("progress-view").classList.remove("complete", "failed");
    byId("stage-symbol").replaceChildren(icon(mode === "uninstall" ? "restore" : "moon"));
    byId("progress-eyebrow").textContent = "ON S’OCCUPE DE TOUT.";
    byId("progress-title").textContent = mode === "uninstall" ? "Retour à votre Discord." : "Une touche de Midnightcord.";
    byId("progress-description").textContent = mode === "uninstall" ? "Restauration des installations sélectionnées." : "Personnalisation des installations sélectionnées.";
    byId("progress-footnote").textContent = "Gardez cette fenêtre ouverte pendant l’installation.";
    byId("result-list").hidden = true;
    byId("back").hidden = true;
    document.querySelector('.progress-steps [data-stage="injecting"]').textContent = mode === "uninstall" ? "Restauration" : "Installation";
    document.querySelector('.progress-steps [data-stage="copying"]').hidden = mode === "uninstall";
    showView("progress");
    onProgress({ stage: "checking", percent: 0, message: "Vérification de Discord" });
    try { showResult(await bridge.perform({ action: mode, targetIds: [...selected] })); }
    catch (error) { showResult({ ok: false, message: errorText(error) }); }
    finally { lockControls(false); }
}

function changeMode(next) {
    if (working || scanning || mode === next) return;
    mode = next;
    selected.clear();
    for (const name of ["install", "uninstall"]) {
        byId(`${name}-mode`).classList.toggle("active", name === mode);
        byId(`${name}-mode`).setAttribute("aria-pressed", String(name === mode));
    }
    byId("selection-title").replaceChildren();
    byId("selection-title").append(document.createTextNode(mode === "install" ? "Votre Discord." : "Retrouvez Discord."), document.createElement("br"), element("span", "", mode === "install" ? "Votre Midnightcord." : "Tout simplement."));
    byId("selection-description").textContent = mode === "install" ? "Choisissez où installer votre nouvel espace." : "Choisissez les installations à restaurer.";
    byId("footer-hint").textContent = mode === "install" ? "Votre Discord. Vos réglages." : "Vos réglages sont conservés.";
    renderTargets();
    showView("selection");
}

byId("rescan").addEventListener("click", () => void scan());
byId("perform").addEventListener("click", () => void perform());
byId("back").addEventListener("click", () => { selected.clear(); void scan(); });
byId("install-mode").addEventListener("click", () => changeMode("install"));
byId("uninstall-mode").addEventListener("click", () => changeMode("uninstall"));
byId("minimize").addEventListener("click", () => bridge?.minimize());
byId("close").addEventListener("click", () => { if (!working) bridge?.close(); });
document.querySelector(".brand").addEventListener("click", event => event.preventDefault());
window.addEventListener("beforeunload", () => unsubscribe?.());
if (bridge) { unsubscribe = bridge.onProgress(onProgress); void scan(true); }
else {
    showView("selection");
    byId("scan-error").textContent = "Ouvrez l’application Midnightcord Installer pour détecter et modifier vos installations Discord.";
    byId("scan-error").hidden = false;
    byId("rescan").disabled = true;
}
