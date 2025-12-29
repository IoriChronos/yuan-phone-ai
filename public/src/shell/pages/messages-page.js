import { getState, deleteWindow, updateWindow } from "../state.js";
import { getWorldState } from "../../data/world-state.js";
import { getRawReplies } from "../../data/window-memory.js";
import { navigateTo } from "./nav.js";

export function renderMessages(root) {
    root.innerHTML = "";
    root.className = "messages-page";
    const scrollHost = root;
    if (scrollHost.__msgScrollHandler) {
        scrollHost.removeEventListener("scroll", scrollHost.__msgScrollHandler);
        scrollHost.__msgScrollHandler = null;
    }
    const state = getState();
    const windows = [...state.windows].sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0));

    const head = document.createElement("div");
    head.className = "msg-topbar ui-page-header";
    head.innerHTML = `
        <div class="ui-page-title">
            <div class="msg-header">
                <h2>消息</h2>
                <span class="msg-count">${windows.length} 个窗口</span>
            </div>
            <div class="msg-title-row">
                <p class="msg-kicker">最近窗口</p>
            </div>
        </div>
        <div class="ui-page-actions msg-top-actions">
            <label class="msg-search">
                <span class="msg-search-icon">⌕</span>
                <input type="search" placeholder="搜索角色 / 备注 / 内容" data-act="search">
            </label>
            
        </div>
    `;
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "messages-scroll";
    const list = document.createElement("div");
    list.className = "msg-list";
    if (!windows.length) {
        list.innerHTML = `<p class="empty">还没有窗口，在聊天工具里新建一个吧。</p>`;
    } else {
        list.innerHTML = windows.map(win => {
            const role = state.roles.find(r => r.id === win.roleId);
            const latest = getLatestMessage(win);
            const previewBase = latest?.text ? formatPreview(latest) : "";
            const preview = win.preview || previewBase || "点击进入聊天";
            const roleName = escapeHtml(role?.name || "角色");
            const titleValue = win.title || "未命名窗口";
            const titleAttr = escapeAttr(titleValue);
            const titleDisplay = escapeHtml(titleValue);
            const listStamp = formatListTime(win.updatedAt);
            const safePreview = escapeHtml(preview);
            const keywords = escapeAttr(`${role?.name || ""} ${titleValue} ${preview}`);
            const turns = getAIReplyCount(win);
            return `
                <div class="msg-card ui-panel" data-win="${win.id}" data-role="${win.roleId}" data-keywords="${keywords}">
                    <header class="msg-head ui-panel-header">
                        <div class="msg-role">
                            <span class="msg-role-name">${roleName}</span>
                            <span class="msg-title-wrap">
                                <button type="button" class="ghost msg-title msg-title-display" data-title="${win.id}" aria-label="编辑窗口备注">${titleDisplay}</button>
                            </span>
                        </div>
                        <div class="msg-head-actions">
                            <span class="msg-turns">AI ${turns} 轮</span>
                            <button class="ghost" data-del="${win.id}">删除</button>
                        </div>
                    </header>
                    <section class="ui-panel-body">
                        <div class="msg-preview-row">
                            <p class="msg-preview">${safePreview}</p>
                            <span class="msg-time">${listStamp}</span>
                        </div>
                    </section>
                </div>
            `;
        }).join("");
    }
    const backTop = document.createElement("button");
    backTop.type = "button";
    backTop.className = "msg-back-top";
    backTop.textContent = "↑ 回顶部";
    scrollWrap.appendChild(list);
    scrollWrap.appendChild(backTop);
    root.append(head);
    root.appendChild(scrollWrap);

    // roles button removed from header for tighter mobile layout

    list.querySelectorAll(".msg-card").forEach(card => {
        card.addEventListener("click", (ev) => {
            const del = ev.target.closest("[data-del]");
            const edit = ev.target.closest("[data-title]") || ev.target.closest("[data-title-display]");
            if (del || edit) return;
            const winId = card.dataset.win;
            const roleId = card.dataset.role;
            navigateTo(`#/chat/${roleId}/${winId}`);
        });
    });
    list.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const targetId = btn.dataset.del;
            const modal = buildDeleteModal(() => {
                deleteWindow(targetId);
                renderMessages(root);
            });
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add("show"));
        });
    });
    list.querySelectorAll("[data-title]").forEach(btn => {
        const stop = (ev) => ev.stopPropagation();
        btn.addEventListener("pointerdown", stop);
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            startTitleEdit(btn, root);
        });
    });
    head.querySelector("[data-act='search']")?.addEventListener("input", (e) => {
        const keyword = (e.target.value || "").toLowerCase();
        list.querySelectorAll(".msg-card").forEach(card => {
            const match = (card.dataset.keywords || "").toLowerCase().includes(keyword);
            card.classList.toggle("hidden", !match);
        });
    });
    const toggleTopBtn = () => {
        const show = scrollHost.scrollTop > 120;
        backTop.classList.toggle("show", show);
    };
    toggleTopBtn();
    scrollHost.addEventListener("scroll", toggleTopBtn, { passive: true });
    scrollHost.__msgScrollHandler = toggleTopBtn;
    backTop.addEventListener("click", () => scrollHost.scrollTo({ top: 0, behavior: "smooth" }));
    return {
        unmount() {
            scrollHost.removeEventListener("scroll", toggleTopBtn);
            scrollHost.__msgScrollHandler = null;
        }
    };
}

function startTitleEdit(btn, root) {
    if (!btn) return;
    const wrap = btn.closest(".msg-title-wrap") || btn.parentElement || btn;
    const id = btn.dataset.title;
    const current = (btn.textContent || "").trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "msg-title-input";
    input.value = current;
    input.placeholder = "未命名窗口";
    input.dataset.prev = current;
    const syncSize = () => {
        const len = (input.value || input.placeholder || "").length;
        input.size = Math.min(Math.max(len + 2, 6), 36);
    };
    const finish = (commit) => {
        const next = (input.value || "").trim() || "未命名窗口";
        const changed = next !== (input.dataset.prev || "");
        if (commit && changed) {
            updateWindow(id, { title: next });
        }
        renderMessages(root);
    };
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
        }
        if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
        }
    });
    input.addEventListener("input", (e) => {
        e.stopPropagation();
        syncSize();
    });
    wrap.replaceChild(input, btn);
    syncSize();
    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

function getLatestMessage(win) {
    if (!win?.messages?.length) return null;
    return win.messages[win.messages.length - 1];
}

function formatPreview(message = {}) {
    const prefix = message.from === "user" ? "你：" : message.from === "system" ? "提示：" : "AI：";
    const text = String(message.text || "").replace(/\s+/g, " ").slice(0, 120);
    return `${prefix}${text}`;
}

function formatListTime(ts) {
    if (!ts) return "99月99日";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "99月99日";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return "刚刚";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "昨天";
    return `${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`;
}

function pad(n) {
    return n < 10 ? `0${n}` : `${n}`;
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(str = "") {
    return escapeHtml(str).replace(/`/g, "&#096;");
}

function getAIReplyCount(win = {}) {
    if (typeof win.aiTurns === "number") return win.aiTurns;
    if (typeof win.aiRounds === "number") return win.aiRounds;
    const scoped = win.id;
    if (scoped) {
        try {
            const raw = getRawReplies(scoped);
            if (Array.isArray(raw) && raw.length) return raw.length;
        } catch {
            /* ignore */
        }
    }
    const world = getWorldState?.();
    if (world?.story?.length) {
        const list = world.story.filter(item => item.meta?.windowId === scoped && (item.role === "system" || item.meta?.narrator));
        if (list.length) return list.length;
    }
    if (!win.messages || !win.messages.length) return 0;
    return win.messages.filter(msg => msg.from === "ai" || msg.from === "system").length;
}

function buildDeleteModal(onConfirm) {
    const wrap = document.createElement("div");
    wrap.className = "msg-confirm ui-modal-backdrop";
    wrap.innerHTML = `
        <div class="msg-confirm-panel ui-modal">
            <header class="ui-modal-header">
                <h3>确认删除窗口</h3>
            </header>
            <section class="ui-modal-body">
                <p>删除后将清除该窗口的全部消息，确认继续？</p>
            </section>
            <footer class="msg-confirm-actions ui-modal-footer">
                <button class="ghost" data-close="1">取消</button>
                <button class="primary" data-act="confirm">删除</button>
            </footer>
        </div>
    `;
    wrap.addEventListener("click", (ev) => {
        if (ev.target === wrap) wrap.remove();
    });
    wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => wrap.remove()));
    wrap.querySelector("[data-act='confirm']")?.addEventListener("click", () => {
        onConfirm?.();
        wrap.remove();
    });
    return wrap;
}
