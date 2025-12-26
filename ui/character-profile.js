import {
    getActiveCard,
    upsertCharacterCard,
    updateActiveCard,
    GENERIC_OPENER,
    GENERIC_BIO
} from "../data/character-cards.js";

const SHEET_POSITIONS = ["fullscreen", "top", "bottom"];
const PREF_KEY = "yuan-phone:character-sheet:prefs";
const WINDOW_RULE_PREFIX = "yuan-shell:winrules:";
const SHELL_STATE_KEY = "yuan-shell:state";

function normalizePos(pos) {
    return SHEET_POSITIONS.includes(pos) ? pos : "bottom";
}

function normalizeTab(tab) {
    if (tab === "role" || tab === "rules") return tab;
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

export function initCharacterProfile(triggerEl, sheetEl, options = {}) {
    if (!triggerEl || !sheetEl) return { refresh: () => {}, show: () => {}, hide: () => {} };
    const inner = sheetEl.querySelector(".sheet-inner") || sheetEl;
    sheetEl.classList.add("character-sheet");
    const closeBtn = sheetEl.querySelector("#character-sheet-close");
    const prefs = readPrefs();
    if (prefs.pos) sheetEl.dataset.pos = normalizePos(prefs.pos);
    if (prefs.tab) sheetEl.dataset.tab = normalizeTab(prefs.tab);

    function loadWindowRules(slotId) {
        if (!slotId || typeof window === "undefined" || !window.localStorage) return null;
        try {
            const raw = window.localStorage.getItem(`${WINDOW_RULE_PREFIX}${slotId}`);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function saveWindowRules(slotId, data) {
        if (!slotId || typeof window === "undefined" || !window.localStorage) return;
        try {
            window.localStorage.setItem(`${WINDOW_RULE_PREFIX}${slotId}`, JSON.stringify(data || {}));
        } catch {
            /* ignore */
        }
    }

    function renderSheet() {
        const active = getActiveCard();
        const tab = normalizeTab(sheetEl.dataset.tab || prefs.tab || "role");
        const pos = normalizePos(sheetEl.dataset.pos || prefs.pos || "bottom");
        sheetEl.dataset.pos = pos;
        sheetEl.dataset.tab = tab;
        writePrefs({ pos, tab });
        const headline = active.bio || active.persona || "写下简介、语气或开场感觉。";
        inner.innerHTML = `
            <div class="sheet-head combined">
                <div class="sheet-head-left">
                    <p class="sheet-kicker">角色档案</p>
                    <h3>${escapeHtml(active.name || "未命名角色")}</h3>
                    <p class="sheet-tagline">${escapeHtml(headline)}</p>
                </div>
                <div class="sheet-head-right">
                    <button id="character-sheet-close" type="button" aria-label="关闭">✕</button>
                </div>
            </div>
            <div class="sheet-tabs">
                <button class="tab-btn ${tab === "role" ? "active" : ""}" data-tab="role">角色</button>
                <button class="tab-btn ${tab === "rules" ? "active" : ""}" data-tab="rules">规则</button>
            </div>
            <div class="sheet-body" data-active-tab="${tab}">
                ${tab === "rules" ? renderRules(active) : renderRole(active)}
            </div>
        `;
        wireInteractions(inner, active);
    }

    function renderRole(card) {
        const personaText = card.persona || "用一句话写下他的语气、危险感或温度。";
        const worldText = card.worldLore || "补充他的舞台、势力或环境。";
        const storylineText = card.storyline || "";
        const bioText = card.bio || GENERIC_BIO;
        const openerText = card.opener || GENERIC_OPENER;
        const profileText = card.profile || "";
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card">
                    <div class="card-head">角色</div>
                    <div class="card-form grid-two slim">
                        <label>角色名称
                            <input type="text" data-field="name" value="${escapeAttr(card.name || "")}" placeholder="写下角色名或称呼">
                        </label>
                        <label>简介
                            <input type="text" data-field="bio" value="${escapeAttr(bioText)}" placeholder="这一段是简介">
                        </label>
                        <label>开场白
                            <textarea data-field="opener" rows="3" placeholder="这是默认开场白">${escapeHtml(openerText)}</textarea>
                        </label>
                        <label>Persona / 语气
                            <textarea data-field="persona" rows="3" placeholder="压迫、温柔、节奏、口癖">${escapeHtml(personaText)}</textarea>
                        </label>
                        <label>角色人设
                            <textarea data-field="profile" rows="3" placeholder="他是谁，他怎么看你">${escapeHtml(profileText)}</textarea>
                        </label>
                        <label>世界观 / 舞台
                            <textarea data-field="worldLore" rows="3" placeholder="背景、势力、环境、关系网">${escapeHtml(worldText)}</textarea>
                        </label>
                        <label>故事线
                            <textarea data-field="storyline" rows="3" placeholder="主线节点、冲突与走向">${escapeHtml(storylineText)}</textarea>
                        </label>
                    </div>
                </div>
                <div class="info-card soft">
                    <div class="card-head">浮层位置</div>
                    <p class="card-note">全屏撑满（除标题/输入区），或置顶/底部悬浮。</p>
                    <div class="pos-grid">
                        ${SHEET_POSITIONS.map(pos => `
                            <button data-pos="${pos}" class="pos-btn ${sheetEl.dataset.pos === pos ? "active" : ""}">${labelPos(pos)}</button>
                        `).join("")}
                    </div>
                    <div class="card-actions inline">
                        <button class="primary" data-action="save">保存</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderRules(card) {
        const slotId = typeof window !== "undefined" ? window.__YUAN_SLOT__ || "default" : "default";
        const winRule = loadWindowRules(slotId) || {};
        const globalDefaults = loadGlobalDefaults();
        const personaText = winRule.persona ?? card.persona ?? "";
        const rulesText = winRule.rules ?? globalDefaults.rules ?? card.rules ?? "";
        const myProfile = winRule.profile ?? globalDefaults.profile ?? "";
        return `
            <div class="sheet-grid edit-grid">
                <div class="info-card">
                    <div class="card-head">窗口规则</div>
                    <div class="card-form slim">
                        <div class="global-rule-box">
                            <div class="card-head small">全局规则</div>
                            <p class="global-rule-text">${renderLines(globalDefaults.profile || globalDefaults.rules || "暂无全局规则，可在首页设置。")}</p>
                            <div class="card-actions inline">
                                <button class="ghost" data-action="import-global" ${(globalDefaults.rules || globalDefaults.profile) ? "" : "disabled"}>导入全局规则</button>
                            </div>
                        </div>
                        <label>当前窗口规则
                            <textarea data-field="win-rules" rows="5" placeholder="此窗口限定规则，默认继承角色规则">${escapeHtml(rulesText)}</textarea>
                        </label>
                        <label>我的人设
                            <textarea data-field="win-profile" rows="4" placeholder="为自己写一段人设或设定">${escapeHtml(myProfile)}</textarea>
                        </label>
                        <label>Persona（继承可改）
                            <textarea data-field="win-persona" rows="3" placeholder="语气、节奏、口癖">${escapeHtml(personaText)}</textarea>
                        </label>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save-win">保存窗口规则</button>
                        </div>
                        <p class="rule-hint">仅作用于此聊天窗口，默认载入全局规则，可随时覆盖。</p>
                    </div>
                </div>
            </div>
        `;
    }

    function wireInteractions(root, card) {
        root.querySelectorAll(".tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.tab;
                sheetEl.dataset.tab = tab;
                writePrefs({ tab });
                renderSheet();
            });
        });

        root.querySelectorAll(".pos-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const pos = btn.dataset.pos;
                sheetEl.dataset.pos = normalizePos(pos);
                writePrefs({ pos: sheetEl.dataset.pos });
                renderSheet();
            });
        });

        const saveBtn = root.querySelector("[data-action='save']");
        saveBtn?.addEventListener("click", () => {
            const payload = collectForm(root, card);
            const updated = updateActiveCard({ ...card, ...payload, updatedAt: Date.now() });
            options.onRoleUpdate?.(updated);
            try {
                window.parent?.postMessage({ type: "role-updated", role: updated }, "*");
            } catch {
                /* ignore cross-frame errors */
            }
            try {
                window.dispatchEvent(new CustomEvent("role:updated", { detail: updated }));
            } catch {
                // ignore
            }
            renderSheet();
        });

        const saveWinBtn = root.querySelector("[data-action='save-win']");
        saveWinBtn?.addEventListener("click", () => {
            const slotId = typeof window !== "undefined" ? window.__YUAN_SLOT__ || "default" : "default";
            const rules = root.querySelector("[data-field='win-rules']")?.value || "";
            const profile = root.querySelector("[data-field='win-profile']")?.value || "";
            const persona = root.querySelector("[data-field='win-persona']")?.value || "";
            saveWindowRules(slotId, { rules, profile, persona });
            renderSheet();
        });

        root.querySelector("[data-action='import-global']")?.addEventListener("click", () => {
            const defaults = loadGlobalDefaults();
            const rulesEl = root.querySelector("[data-field='win-rules']");
            const profileEl = root.querySelector("[data-field='win-profile']");
            if (rulesEl && defaults.rules) rulesEl.value = defaults.rules;
            if (profileEl && defaults.profile) profileEl.value = defaults.profile;
        });

        const close = root.querySelector("#character-sheet-close");
        close?.addEventListener("click", hide);
    }

    function collectForm(root, card) {
        const fields = { id: card.id };
        root.querySelectorAll("[data-field]").forEach(el => {
            const key = el.dataset.field;
            if (key === "dynamic") {
                fields.dynamic = (el.value || "").split("\n").map(s => s.trim()).filter(Boolean);
            } else {
                fields[key] = el.value;
            }
        });
        return fields;
    }

    function updateSheetBounds() {
        const header = document.getElementById("story-header");
        const footer = document.getElementById("story-input-row");
        const top = header ? header.getBoundingClientRect().bottom + 8 : 12;
        const bottom = footer ? Math.max(12, window.innerHeight - footer.getBoundingClientRect().top + 12) : 12;
        sheetEl.style.setProperty("--sheet-top", `${Math.max(8, top)}px`);
        sheetEl.style.setProperty("--sheet-bottom", `${Math.max(10, bottom)}px`);
    }

    function labelPos(pos) {
        if (pos === "fullscreen") return "全屏";
        if (pos === "top") return "置顶";
        return "底部";
    }

function formatTime(ts) {
    if (!ts) return "未知时间";
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function loadGlobalDefaults() {
    if (typeof window === "undefined" || !window.localStorage) return {};
    try {
        const raw = window.localStorage.getItem(SHELL_STATE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const user = parsed?.user || {};
        return {
            rules: user.globalRules || "",
            profile: user.globalProfile || user.profile || ""
        };
    } catch {
        return {};
    }
}

    function show() {
        sheetEl.dataset.pos = normalizePos(sheetEl.dataset.pos || prefs.pos || "bottom");
        sheetEl.dataset.tab = normalizeTab(sheetEl.dataset.tab || prefs.tab || "role");
        sheetEl.removeAttribute("aria-hidden");
        sheetEl.classList.add("open", "show");
        updateSheetBounds();
        renderSheet();
    }
    function hide() {
        sheetEl.setAttribute("aria-hidden", "true");
        sheetEl.classList.remove("open", "show");
    }

    triggerEl.addEventListener("dblclick", () => {
        if (sheetEl.classList.contains("open")) hide();
        else show();
    });
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

function renderOpener(text = "") {
    return escapeHtml(text || GENERIC_OPENER).replace(/\n/g, "<br>");
}

function renderLines(text = "", fallback = "") {
    return escapeHtml(text || fallback).replace(/\n/g, "<br>");
}
