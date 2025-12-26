import { getState, removeRole } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderRoles(root) {
    root.innerHTML = "";
    root.className = "roles-page";
    const state = getState();
    const head = document.createElement("div");
    head.className = "roles-head";
    head.innerHTML = `
        <div>
            <p class="roles-kicker">角色</p>
            <h2>角色管理</h2>
        </div>
        <button class="primary" data-act="new">新建角色</button>
    `;
    const list = document.createElement("div");
    list.className = "role-list";
    list.innerHTML = state.roles.length ? state.roles.map(role => `
        <div class="role-card" data-role="${role.id}">
            <div class="role-head">
                <div class="role-head-text">
                    <span class="role-name">${role.name}</span>
                    <p class="role-meta">${role.persona || role.bio || "未设定"}</p>
                </div>
                <div class="role-actions">
                    <button class="ghost" data-edit="${role.id}">编辑</button>
                    <button class="ghost" data-del="${role.id}" ${role.id === "r-default" ? "disabled" : ""}>删除</button>
                </div>
            </div>
            <p class="role-bio">${role.worldview || role.bio || "暂无简介"}</p>
        </div>
    `).join("") : `<p class="empty">暂无角色，先去新建一个。</p>`;
    const modal = buildConfirmModal();
    root.append(head);
    root.append(list);
    root.append(modal);

    head.querySelector("[data-act='new']")?.addEventListener("click", () => navigateTo("#/role/new"));
    list.querySelectorAll("[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => navigateTo(`#/role/${btn.dataset.edit}`));
    });
    list.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.disabled) return;
            const roleId = btn.dataset.del;
            const roleName = state.roles.find(r => r.id === roleId)?.name || "该角色";
            openConfirmModal(modal, roleId, roleName, () => {
                removeRole(roleId);
                renderRoles(root);
            });
        });
    });
    return { unmount() {} };
}

function buildConfirmModal() {
    const wrap = document.createElement("div");
    wrap.className = "role-confirm";
    wrap.innerHTML = `
        <div class="role-confirm-mask" data-close="1"></div>
        <div class="role-confirm-panel">
            <h3>确认删除</h3>
            <p class="role-confirm-text"></p>
            <div class="role-confirm-actions">
                <button class="ghost" data-close="1">取消</button>
                <button class="primary" data-act="confirm">删除</button>
            </div>
        </div>
    `;
    wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => wrap.classList.remove("show")));
    return wrap;
}

function openConfirmModal(modal, roleId, roleName, onConfirm) {
    const text = modal.querySelector(".role-confirm-text");
    if (text) text.textContent = `确定删除「${roleName}」吗？该角色的窗口也会被清理。`;
    modal.classList.add("show");
    const confirmBtn = modal.querySelector("[data-act='confirm']");
    if (!confirmBtn) return;
    confirmBtn.onclick = () => {
        onConfirm?.();
        modal.classList.remove("show");
        confirmBtn.onclick = null;
    };
}
