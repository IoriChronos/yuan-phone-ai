import { getState, deleteWindow, updateWindow } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderMessages(root) {
    root.innerHTML = "";
    root.className = "messages-page";
    const state = getState();
    const list = document.createElement("div");
    list.className = "msg-list";
    if (!state.windows.length) {
        list.innerHTML = `<p class="empty">还没有窗口，在聊天工具里新建一个吧。</p>`;
    } else {
        list.innerHTML = state.windows.map(win => {
            const role = state.roles.find(r => r.id === win.roleId);
            return `
                <div class="msg-card" data-win="${win.id}" data-role="${win.roleId}">
                    <div class="msg-head">
                        <div class="msg-role">
                            <span class="msg-role-name">${role?.name || "角色"}</span>
                            <button class="ghost msg-title" data-title="${win.id}" aria-label="编辑窗口备注">${win.title}</button>
                        </div>
                        <button class="ghost" data-del="${win.id}">删除</button>
                    </div>
                    <p class="msg-preview">${(win.messages?.[win.messages.length - 1]?.text || "点击进入聊天").slice(0, 50)}</p>
                </div>
            `;
        }).join("");
    }
    root.appendChild(list);

    list.querySelectorAll(".msg-card").forEach(card => {
        card.addEventListener("click", (ev) => {
            const del = ev.target.closest("[data-del]");
            const edit = ev.target.closest("[data-title]");
            if (del || edit) return;
            const winId = card.dataset.win;
            const roleId = card.dataset.role;
            navigateTo(`#/chat/${roleId}/${winId}`);
        });
    });
    list.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            deleteWindow(btn.dataset.del);
            renderMessages(root);
        });
    });
    list.querySelectorAll("[data-title]").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const id = btn.dataset.title;
            const current = btn.textContent || "";
            const input = document.createElement("input");
            input.type = "text";
            input.value = current;
            input.className = "msg-title-input";
            btn.replaceWith(input);
            input.focus();
            const save = () => saveTitle(id, input);
            input.addEventListener("blur", save);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                }
                if (e.key === "Escape") {
                    renderMessages(root);
                }
            });
        });
    });
    return { unmount() {} };
}

function saveTitle(id, input) {
    const next = input.value.trim() || "未命名窗口";
    updateWindow(id, { title: next });
    const root = input.closest(".messages-page");
    if (root) renderMessages(root);
}
