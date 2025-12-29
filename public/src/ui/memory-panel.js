import {
    getSTM,
    setSTM,
    getLTM,
    setLTM,
    getPersonaMemoryText,
    setPersonaMemoryText
} from "../data/window-memory.js";
import {
    regenerateSTMViaAI,
    consolidateLTMViaAI
} from "../core/memory-engine.js";
import { getWindowId } from "../core/window-context.js";

export function initMemoryPanel() {
    let panel = document.getElementById("memory-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "memory-panel";
        panel.className = "character-sheet open ui-modal-backdrop";
        panel.dataset.pos = "fullscreen";
        panel.innerHTML = buildMarkup();
        document.body.appendChild(panel);
    }
    const closeBtn = panel.querySelector("[data-close]");
    closeBtn?.addEventListener("click", hide);
    wire(panel);
    refresh(panel);
    hide();
    return {
        show: () => { panel.classList.add("open"); panel.style.display = "block"; refresh(panel); },
        hide,
        refresh: () => refresh(panel)
    };
}

function buildMarkup() {
    return `
    <div class="ui-modal">
        <header class="sheet-head combined ui-modal-header">
            <div class="sheet-head-left">
                <p class="sheet-kicker">Memory</p>
                <h3>窗口记忆</h3>
                <p class="sheet-tagline">STM / LTM / Persona · Window Scoped</p>
            </div>
            <div class="sheet-head-right">
                <button type="button" data-close aria-label="关闭">✕</button>
            </div>
        </header>
        <section class="sheet-body ui-modal-body" data-active-tab="role">
            <div class="sheet-grid edit-grid">
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Short Memory (STM)</header>
                    <section class="card-form slim ui-panel-body">
                        <textarea data-field="stm" rows="6" placeholder="AI 概括的近期记忆（可编辑）"></textarea>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save-stm">保存</button>
                            <button class="ghost" data-action="regen-stm">Regenerate STM</button>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Long Memory (LTM)</header>
                    <section class="card-form slim ui-panel-body">
                        <textarea data-field="ltm" rows="6" placeholder="长期记忆（世界/事件）"></textarea>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save-ltm">保存</button>
                            <button class="ghost" data-action="regen-ltm">Consolidate from STM</button>
                        </div>
                    </section>
                </div>
                <div class="info-card ui-panel">
                    <header class="card-head ui-panel-header">Persona Memory</header>
                    <section class="card-form slim ui-panel-body">
                        <textarea data-field="persona" rows="5" placeholder="AI 对用户/角色的理解"></textarea>
                        <div class="card-actions inline">
                            <button class="primary" data-action="save-persona">保存</button>
                        </div>
                    </section>
                </div>
            </div>
        </section>
        <footer class="ui-modal-footer"></footer>
    </div>
    `;
}

function wire(panel) {
    const stmField = panel.querySelector("[data-field='stm']");
    const ltmField = panel.querySelector("[data-field='ltm']");
    const personaField = panel.querySelector("[data-field='persona']");
    panel.querySelector("[data-action='save-stm']")?.addEventListener("click", () => {
        setSTM(stmField?.value || "", getWindowId());
    });
    panel.querySelector("[data-action='save-ltm']")?.addEventListener("click", () => {
        setLTM(ltmField?.value || "", getWindowId());
    });
    panel.querySelector("[data-action='save-persona']")?.addEventListener("click", () => {
        setPersonaMemoryText(personaField?.value || "", getWindowId());
    });
    panel.querySelector("[data-action='regen-stm']")?.addEventListener("click", async () => {
        const next = await regenerateSTMViaAI(getWindowId());
        if (stmField) stmField.value = next;
    });
    panel.querySelector("[data-action='regen-ltm']")?.addEventListener("click", async () => {
        const next = await consolidateLTMViaAI(getWindowId());
        if (ltmField) ltmField.value = next.ltm || "";
        if (personaField && next.persona) personaField.value = next.persona;
    });
}

function refresh(panel) {
    if (!panel) return;
    const scoped = getWindowId();
    const stmField = panel.querySelector("[data-field='stm']");
    const ltmField = panel.querySelector("[data-field='ltm']");
    const personaField = panel.querySelector("[data-field='persona']");
    if (stmField) stmField.value = getSTM(scoped) || "";
    if (ltmField) ltmField.value = getLTM(scoped) || "";
    if (personaField) personaField.value = getPersonaMemoryText(scoped) || "";
}

function hide() {
    const panel = document.getElementById("memory-panel");
    if (!panel) return;
    panel.classList.remove("open");
    panel.style.display = "none";
}
