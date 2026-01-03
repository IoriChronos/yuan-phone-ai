import { getState, addRole, updateRole, addWindow } from "../state.js";
import { navigateTo } from "./nav.js";
import { saveToast } from "../../core/save-feedback.js";
import { runSetupAssistant } from "../../core/ai.js";

const GENDER_OPTIONS = ["男", "女", "双性", "无性别"];
const ABO_SUB_OPTIONS = [
    { value: "", label: "无（不使用 ABO，留空即可）" },
    { value: "Alpha", label: "Alpha" },
    { value: "Beta", label: "Beta" },
    { value: "Omega", label: "Omega" },
    { value: "Enigma", label: "Enigma" },
    { value: "背景补充", label: "背景补充" }
]; 

export function renderRoleDetail(root, params) {
    root.innerHTML = "";
    root.className = "role-detail-page";

    const [, id] = params.parts || [];
    const roleId = id || "";
    const isNew = !roleId || roleId === "new";

    const state = getState();
    const role = isNew ? {} : state.roles.find(r => r.id === roleId);

    if (!role && !isNew) {
        root.innerHTML = `<p class="empty">未找到角色。</p>`;
        return { unmount() {} };
    }

    const sexValue = (role?.sex || "男").toLowerCase();

    const form = document.createElement("div");
    form.className = "role-detail-form";

    form.innerHTML = `
        <div class="role-detail-shell">

            <div class="role-detail-head ui-page-header">
                <div class="ui-page-title">
                    <p class="roles-kicker">${isNew ? "新建" : "编辑"}角色</p>
                    <h2>${isNew ? "未命名角色" : escapeHtml(role.name || "未命名角色")}</h2>
                </div>
                <div class="ui-page-actions">
                    <button class="ghost" data-act="back">← 返回</button>
                </div>
            </div>

            <div class="role-detail-grid">

                <!-- ===== AI 会读入 ===== -->
                <section class="role-card ui-panel">
                    <header class="role-card-head ui-panel-header">
                        <div>
                            <p class="roles-kicker">AI 会读入</p>
                            <h3>角色设定</h3>
                        </div>
                        <span class="role-chip">PROMPT</span>
                    </header>

                    <section class="role-card-body ui-panel-body">
                        <p class="role-card-note">
                            ✔ 以下字段每轮注入 Narrator Prompt<br>
                            🔒 标记为锁定的字段辅助 AI 不会修改
                        </p>

                        <div class="role-field-grid grid-two">

                            <label>角色名称 <span class="required">*</span>
                                <input type="text"
                                       data-role-field="name"
                                       placeholder="角色名称"
                                       value="${escapeAttr(role.name || "")}">
                            </label>

                        <label>性别 <span class="required">*</span>
                            <select data-role-field="sex" class="pill-select">
                                ${GENDER_OPTIONS.map(option => {
                                    const val = option.toLowerCase();
                                    const label = option;
                                    const selected = (role.sex || "男").toLowerCase() === val ? "selected" : "";
                                    return `<option value="${label}" ${selected}>${label}</option>`;
                                }).join("")}
                            </select>
                        </label>

                        <label>ABO 分化
                            <select data-role-field="aboSub" class="pill-select">
                                ${ABO_SUB_OPTIONS.map(opt => {
                                    const selected =
                                        (role.aboSub || "").toLowerCase() === opt.toLowerCase()
                                            ? "selected"
                                            : "";
                                    return `<option value="${opt}" ${selected}>${opt}</option>`;
                                }).join("")}
                            </select>
                        </label>

                            <label>种族 / 形态 <span class="required">*</span>
                                <input type="text"
                                       data-role-field="species"
                                       placeholder="物种，种族都可以"
                                       value="${escapeAttr(role.species || "")}">
                            </label>

                            <label>身高
                                <input type="text"
                                       data-role-field="height"
                                       placeholder="180 cm / 5'11\\\""
                                       value="${escapeAttr(role.height || "")}">
                            </label>

                            <label>世界标签
                                <input type="text"
                                       data-role-field="worldTag"
                                       placeholder="现代都市 / 末日"
                                       value="${escapeAttr(role.worldTag || "")}">
                            </label>

                            <label>世界背景
                                <textarea rows="2"
                                          data-role-field="worldLore"
                                          placeholder="世界观、规则">${escapeHtml(role.worldLore || "")}</textarea>
                            </label>

                            <label>角色背景 / 过往
                                <textarea rows="2"
                                          data-role-field="background"
                                          placeholder="经历、立场、已发生事件">${escapeHtml(role.background || "")}</textarea>
                            </label>

                            <label>故事线 / 引导
                                <textarea rows="2"
                                          data-role-field="storyline"
                                          placeholder="长期目标、剧情提醒">${escapeHtml(role.storyline || "")}</textarea>
                            </label>

                            <label>Persona / 语气
                                <small class="field-note gold">AI 强读取</small>
                                <textarea rows="3"
                                          data-role-field="personaStyle"
                                          placeholder="节奏、压迫感、温度、口癖">${escapeHtml(role.personaStyle || "")}</textarea>
                            </label>

                            <label>外貌
                                <textarea rows="2"
                                          data-role-field="appearance"
                                          placeholder="身形、衣着、辨识点">${escapeHtml(role.appearance || "")}</textarea>
                            </label>

                        </div>

                        <div class="role-card-actions">
                            <button class="ghost" data-act="setup-fill">补全设定</button>
                        </div>
                    </section>
                </section>

                <!-- ===== 仅展示给玩家 ===== -->
                <section class="role-card ui-panel">
                    <header class="role-card-head ui-panel-header">
                        <div>
                            <p class="roles-kicker">仅展示给玩家</p>
                            <h3>简介与备注</h3>
                        </div>
                        <span class="role-chip ghost-chip">VIEW</span>
                    </header>

                    <section class="role-card-body ui-panel-body">
                        <p class="role-card-note">✘ 不会注入 Prompt，仅用于界面展示</p>

                        <div class="role-field-grid">
                            <label>简介（展示）
                                <input type="text"
                                       data-role-field="publicProfile"
                                       placeholder="这一段只给玩家看"
                                       value="${escapeAttr(role.publicProfile || role.bio || "")}">
                            </label>

                            <label>标签 / 备注
                                <textarea rows="2"
                                          data-role-field="bio"
                                          placeholder="标签、备注、彩蛋">${escapeHtml(role.bio || "")}</textarea>
                            </label>
                        </div>
                    </section>
                </section>

            </div>

            <div class="role-detail-actions">
                <span class="role-required-hint" data-required-hint style="display:none;">请补齐必填项</span>
                <button class="ghost" data-act="back">取消</button>
                <button class="primary" data-act="save">保存</button>
            </div>

        </div>
    `;

    root.appendChild(form);

    
    /* ===== 事件逻辑（原样保留） ===== */

    const goBack = () => navigateTo("#/roles");

    form.querySelectorAll("[data-act='back']").forEach(btn =>
        btn.addEventListener("click", ev => {
            ev.preventDefault();
            goBack();
        })
    );

    const requiredHint = form.querySelector("[data-required-hint]");
    const saveBtn = form.querySelector("[data-act='save']");
    const nameField = form.querySelector("[data-role-field='name']");
    const sexField = form.querySelector("[data-role-field='sex']");
    const speciesField = form.querySelector("[data-role-field='species']");

    const validateRequired = () => {
        const ok =
            Boolean((nameField?.value || "").trim()) &&
            Boolean((sexField?.value || "").trim()) &&
            Boolean((speciesField?.value || "").trim());

        if (saveBtn) saveBtn.disabled = !ok;
        if (requiredHint) requiredHint.style.display = ok ? "none" : "inline-flex";
    };

    nameField?.addEventListener("input", validateRequired);
    sexField?.addEventListener("change", validateRequired);
    speciesField?.addEventListener("input", validateRequired);
    validateRequired();

    form.querySelector("[data-act='setup-fill']")?.addEventListener("click", async () => {
        const preference = await promptSetupPreference();
        if (preference === null) return;

        const payload = collectRolePayload(form, role || {});
        const baseCard = { ...role, ...payload };

        try {
            const result = await runSetupAssistant(baseCard, preference);
            if (!result || !Object.keys(result).length) {
                saveToast(false, "没有可补全的字段");
                return;
            }

            Object.entries(result).forEach(([key, val]) => {
                if (!baseCard[key] && typeof val === "string" && val.trim()) {
                    baseCard[key] = val.trim();
                    const el = form.querySelector(`[data-role-field='${key}']`);
                    if (el) el.value = val.trim();
                }
            });

            if (!isNew) {
                updateRole(roleId, baseCard);
                saveToast(true, "设定已补全并保存");
            } else {
                saveToast(true, "设定已补全，记得保存角色");
            }

        } catch (err) {
            console.error("[SetupAssistant] role detail failed", err);
            saveToast(false, "补全失败");
        }
    });

    form.querySelector("[data-act='save']")?.addEventListener("click", () => {
        const payload = collectRolePayload(form, role || {});
        if (!payload.name || !payload.sex || !payload.species) {
            validateRequired();
            return;
        }

        try {
            if (isNew) {
                const created = addRole(payload);
                addWindow(created.id, "主线");
                saveToast(true, "角色已创建");
            } else {
                updateRole(roleId, payload);
                saveToast(true, "角色已保存");
            }
            goBack();
        } catch (err) {
            console.error("角色保存失败", err);
            saveToast(false, "角色保存失败");
        }
    });

    return { unmount() {} };
}

function collectRolePayload(root, existing = {}) {
    const payload = {
        aboSub: "",
        appearance: existing.appearance || "",
        background: existing.background || "",
        bio: existing.bio || "",
        family: existing.family || "",
        height: existing.height || "",
        name: existing.name || "",
        personaStyle: existing.personaStyle || "",
        publicProfile: existing.publicProfile || "",
        sex: existing.sex || "",
        species: existing.species || "",
        worldLore: existing.worldLore || "",
        worldTag: existing.worldTag || "",
        replyRules: existing.replyRules || "",
        aiProfile: "",
        personality: existing.personality || "",
        opener: existing.opener || "",
        dynamic: Array.isArray(existing.dynamic) ? existing.dynamic.slice() : []
    };
    root.querySelectorAll("[data-role-field]").forEach(el => {
        const key = el.dataset.roleField;
        if (!key) return;
        const value = (el.value || "").trim();
        payload[key] = value;
    });
    payload.sex = payload.sex || "男";
    payload.species = payload.species || "人";
    return payload;
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

function promptSetupPreference() {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "setup-overlay ui-modal-backdrop";
        overlay.innerHTML = `
            <div class="setup-dialog ui-modal">
                <header class="ui-modal-header">
                    <h4>补全设定</h4>
                </header>
                <section class="ui-modal-body">
                    <p>用 1-2 句话描述补全偏好（可留空）。仅用于填补空白设定。</p>
                    <textarea rows="3" placeholder="冷感、都市、控制欲"></textarea>
                </section>
                <footer class="dialog-actions ui-modal-footer">
                    <button type="button" data-act="cancel">取消</button>
                    <button type="button" class="primary" data-act="ok">补全</button>
                </footer>
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
