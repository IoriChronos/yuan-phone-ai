import { getState, addRole, updateRole, addWindow } from "../state.js";
import { navigateTo } from "./nav.js";

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
    const form = document.createElement("div");
    form.className = "role-detail-form";
    form.innerHTML = `
        <div class="role-detail-head">
            <button class="ghost" data-act="back">← 返回</button>
            <div>
                <p class="roles-kicker">${isNew ? "新建" : "编辑"}角色</p>
                <h2>${isNew ? "未命名角色" : role.name}</h2>
            </div>
        </div>
        <label>角色名称
            <input type="text" data-field="name" placeholder="角色名称" value="${escapeAttr(role.name || "")}">
        </label>
        <label>简介
            <input type="text" data-field="bio" placeholder="一句话简介" value="${escapeAttr(role.bio || "")}">
        </label>
        <label>开场白
            <textarea rows="3" data-field="opener" placeholder="首次进入窗口时的开场语">${escapeHtml(role.opener || "")}</textarea>
        </label>
        <label>Persona
            <textarea rows="3" data-field="persona" placeholder="语气、节奏、口癖">${escapeHtml(role.persona || "")}</textarea>
        </label>
        <label>世界观
            <textarea rows="3" data-field="worldview" placeholder="舞台、势力、环境">${escapeHtml(role.worldview || "")}</textarea>
        </label>
        <label>故事线
            <textarea rows="3" data-field="storyline" placeholder="主线节点、冲突与走向">${escapeHtml(role.storyline || "")}</textarea>
        </label>
        <div class="role-detail-actions">
            <button class="ghost" data-act="back">取消</button>
            <button class="primary" data-act="save">保存</button>
        </div>
    `;
    root.appendChild(form);

    const goBack = () => navigateTo("#/roles");
    form.querySelectorAll("[data-act='back']").forEach(btn => btn.addEventListener("click", goBack));
    form.querySelector("[data-act='save']")?.addEventListener("click", () => {
        const payload = collectForm(form);
        if (!payload.name) return;
        if (isNew) {
            const created = addRole(payload);
            addWindow(created.id, "主线");
        } else {
            updateRole(roleId, payload);
        }
        goBack();
    });
    return { unmount() {} };
}

function collectForm(root) {
    const payload = {};
    root.querySelectorAll("[data-field]").forEach(el => {
        const key = el.dataset.field;
        if (el.tagName === "TEXTAREA") {
            payload[key] = el.value || "";
        } else {
            payload[key] = el.value || "";
        }
    });
    payload.name = (payload.name || "").trim();
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
