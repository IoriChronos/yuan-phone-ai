import {
    getActiveCard,
    updateActiveCard,
    GENERIC_BIO
} from "../data/character-cards.js";
import {
    getGlobalSystemRules,
    getGlobalUserPersona,
    getGlobalUserName,
    getGlobalUserGender,
    getGlobalUserHeight,
    getGlobalUserRef,
    setGlobalUserRef,
    setGlobalUserPersona,
    setGlobalUserName,
    setGlobalUserGender,
    setGlobalUserHeight
} from "../data/system-rules.js";
import { getWindowOverrides, setWindowOverrides } from "../core/window-context.js";
import {
    getSTM,
    setSTM,
    getLTM,
    setLTM,
    getPersonaMemoryText,
    setPersonaMemoryText,
    getRawReplyLimit,
    setRawReplyLimit,
    getWindowUserPersonaOverride,
    setWindowUserPersonaOverride,
    getWindowUserNameOverride,
    getWindowUserGenderOverride,
    getWindowUserHeightOverride,
    getWindowUserRefOverride,
    setWindowUserIdentityOverride
} from "../data/window-memory.js";
import {
    regenerateSTMViaAI,
    consolidateLTMViaAI
} from "../core/memory-engine.js";
import { getWindowId } from "../core/window-context.js";
import { saveToast } from "../core/save-feedback.js";
import { runSetupAssistant } from "../core/ai.js";

const GENDER_OPTIONS = ["男", "女", "双性", "无性别", "ABO"];
const ABO_SUB_OPTIONS = ["Alpha", "Beta", "Omega"];
const SHEET_POSITIONS = ["fullscreen"];
const PREF_KEY = "yuan-phone:character-sheet:prefs";
const USER_REF_PRESETS = [
    { id: "first", label: "一人称（我）", value: "我" },
    { id: "second", label: "二人称（你）", value: "你" },
    { id: "third", label: "三人称（他）", value: "他" }
];

function normalizePos(pos) {
    return "fullscreen";
}

function normalizeTab(tab) {
    if (tab === "role" || tab === "rules" || tab === "memory" || tab === "player") return tab;
    return "role";
}

function readPrefs() {
    if (typeof window === "undefined" || !window.localStorage) return {};
    try {
        const raw = window.localStorage.getItem(PREF_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writePrefs(next = {}) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        const prev = readPrefs();
        window.localStorage.setItem(PREF_KEY, JSON.stringify({ ...prev, ...next }));
    } catch {
        // ignore persistence errors
    }
}

function bindGentleDoubleTap(target, handler) {
    if (!target || typeof handler !== "function") return;
    let lastTap = 0;
    let lastPos = null;
    const timeLimit = 420;
    const moveLimit = 22;
    const onPointerUp = (ev) => {
        if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
        const now = Date.now();
        const pos = { x: ev.clientX || 0, y: ev.clientY || 0 };
        const withinTime = now - lastTap < timeLimit;
        const withinMove = lastPos ? Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < moveLimit : false;
        if (withinTime && withinMove) {
            lastTap = 0;
            lastPos = null;
            handler(ev);
            return;
        }
        lastTap = now;
        lastPos = pos;
    };
    target.addEventListener("pointerup", onPointerUp, { passive: true, capture: true });
}

export function initCharacterProfile(triggerEl, sheetEl, options = {}) {
    const headerTrigger = triggerEl?.closest ? (triggerEl.closest("#story-header") || triggerEl) : triggerEl;
    if (!headerTrigger || !sheetEl) return { refresh: () => {}, show: () => {}, hide: () => {} };
    const inner = sheetEl.querySelector(".sheet-inner") || sheetEl;
    sheetEl.classList.add("character-sheet", "ui-modal-backdrop");
    inner.classList.add("ui-modal");
    const closeBtn = sheetEl.querySelector("#character-sheet-close");
    const prefs = readPrefs();
    sheetEl.dataset.pos = "fullscreen";
    if (prefs.tab) sheetEl.dataset.tab = normalizeTab(prefs.tab);

    function loadWindowRules(slotId) {
        try {
            const overrides = getWindowOverrides(slotId) || {};
            return {
                windowSystemOverride: overrides.windowSystemOverride || ""
            };
        } catch {
            return null;
        }
    }

    function saveWindowRules(slotId, data = {}) {
        try {
            setWindowOverrides(slotId, {
                windowSystemOverride: data.rules ?? data.windowSystemOverride ?? ""
            });
        } catch {
            /* ignore */
        }
    }

    function renderSheet() {
        const active = getActiveCard();
        const tab = normalizeTab(sheetEl.dataset.tab || prefs.tab || "role");
        const pos = normalizePos(sheetEl.dataset.pos);
        sheetEl.dataset.pos = "fullscreen";
        sheetEl.dataset.tab = tab;
        writePrefs({ tab });
        const headline = active.publicProfile || "写下简介或标签，展示给玩家。";
        const subline = active.bio || "";
        const windowId = readWindowId();
        inner.innerHTML = `
            <header class="sheet-head combined ui-modal-header">
                <div class="sheet-head-left">
                    <p class="sheet-kicker">角色档案</p>
                    <h3>${escapeHtml(active.name || "未命名角色")}</h3>
                    <p class="sheet-tagline">${escapeHtml([headline, subline].filter(Boolean).join(" · "))}</p>
                </div>
                <div class="sheet-head-right">
                    <button id="character-sheet-close" type="button" aria-label="关闭">✕</button>
                </div>
            </header>
            <div class="sheet-tabs">
                <button class="tab-btn ${tab === "role" ? "active" : ""}" data-tab="role">角色</button>
                <button class="tab-btn ${tab === "rules" ? "active" : ""}" data-tab="rules">规则</button>
                <button class="tab-btn ${tab === "player" ? "active" : ""}" data-tab="player">我的人设</button>
                <button class="tab-btn ${tab === "memory" ? "active" : ""}" data-tab="memory">记忆</button>
            </div>
            <section class="sheet-body ui-modal-body" data-active-tab="${tab}">
                ${
                    tab === "rules"
                        ? renderRules(active)
                        : tab === "memory"
                            ? renderMemory(windowId)
                            : tab === "player"
                                ? renderPlayer()
                                : renderRole(active)
                }
            </section>
            <footer class="ui-modal-footer"></footer>
        `;
        wireInteractions(inner, active, windowId);
    }

function renderRole(card) {
        const personaText = card.personaStyle || "用一句话写下他的语气、危险感或温度。";
        const bioText = card.publicProfile || card.bio || GENERIC_BIO;
        const sexValue = (card.sex || "男").toLowerCase();
        const species = card.species || "人";
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">AI 会读入</header>
                    <section class="card-body ui-panel-body">
                        <p class="card-note gold">✔ 以下字段每次都会注入 Narrator Prompt</p>
                        <div class="card-form grid-two slim">
                            <label>角色名称 <span class="required">*</span>
                                <input type="text" data-role-field="name" value="${escapeAttr(card.name || "")}" placeholder="写下角色名或称呼">
                            </label>
                            <label>性别 <span class="required">*</span>
                                <select data-role-field="sex" class="pill-select">
                                    ${GENDER_OPTIONS.map(option => {
                                        const val = option.toLowerCase();
                                        const label = option === "ABO" ? "ABO" : option;
                                        const selected = sexValue === val ? "selected" : "";
                                        return `<option value="${label}" ${selected}>${label}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label class="abo-sub-row" style="${sexValue === "abo" ? "" : "display:none;"}">ABO 分化
                                <select data-role-field="aboSub" class="pill-select">
                                    ${ABO_SUB_OPTIONS.map(opt => {
                                        const selected = (card.aboSub || "").toLowerCase() === opt.toLowerCase() ? "selected" : "";
                                        return `<option value="${opt}" ${selected}>${opt}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label>种族 / 形态 <span class="required">*</span>
                                <input type="text" data-role-field="species" value="${escapeAttr(species)}" placeholder="人 / 黑雾">
                            </label>
                            <label>身高
                                <input type="text" data-role-field="height" value="${escapeAttr(card.height || "")}" placeholder="180 cm / 5'11\\\"">
                            </label>
                            <label>世界标签
                                <input type="text" data-role-field="worldTag" value="${escapeAttr(card.worldTag || "")}" placeholder="现代都市 / 末日">
                            </label>
                            <label>世界背景
                                <textarea data-role-field="worldLore" rows="2" placeholder="世界观、规则">${escapeHtml(card.worldLore || "")}</textarea>
                            </label>
                            <label>角色背景 / 过往
                                <textarea data-role-field="background" rows="2" placeholder="角色经历、过往事件、立场">${escapeHtml(card.background || "")}</textarea>
                            </label>
                            <label>故事线 / 引导
                                <textarea data-role-field="storyline" rows="2" placeholder="开局关系、引导目标、剧情提醒">${escapeHtml(card.storyline || card.background || "")}</textarea>
                            </label>
                            <label>Persona / 语气
                                <small class="field-note">AI 强读取</small>
                                <textarea data-role-field="personaStyle" rows="3" placeholder="压迫、温柔、节奏、口癖">${escapeHtml(personaText)}</textarea>
                            </label>
                            <label>外貌
                                <textarea data-role-field="appearance" rows="2" placeholder="身形、衣着、风格">${escapeHtml(card.appearance || "")}</textarea>
                            </label>
                        </div>
                        <div class="card-actions inline">
                            <span class="save-hint" data-required-hint style="display:none;">必填项未完成</span>
                            <button class="ghost" data-action="setup-fill">补全设定</button>
                            <button class="primary" data-action="save">保存</button>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">仅展示给玩家</header>
                    <section class="card-body ui-panel-body">
                        <p class="card-note">✘ 此处仅用于展示，不会进入 AI 提示</p>
                        <div class="card-form slim">
                            <label>简介（展示标题）
                                <input type="text" data-role-field="publicProfile" value="${escapeAttr(bioText)}" placeholder="这一段只给玩家看">
                            </label>
                            <label>标签 / 备注（展示副标题）
                                <textarea data-role-field="bio" rows="2" placeholder="标签、备注、彩蛋">${escapeHtml(card.bio || "")}</textarea>
                            </label>
                        </div>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save">保存</button>
                        </div>
                    </section>
                </div>
            </div>
        `;
}

    function renderPlayer() {
        const windowId = readWindowId();
        const userNameGlobal = getGlobalUserName();
        const userGenderGlobalRaw = getGlobalUserGender() || "男";
        const userHeightGlobal = getGlobalUserHeight() || "";
        const userRefGlobal = (getGlobalUserRef() || "你").trim() || "你";
        const userProfile = getGlobalUserPersona() || "";
        const windowPersona = getWindowUserPersonaOverride(windowId, userProfile) || "";
        const windowName = getWindowUserNameOverride(windowId, "") || "";
        const windowGenderRaw = (getWindowUserGenderOverride(windowId, "") || "");
        const windowHeight = getWindowUserHeightOverride(windowId, "") || "";
        const windowRef = getWindowUserRefOverride(windowId, userRefGlobal) || "";
        const refMode = windowRef === "你" ? "second" : windowRef === "我" ? "first" : "third";
        const refValue = refMode === "first" ? "我" : refMode === "second" ? "你" : "他";
        const genderGlobalIsAbo = userGenderGlobalRaw.toLowerCase().startsWith("abo");
        const genderGlobalBase = genderGlobalIsAbo ? "ABO" : userGenderGlobalRaw;
        const genderGlobalSub = genderGlobalIsAbo ? (userGenderGlobalRaw.split("-")[1] || "Alpha") : "";
        const genderWindowIsAbo = windowGenderRaw.toLowerCase().startsWith("abo");
        const genderWindowBase = genderWindowIsAbo ? "ABO" : (windowGenderRaw || genderGlobalBase);
        const genderWindowSub = genderWindowIsAbo ? (windowGenderRaw.split("-")[1] || "Alpha") : genderGlobalSub;
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">全局人设</header>
                    <section class="card-body ui-panel-body">
                        <p class="card-note gold">默认写入所有新窗口，可在窗口内覆盖</p>
                        <div class="card-form slim">
                            <label>全局名称
                                <input type="text" data-player-field="global-name" value="${escapeAttr(userNameGlobal || "")}" placeholder="玩家名称">
                            </label>
                            <label>全局性别
                                <select data-player-field="global-gender" class="pill-select">
                                    ${GENDER_OPTIONS.map(opt => {
                                        const val = opt;
                                        const selected = genderGlobalBase.toLowerCase() === val.toLowerCase() ? "selected" : "";
                                        return `<option value="${val}" ${selected}>${val}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label class="abo-sub-row-global" style="${genderGlobalBase.toLowerCase() === "abo" ? "" : "display:none;"}">ABO 分化
                                <select data-player-field="global-abo-sub" class="pill-select">
                                    ${ABO_SUB_OPTIONS.map(opt => {
                                        const selected = genderGlobalSub.toLowerCase() === opt.toLowerCase() ? "selected" : "";
                                        return `<option value="${opt}" ${selected}>${opt}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label>全局身高
                                <input type="text" data-player-field="global-height" value="${escapeAttr(userHeightGlobal)}" placeholder="180 cm">
                            </label>
                            <label>全局人称
                                <select data-player-field="global-ref" class="pill-select">
                                    ${USER_REF_PRESETS.map(opt => {
                                        const selected = (userRefGlobal === opt.value) ? "selected" : "";
                                        return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label>全局人设文本
                                <textarea data-player-field="global-profile" rows="4" placeholder="全局人设">${escapeHtml(userProfile)}</textarea>
                            </label>
                        </div>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save-player-global">保存全局</button>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">窗口人设</header>
                    <section class="card-body ui-panel-body">
                        <p class="card-note">留空则沿用全局；可在本窗口覆盖名称/性别/身高/人称/人设</p>
                        <div class="card-form slim">
                            <label>窗口名称
                                <input type="text" data-player-field="window-name" value="${escapeAttr(windowName)}" placeholder="${escapeAttr(userNameGlobal || "玩家")}">
                            </label>
                            <label>窗口性别
                                <select data-player-field="window-gender" class="pill-select">
                                    ${GENDER_OPTIONS.map(opt => {
                                        const val = opt;
                                        const selected = genderWindowBase.toLowerCase().startsWith(val.toLowerCase()) ? "selected" : "";
                                        return `<option value="${val}" ${selected}>${val}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label class="abo-sub-row-window" style="${genderWindowBase.toLowerCase().includes("abo") ? "" : "display:none;"}">ABO 分化
                                <select data-player-field="window-abo-sub" class="pill-select">
                                    ${ABO_SUB_OPTIONS.map(opt => {
                                        const selected = genderWindowSub.toLowerCase() === opt.toLowerCase() ? "selected" : "";
                                        return `<option value="${opt}" ${selected}>${opt}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label>窗口身高
                                <input type="text" data-player-field="window-height" value="${escapeAttr(windowHeight)}" placeholder="${escapeAttr(userHeightGlobal || "身高")}">
                            </label>
                            <label>窗口人称
                                <select data-player-field="window-ref" class="pill-select">
                                    ${USER_REF_PRESETS.map(opt => {
                                        const selected = (refMode === "first" && opt.value === "我") || (refMode === "second" && opt.value === "你") || (refMode === "third" && opt.value === "他") ? "selected" : "";
                                        return `<option value="${opt.value}" ${selected}>${opt.label}</option>`;
                                    }).join("")}
                                </select>
                            </label>
                            <label>窗口人设（单段文本）
                                <textarea data-player-field="window-profile" rows="6" placeholder="留空则使用全局人设">${escapeHtml(windowPersona)}</textarea>
                            </label>
                        </div>
                        <div class="card-actions inline">
                            <button class="ghost" data-action="reset-player">恢复全局默认</button>
                            <button class="primary" data-action="save-player">保存窗口人设</button>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    function renderRules(card) {
        const slotId = typeof window !== "undefined" ? window.__YUAN_SLOT__ : undefined;
        const winRule = loadWindowRules(slotId) || {};
        const globalDefaults = loadGlobalDefaults();
        const rulesText = winRule.windowSystemOverride || "";
        const systemPrompt = globalDefaults.rules || "";
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">SYSTEM Prompt</header>
                    <section class="card-body ui-panel-body">
                        <p class="card-note">SYSTEM · 仅规则面板展示，不进入消息列表</p>
                        <div class="global-rule-box system-only">
                            <div class="card-head small">SYSTEM</div>
                            <p class="global-rule-text">${renderLines(systemPrompt, "暂无全局规则，可在首页设置。")}</p>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">角色规则</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <label>回复规则
                                <textarea data-field="replyRules" rows="6" placeholder="角色的系统规则">${escapeHtml(card.replyRules || "")}</textarea>
                            </label>
                            <div class="card-actions inline">
                                <button class="primary" data-action="save-rules">保存</button>
                            </div>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">窗口规则</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <div class="global-rule-box">
                                <div class="card-head small">全局规则</div>
                                <p class="global-rule-text">${renderLines(systemPrompt, "暂无全局规则，可在首页设置。")}</p>
                                <div class="card-actions inline">
                                    <button class="ghost" data-action="import-global" ${systemPrompt ? "" : "disabled"}>导入全局规则</button>
                                </div>
                            </div>
                            <label>当前窗口规则
                                <textarea data-field="win-rules" rows="5" placeholder="此窗口限定规则，默认继承角色规则">${escapeHtml(rulesText)}</textarea>
                            </label>
                            <div class="card-actions inline">
                                <button class="primary" data-action="save-win">保存窗口规则</button>
                            </div>
                            <p class="rule-hint">仅作用于此聊天窗口，默认载入全局规则，可随时覆盖。</p>
                            <p class="rule-hint">System Prompt 不会作为聊天气泡出现，也不计入 AI 轮次。</p>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    function renderMemory(windowId) {
        const stm = getSTM(windowId);
        const ltm = getLTM(windowId);
        const persona = getPersonaMemoryText(windowId);
        const rawLimit = getRawReplyLimit(windowId);
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Memory · 窗口隔离</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <p class="card-note">仅作用于当前窗口（windowId）。原始上下文缓存不可见，仅可调整保留数量。</p>
                            <label>Raw Context Cache Size
                                <input type="number" min="1" max="12" data-field="raw-limit" class="pill-input" value="${escapeAttr(rawLimit)}">
                            </label>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Short Memory (STM)</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <textarea data-field="mem-stm" rows="6" placeholder="第三人称近期摘要（可编辑）">${escapeHtml(stm)}</textarea>
                            <div class="card-actions inline">
                                <button class="primary" data-action="save-stm">保存</button>
                                <button class="ghost" data-action="regen-stm">Regenerate STM</button>
                            </div>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Long Memory (LTM)</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <textarea data-field="mem-ltm" rows="6" placeholder="长期世界 / 事件记忆（可编辑）">${escapeHtml(ltm)}</textarea>
                            <div class="card-actions inline">
                                <button class="primary" data-action="save-ltm">保存</button>
                                <button class="ghost" data-action="regen-ltm">Consolidate from STM</button>
                            </div>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Persona Memory</header>
                    <section class="card-body ui-panel-body">
                        <div class="card-form slim">
                            <textarea data-field="mem-persona" rows="5" placeholder="AI 对用户 / 角色的理解">${escapeHtml(persona)}</textarea>
                            <div class="card-actions inline">
                                <button class="primary" data-action="save-persona">保存</button>
                                <button class="ghost" data-action="regen-persona">Regenerate from STM</button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    function wireInteractions(root, card, windowId) {
        root.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.tab;
                sheetEl.dataset.tab = tab;
                writePrefs({ tab });
                renderSheet();
            });
        });

        const saveButtons = Array.from(root.querySelectorAll("[data-action='save']"));
        const requiredHint = root.querySelector("[data-required-hint]");
        const nameField = root.querySelector("[data-role-field='name']");
        const sexField = root.querySelector("[data-role-field='sex']");
        const speciesField = root.querySelector("[data-role-field='species']");
        const aboRow = root.querySelector(".abo-sub-row");
        const aboSelect = root.querySelector("[data-role-field='aboSub']");
        const validateRequired = () => {
            const ok = Boolean((nameField?.value || "").trim()) && Boolean((sexField?.value || "").trim()) && Boolean((speciesField?.value || "").trim());
            saveButtons.forEach(btn => btn.disabled = !ok);
            if (requiredHint) requiredHint.style.display = ok ? "none" : "inline-flex";
        };
        nameField?.addEventListener("input", validateRequired);
        sexField?.addEventListener("change", () => {
            const val = (sexField.value || "").toLowerCase();
            if (aboRow) aboRow.style.display = val === "abo" ? "" : "none";
            if (aboSelect && val !== "abo") aboSelect.value = "";
            validateRequired();
        });
        speciesField?.addEventListener("input", validateRequired);
        validateRequired();
        const bindAboToggle = (selectEl, rowEl, subSelect) => {
            if (!selectEl || !rowEl) return;
            selectEl.addEventListener("change", () => {
                const val = (selectEl.value || "").toLowerCase();
                rowEl.style.display = val === "abo" ? "" : "none";
                if (subSelect && val !== "abo") subSelect.value = "";
            });
        };
        bindAboToggle(root.querySelector("[data-player-field='global-gender']"), root.querySelector(".abo-sub-row-global"), root.querySelector("[data-player-field='global-abo-sub']"));
        bindAboToggle(root.querySelector("[data-player-field='window-gender']"), root.querySelector(".abo-sub-row-window"), root.querySelector("[data-player-field='window-abo-sub']"));
        const handleSaveRole = () => {
            const payload = collectRolePayload(root, card);
            if (!payload.name || !payload.sex || !payload.species) {
                validateRequired();
                return;
            }
            try {
                const updated = updateActiveCard({ ...card, ...payload, updatedAt: Date.now() });
                options.onRoleUpdate?.(updated);
                saveToast(true, "角色卡已保存");
                try {
                    window.parent?.postMessage({ type: "role-updated", role: updated }, "*");
                } catch {
                    /* ignore */
                }
                try {
                    window.dispatchEvent(new CustomEvent("role:updated", { detail: updated }));
                } catch {
                    /* ignore */
                }
            } catch (err) {
                console.error("角色卡保存失败", err);
                saveToast(false, "角色卡保存失败");
            }
            renderSheet();
        };
        saveButtons.forEach(btn => btn.addEventListener("click", handleSaveRole));

        root.querySelector("[data-action='setup-fill']")?.addEventListener("click", async () => {
            const preference = await promptSetupPreference();
            if (preference === null) return;
            const payload = collectRolePayload(root, card);
            const merged = { ...card, ...payload };
            try {
                const result = await runSetupAssistant(merged, preference, readWindowId());
                if (!result || !Object.keys(result).length) {
                    saveToast(false, "没有可补全的字段");
                    return;
                }
                const filled = { ...merged };
                Object.entries(result).forEach(([key, value]) => {
                    if (!filled[key]) filled[key] = value;
                });
                const updated = updateActiveCard(filled);
                options.onRoleUpdate?.(updated);
                saveToast(true, "已补全空白设定");
                renderSheet();
            } catch (err) {
                console.error("[SetupAssistant] failed", err);
                saveToast(false, "补全失败");
            }
        });

        const saveWinBtn = root.querySelector("[data-action='save-win']");
        saveWinBtn?.addEventListener("click", () => {
            try {
                const slotId = typeof window !== "undefined" ? window.__YUAN_SLOT__ : undefined;
                const rules = root.querySelector("[data-field='win-rules']")?.value || "";
                saveWindowRules(slotId, { rules });
                saveToast(true, "窗口规则已保存");
            } catch (err) {
                console.error("窗口规则保存失败", err);
                saveToast(false, "窗口规则保存失败");
            }
            renderSheet();
        });

        root.querySelector("[data-action='import-global']")?.addEventListener("click", () => {
            const defaults = loadGlobalDefaults();
            const rulesEl = root.querySelector("[data-field='win-rules']");
            if (rulesEl && defaults.rules) rulesEl.value = defaults.rules;
            saveToast(true, "已载入全局设定");
        });

        root.querySelector("[data-action='save-rules']")?.addEventListener("click", () => {
            const replyRules = (root.querySelector("[data-field='replyRules']")?.value || "").trim();
            try {
                const updated = updateActiveCard({
                    ...card,
                    replyRules,
                    aiProfile: "",
                    background: "",
                    family: "",
                    personality: "",
                    dynamic: [],
                    aboSub: "",
                    opener: "",
                    updatedAt: Date.now()
                });
                options.onRoleUpdate?.(updated);
                saveToast(true, "角色规则已保存");
            } catch (err) {
                console.error("角色规则保存失败", err);
                saveToast(false, "角色规则保存失败");
            }
            renderSheet();
        });

        const rawInput = root.querySelector("[data-field='raw-limit']");
        rawInput?.addEventListener("change", () => {
            const next = Number(rawInput.value);
            setRawReplyLimit(next, windowId);
            rawInput.value = getRawReplyLimit(windowId);
        });

        const stmField = root.querySelector("[data-field='mem-stm']");
        root.querySelector("[data-action='save-stm']")?.addEventListener("click", () => {
            setSTM(stmField?.value || "", windowId);
            saveToast(true, "STM 已保存");
        });
        root.querySelector("[data-action='regen-stm']")?.addEventListener("click", async (ev) => {
            const btn = ev.currentTarget;
            await withMemoryBusy(btn, async () => {
                const next = await regenerateSTMViaAI(windowId);
                if (stmField) stmField.value = next || "";
                saveToast(Boolean(next), next ? "STM 已重生成" : "STM 生成失败");
            });
        });

        const ltmField = root.querySelector("[data-field='mem-ltm']");
        root.querySelector("[data-action='save-ltm']")?.addEventListener("click", () => {
            setLTM(ltmField?.value || "", windowId);
            saveToast(true, "LTM 已保存");
        });
        root.querySelector("[data-action='regen-ltm']")?.addEventListener("click", async (ev) => {
            const btn = ev.currentTarget;
            await withMemoryBusy(btn, async () => {
                const next = await consolidateLTMViaAI(windowId);
                if (ltmField) ltmField.value = next.ltm || "";
                const personaField = root.querySelector("[data-field='mem-persona']");
                if (personaField && next.persona) personaField.value = next.persona;
                saveToast(Boolean(next?.ltm), next?.ltm ? "已整合到 LTM" : "LTM 生成失败");
            });
        });

        const personaField = root.querySelector("[data-field='mem-persona']");
        root.querySelector("[data-action='save-persona']")?.addEventListener("click", () => {
            setPersonaMemoryText(personaField?.value || "", windowId);
            saveToast(true, "Persona 已保存");
        });
        root.querySelector("[data-action='regen-persona']")?.addEventListener("click", async (ev) => {
            const btn = ev.currentTarget;
            await withMemoryBusy(btn, async () => {
                const next = await consolidateLTMViaAI(windowId);
                if (personaField) personaField.value = next.persona || personaField.value || "";
                if (ltmField && next.ltm) ltmField.value = next.ltm;
                saveToast(Boolean(next?.persona || next?.ltm), "Persona / LTM 已更新");
            });
        });

        const close = root.querySelector("#character-sheet-close");
        close?.addEventListener("click", hide);

        root.querySelector("[data-action='save-player']")?.addEventListener("click", () => {
            const windowId = readWindowId();
            const payload = collectPlayerPayload(root);
            setWindowUserIdentityOverride({
                name: payload.name,
                gender: payload.gender,
                height: payload.height,
                ref: payload.ref
            }, windowId);
            const saved = setWindowUserPersonaOverride(payload.profile, windowId);
            if (saved !== undefined) {
                saveToast(true, "窗口人设已保存");
            } else {
                saveToast(false, "保存窗口人设失败");
            }
        });
        root.querySelector("[data-action='save-player-global']")?.addEventListener("click", () => {
            const payload = collectPlayerGlobalPayload(root);
            if (payload.name) setGlobalUserName(payload.name);
            if (payload.gender) setGlobalUserGender(payload.gender);
            if (payload.height) setGlobalUserHeight(payload.height);
            if (payload.ref) setGlobalUserRef(payload.ref);
            setGlobalUserPersona(payload.profile || "");
            saveToast(true, "全局人设已保存");
            renderSheet();
        });
        root.querySelector("[data-action='reset-player']")?.addEventListener("click", () => {
            const windowId = readWindowId();
            setWindowUserPersonaOverride("", windowId);
            setWindowUserIdentityOverride({ name: "", gender: "", height: "", ref: "" }, windowId);
            const textarea = root.querySelector("[data-player-field='window-profile']");
            if (textarea) textarea.value = "";
            saveToast(true, "已恢复全局人设");
            renderSheet();
        });
    }

    function collectRolePayload(root, card) {
        const fields = {
            id: card.id,
            name: card.name || "",
            sex: card.sex || "",
            aboSub: card.aboSub || "",
            species: card.species || "",
            worldTag: card.worldTag || "",
            worldLore: card.worldLore || "",
            appearance: card.appearance || "",
            personaStyle: card.personaStyle || "",
            publicProfile: card.publicProfile || "",
            bio: card.bio || "",
            height: card.height || "",
            replyRules: card.replyRules || "",
            background: card.background || "",
            family: card.family || "",
            aiProfile: card.aiProfile || "",
            personality: card.personality || "",
            opener: card.opener || "",
            storyline: card.storyline || "",
            dynamic: Array.isArray(card.dynamic) ? card.dynamic.slice() : []
        };
        root.querySelectorAll("[data-role-field]").forEach(el => {
            const key = el.dataset.roleField;
            if (!key) return;
            const raw = el.value || "";
            fields[key] = el.tagName === "TEXTAREA" ? raw.trim() : raw.trim();
        });
        fields.sex = fields.sex || "男";
        fields.species = fields.species || "人";
        return fields;
    }

    function collectPlayerPayload(root) {
        const profile = (root.querySelector("[data-player-field='window-profile']")?.value || "").trim();
        const name = (root.querySelector("[data-player-field='window-name']")?.value || "").trim();
        const genderRaw = (root.querySelector("[data-player-field='window-gender']")?.value || "").trim();
        const genderAbo = (root.querySelector("[data-player-field='window-abo-sub']")?.value || "").trim();
        const height = (root.querySelector("[data-player-field='window-height']")?.value || "").trim();
        const ref = (root.querySelector("[data-player-field='window-ref']")?.value || "").trim() || "你";
        const gender = genderRaw.toLowerCase() === "abo" ? `ABO-${genderAbo || "Alpha"}` : genderRaw;
        return {
            profile,
            name,
            gender,
            height,
            ref
        };
    }

    function collectPlayerGlobalPayload(root) {
        const profile = (root.querySelector("[data-player-field='global-profile']")?.value || "").trim();
        const name = (root.querySelector("[data-player-field='global-name']")?.value || "").trim();
        const genderRaw = (root.querySelector("[data-player-field='global-gender']")?.value || "").trim();
        const genderAbo = (root.querySelector("[data-player-field='global-abo-sub']")?.value || "").trim();
        const height = (root.querySelector("[data-player-field='global-height']")?.value || "").trim();
        const ref = (root.querySelector("[data-player-field='global-ref']")?.value || "").trim() || "你";
        const gender = genderRaw.toLowerCase() === "abo" ? `ABO-${genderAbo || "Alpha"}` : genderRaw;
        return {
            profile,
            name,
            gender,
            height,
            ref
        };
    }

    function updateSheetBounds() {
        const header = document.getElementById("story-header");
        const footer = document.getElementById("story-input-row");
        const top = header ? header.getBoundingClientRect().bottom + 8 : 12;
        const bottom = footer ? Math.max(12, window.innerHeight - footer.getBoundingClientRect().top + 12) : 12;
        sheetEl.style.setProperty("--sheet-top", `${Math.max(8, top)}px`);
        sheetEl.style.setProperty("--sheet-bottom", `${Math.max(10, bottom)}px`);
    }

    function withMemoryBusy(btn, task) {
        const target = btn || { disabled: false, textContent: "" };
        const prevLabel = target.textContent;
        target.disabled = true;
        target.textContent = "…";
        const run = async () => {
            try {
                await task();
            } finally {
                target.disabled = false;
                target.textContent = prevLabel;
            }
        };
        return run();
    }

    function readWindowId() {
        try {
            return getWindowId();
        } catch {
            return typeof window !== "undefined" ? (window.__YUAN_WINDOW_ID__ || window.__YUAN_SLOT__ || "win-default") : "win-default";
        }
    }

    function loadGlobalDefaults() {
        return {
            rules: getGlobalSystemRules()
        };
    }

    function show() {
        sheetEl.dataset.pos = normalizePos(sheetEl.dataset.pos || prefs.pos || "bottom");
        sheetEl.dataset.tab = normalizeTab(sheetEl.dataset.tab || prefs.tab || "role");
        sheetEl.removeAttribute("aria-hidden");
        sheetEl.inert = false;
        sheetEl.classList.add("open", "show");
        updateSheetBounds();
        renderSheet();
    }
    function hide() {
        if (sheetEl.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        sheetEl.inert = true;
        sheetEl.setAttribute("aria-hidden", "true");
        sheetEl.classList.remove("open", "show");
    }

    async function promptSetupPreference() {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.className = "setup-overlay";
            overlay.innerHTML = `
                <div class="setup-dialog">
                    <h4>补全设定</h4>
                    <p>用 1-2 句话描述补全偏好（可留空）。仅用于填补空白设定。</p>
                    <textarea rows="3" placeholder="冷感、都市、控制欲"></textarea>
                    <div class="dialog-actions">
                        <button type="button" data-act="cancel">取消</button>
                        <button type="button" class="primary" data-act="ok">补全</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector("textarea");
            const cleanUp = (value) => {
                overlay.remove();
                resolve(value);
            };
            overlay.addEventListener("click", (ev) => {
                if (ev.target === overlay) cleanUp(null);
            });
            overlay.querySelector("[data-act='cancel']")?.addEventListener("click", () => cleanUp(null));
            overlay.querySelector("[data-act='ok']")?.addEventListener("click", () => cleanUp((input?.value || "").trim()));
            input?.addEventListener("keydown", (ev) => {
                if (ev.key === "Escape") {
                    ev.preventDefault();
                    cleanUp(null);
                } else if (ev.key === "Enter" && ev.metaKey) {
                    ev.preventDefault();
                    cleanUp((input?.value || "").trim());
                }
            });
            setTimeout(() => input?.focus(), 30);
        });
    }

    let lastToggleAt = 0;
    const toggleSheet = () => {
        const now = Date.now();
        if (now - lastToggleAt < 160) return;
        lastToggleAt = now;
        if (sheetEl.classList.contains("open")) hide();
        else show();
    };

    headerTrigger.addEventListener("dblclick", toggleSheet);
    bindGentleDoubleTap(headerTrigger, toggleSheet);
    closeBtn?.addEventListener("click", hide);

    const storyPanel = document.getElementById("story-panel");
    storyPanel?.addEventListener("click", (ev) => {
        if (!sheetEl.classList.contains("open")) return;
        if (ev.target.closest("#character-sheet")) return;
        if (ev.target.closest("#story-header")) return;
        if (ev.target.closest("#story-input-row")) return;
        if (ev.target.closest(".story-tools-menu")) return;
        if (ev.target.closest(".story-bubble")) return;
        hide();
    }, true);

    window.addEventListener("resize", updateSheetBounds);
    window.addEventListener("orientationchange", updateSheetBounds);
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("character-cards:changed", renderSheet);
    }

    return { refresh: renderSheet, show, hide };
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(str = "") {
    return escapeHtml(str).replace(/"/g, "&quot;");
}

function renderLines(text = "", fallback = "") {
    return escapeHtml(text || fallback).replace(/\n/g, "<br>");
}
