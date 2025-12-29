import { getState, removeRole, addWindow } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderRoles(root) {
    root.innerHTML = "";
    root.className = "roles-page";
    const state = getState();
    const head = document.createElement("div");
    head.className = "roles-head ui-page-header";
    head.innerHTML = `
        <div class="ui-page-title">
            <p class="roles-kicker">角色</p>
            <h2>角色管理</h2>
        </div>
        <div class="ui-page-actions">
            <button class="primary" data-act="new">新建角色</button>
        </div>
    `;
    const list = document.createElement("div");
    list.className = "role-list";
    list.innerHTML = state.roles.length ? state.roles.map(role => `
        <div class="role-card ui-panel" data-role="${role.id}">
            <header class="role-head ui-panel-header">
                <div class="role-head-text">
                    <span class="role-name">${role.name}</span>
                    <p class="role-meta">${role.personaStyle || role.persona || role.publicProfile || "未设定"}</p>
                </div>
                <div class="role-actions">
                    <button class="ghost" data-edit="${role.id}">编辑</button>
                    <button class="ghost" data-del="${role.id}" ${role.id === "r-default" ? "disabled" : ""}>删除</button>
                </div>
            </header>
            <section class="ui-panel-body">
                <p class="role-bio">${role.background || role.worldview || role.publicProfile || "暂无简介"}</p>
            </section>
        </div>
    `).join("") : `<p class="empty">暂无角色，先去新建一个。</p>`;
    const modal = buildConfirmModal();
    root.append(head);
    root.append(list);
    root.append(modal);

    head.querySelector("[data-act='new']")?.addEventListener("click", () => navigateTo("#/role/new"));
    list.querySelectorAll(".role-card").forEach(card => {
        card.addEventListener("click", (ev) => {
            if (ev.target.closest(".role-actions") || ev.target.closest("button")) return;
            const roleId = card.dataset.role;
            if (!roleId) return;
            openOrCreateLatestWindow(roleId);
        });
    });
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
    wrap.className = "role-confirm ui-modal-backdrop";
    wrap.innerHTML = `
        <div class="role-confirm-panel ui-modal">
            <header class="ui-modal-header">
                <h3>确认删除</h3>
            </header>
            <section class="ui-modal-body">
                <p class="role-confirm-text"></p>
            </section>
            <footer class="role-confirm-actions ui-modal-footer">
                <button class="ghost" data-close="1">取消</button>
                <button class="primary" data-act="confirm">删除</button>
            </footer>
        </div>
    `;
    wrap.addEventListener("click", (ev) => {
        if (ev.target === wrap) wrap.classList.remove("show");
    });
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

function openOrCreateLatestWindow(roleId) {
    const state = getState();
    const windows = state.windows.filter(w => w.roleId === roleId);
    let target = null;
    if (windows.length) {
        target = windows.reduce((prev, curr) => {
            const prevTime = prev?.updatedAt || 0;
            const currTime = curr?.updatedAt || 0;
            return currTime > prevTime ? curr : prev;
        }, windows[0]);
    } else {
        const count = state.windows.filter(w => w.roleId === roleId).length + 1;
        target = addWindow(roleId, `窗口 ${count}`);
    }
    if (target?.id) navigateTo(`#/chat/${roleId}/${target.id}`);
}
