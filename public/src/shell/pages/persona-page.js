import { getState, updateState } from "../state.js";
import { navigateTo } from "./nav.js";
import { saveToast } from "../../core/save-feedback.js";

const GENDER_OPTIONS = ["男", "女", "双性", "无性别", "ABO"];

export function renderPersonaPage(root) {
    root.innerHTML = "";
    root.className = "persona-page";
    const user = getState().user || {};
    const genderValue = (user.gender || "男").toLowerCase();
    const height = user.height || "";
    root.innerHTML = `
        <div class="persona-head ui-page-header">
            <div class="ui-page-title">
                <p class="roles-kicker">玩家</p>
                <h2>我的人设</h2>
                <p class="persona-sub">名称和人设会作为 Prompt 注入，默认性别为男，可选无性别。</p>
            </div>
            <div class="persona-head-actions ui-page-actions">
                <button class="ghost" data-act="back">返回</button>
            </div>
        </div>
        <div class="persona-grid">
            <div class="persona-card ui-panel">
                <header class="persona-card-head ui-panel-header">基础信息</header>
                <section class="ui-panel-body">
                    <div class="persona-form grid-two">
                        <label>名称 <span class="required">*</span>
                            <input type="text" data-field="name" placeholder="写下你的名字" value="${escapeAttr(user.name || "")}">
                        </label>
                        <label>性别
                            <select data-field="gender" class="pill-select">
                                ${GENDER_OPTIONS.map(option => {
                                    const val = option.toLowerCase();
                                    const label = option === "ABO" ? "ABO" : option;
                                    const selected = genderValue === val ? "selected" : "";
                                    return `<option value="${label}" ${selected}>${label}</option>`;
                                }).join("")}
                            </select>
                        </label>
                        <label>身高
                            <input type="text" data-field="height" placeholder="180 cm / 5'11\\\"（可留空）" value="${escapeAttr(height)}">
                        </label>
                    </div>
                </section>
            </div>
            <div class="persona-card ui-panel">
                <header class="persona-card-head ui-panel-header">玩家人设 / Prompt</header>
                <section class="ui-panel-body">
                    <p class="persona-note">仅注入 AI，不会展示给角色。留空则仅使用你的名称与性别。</p>
                    <textarea rows="6" data-field="profile" placeholder="写下你的身份、语气或目标">${escapeHtml(user.globalProfile || "")}</textarea>
                </section>
            </div>
        </div>
        <div class="persona-actions">
            <span class="save-hint" data-required style="display:none;">必填项未完成</span>
            <button class="ghost" data-act="back">取消</button>
            <button class="primary" data-act="save">保存</button>
        </div>
    `;
    const nameInput = root.querySelector("[data-field='name']");
    const genderSelect = root.querySelector("[data-field='gender']");
    const profileField = root.querySelector("[data-field='profile']");
    const heightField = root.querySelector("[data-field='height']");
    const requiredHint = root.querySelector("[data-required]");
    const saveBtn = root.querySelector("[data-act='save']");
    const goBack = () => navigateTo("#/home");

    const validate = () => {
        const ok = Boolean((nameInput?.value || "").trim());
        if (saveBtn) saveBtn.disabled = !ok;
        if (requiredHint) requiredHint.style.display = ok ? "none" : "inline-flex";
        return ok;
    };
    nameInput?.addEventListener("input", validate);
    validate();

    root.querySelectorAll("[data-act='back']").forEach(btn => {
        btn.addEventListener("click", goBack);
    });

    saveBtn?.addEventListener("click", () => {
        if (!validate()) return;
        const current = getState().user || {};
        const name = nameInput?.value?.trim() || "玩家";
        const gender = (genderSelect?.value || "男").trim();
        const profile = profileField?.value || "";
        const playerHeight = heightField?.value || "";
        updateState({
            user: {
                ...current,
                name,
                gender,
                height: playerHeight,
                globalProfile: profile
            }
        });
        saveToast(true, "玩家人设已保存");
        goBack();
    });

    return { unmount() {} };
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
