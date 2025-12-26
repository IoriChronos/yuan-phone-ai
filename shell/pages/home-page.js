import { getState, updateState } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderHome(root) {
    root.innerHTML = "";
    root.className = "home-page";
    const state = getState();
    const hero = document.createElement("section");
    hero.className = "home-hero";
    hero.innerHTML = `
        <div>
            <p class="home-kicker">欢迎回来</p>
            <div class="home-title-row">
                <h1>${state.user.name}</h1>
                <div class="home-badges">
                    <button class="ghost ghost-compact" data-act="user-profile">人设</button>
                    <button class="ghost ghost-compact" data-act="user-rules">规则</button>
                </div>
            </div>
            <p class="home-sub">首页、图库、上传都在这里集中呈现。</p>
            <p class="home-rules-preview">${renderGlobalStatus(state.user)}</p>
        </div>
    `;
    const gallery = document.createElement("section");
    gallery.className = "home-gallery";
    gallery.innerHTML = `
        <div class="home-panel">
            <div class="home-panel-head">
                <span>角色</span>
                <button class="ghost" data-act="roles">管理</button>
            </div>
            <div class="home-role-list">
                ${state.roles.map(role => `
                    <button class="role-chip" data-role="${role.id}" style="--chip-color:${role.color || "#f6c36a"}">
                        <span class="dot"></span>${role.name}
                    </button>
                `).join("")}
            </div>
        </div>
    `;
    root.appendChild(hero);
    root.appendChild(gallery);
    const dialog = buildRuleDialog(state.user);
    root.appendChild(dialog);

    hero.querySelector("[data-act='user-rules']")?.addEventListener("click", () => {
        dialog.classList.add("show");
        dialog.querySelector("[data-field='rules']")?.focus();
    });
    hero.querySelector("[data-act='user-profile']")?.addEventListener("click", () => {
        dialog.classList.add("show");
        dialog.querySelector("[data-field='profile']")?.focus();
    });
    gallery.querySelector("[data-act='roles']")?.addEventListener("click", () => navigateTo("#/roles"));
    gallery.querySelectorAll(".role-chip").forEach(btn => {
        btn.addEventListener("click", () => navigateTo("#/messages"));
    });
    return { unmount() {} };
}

function renderGlobalStatus(user) {
    const rule = user.globalRules;
    const profile = user.globalProfile;
    if (rule && profile) return "已设置全局规则和人设";
    if (rule) return "全局规则已设置";
    if (profile) return "全局人设已设置";
    return "点规则 / 人设 补充全局设定";
}

function buildRuleDialog(user = {}) {
    const wrap = document.createElement("div");
    wrap.className = "home-dialog";
    wrap.innerHTML = `
        <div class="home-dialog-mask" data-close="1"></div>
        <div class="home-dialog-panel">
            <h3>全局人设 / 规则</h3>
            <p class="home-dialog-note">这里的内容会在新窗口内默认载入，可在聊天里按需覆盖。</p>
            <label class="home-dialog-label">全局人设
                <textarea rows="4" data-field="profile" placeholder="为自己写一个人设">${user.globalProfile || ""}</textarea>
            </label>
            <label class="home-dialog-label">全局规则
                <textarea rows="5" data-field="rules" placeholder="为所有聊天写一组基准规则">${user.globalRules || ""}</textarea>
            </label>
            <div class="home-dialog-actions">
                <button class="ghost" data-close="1">取消</button>
                <button class="primary" data-act="save">保存</button>
            </div>
        </div>
    `;
    const close = () => wrap.classList.remove("show");
    wrap.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));
    wrap.querySelector("[data-act='save']")?.addEventListener("click", () => {
        const rules = wrap.querySelector("[data-field='rules']")?.value || "";
        const profile = wrap.querySelector("[data-field='profile']")?.value || "";
        const current = getState();
        updateState({ user: { ...current.user, globalRules: rules, globalProfile: profile } });
        close();
        const preview = document.querySelector(".home-rules-preview");
        if (preview) preview.textContent = renderGlobalStatus({ globalRules: rules, globalProfile: profile });
    });
    return wrap;
}
