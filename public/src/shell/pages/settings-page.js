import { navigateTo } from "./nav.js";
import { resetUnlock } from "../state.js";
import { applyTheme, saveTheme, loadTheme, applyAccent, saveAccent, loadAccent } from "../appearance.js";
import { clearSavedLogin } from "./unlock-page.js";

export function renderSettings(root) {
    root.innerHTML = "";
    root.className = "settings-page";
    const theme = loadTheme();
    const accent = loadAccent();
    applyTheme(theme);
    applyAccent(accent);
    root.innerHTML = `
        <div class="settings-head ui-page-header">
            <div class="ui-page-title">
                <p class="settings-kicker">设置</p>
                <h2>外观与系统</h2>
            </div>
            <div class="ui-page-actions"></div>
        </div>
        <div class="settings-grid">
            <div class="settings-card ui-panel">
                <header class="settings-card-head ui-panel-header">
                    <p class="settings-kicker">外观</p>
                    <h3>主题模式</h3>
                </header>
                <section class="ui-panel-body">
                    <div class="settings-toggle">
                        <button class="ghost ${theme !== "day" ? "active" : ""}" data-theme="night">夜间</button>
                        <button class="ghost ${theme === "day" ? "active" : ""}" data-theme="day">日间</button>
                    </div>
                    <p class="settings-desc">切换日夜，背景与文字会即时更新。</p>
                </section>
            </div>
            <div class="settings-card accent-card ui-panel">
                <header class="settings-card-head ui-panel-header">
                    <p class="settings-kicker">RGB</p>
                    <h3>背景选色 · 渐变发光</h3>
                </header>
                <section class="ui-panel-body">
                    <div class="accent-preview" style="--accent-preview:${accent}">
                        <div class="accent-glow"></div>
                        <div class="accent-glow blur"></div>
                        <div class="accent-color-pick">
                            <input type="color" value="${accent}" data-act="accent-picker" aria-label="选择主题色">
                            <span class="accent-value">${accent}</span>
                            <button class="ghost ghost-compact" data-act="accent-reset">重置</button>
                        </div>
                        <p class="settings-desc">选择背景基色，叠加光效与渐变，保持按钮和滚动条的金色光。</p>
                    </div>
                </section>
            </div>
            <div class="settings-card ui-panel">
                <header class="settings-card-head ui-panel-header">
                    <p class="settings-kicker">系统</p>
                    <h3>安全与跳转</h3>
                </header>
                <section class="ui-panel-body">
                    <div class="settings-actions">
                        <button class="ghost" data-act="reset-unlock">重置解锁</button>
                        <button class="ghost" data-act="reset-login">重置登录</button>
                        <button class="ghost" data-act="clear-cache">清除缓存</button>
                        <button class="ghost" data-act="back">返回首页</button>
                    </div>
                    <p class="settings-hint" aria-live="polite"></p>
                </section>
            </div>
        </div>
    `;
    const hint = root.querySelector(".settings-hint");
    root.querySelector("[data-act='back']")?.addEventListener("click", () => navigateTo("#/home"));
    root.querySelector("[data-act='reset-unlock']")?.addEventListener("click", () => {
        resetUnlock();
        if (hint) hint.textContent = "解锁状态已清除，下一次将要求输入口令。";
        setTimeout(() => navigateTo("#/unlock"), 200);
    });
    root.querySelector("[data-act='reset-login']")?.addEventListener("click", () => {
        clearSavedLogin();
        resetUnlock();
        if (hint) hint.textContent = "登录与解锁信息已重置。";
        setTimeout(() => navigateTo("#/unlock"), 200);
    });
    root.querySelector("[data-act='clear-cache']")?.addEventListener("click", () => {
        const removed = clearLocalCaches();
        if (hint) {
            hint.textContent = removed > 0 ? `已清除缓存 ${removed} 项，建议刷新页面。` : "未发现可清除的缓存。";
        }
    });
    root.querySelectorAll("[data-theme]").forEach(btn => {
        btn.addEventListener("click", () => {
            const next = btn.dataset.theme === "day" ? "day" : "night";
            saveTheme(next);
            applyTheme(next);
            root.querySelectorAll("[data-theme]").forEach(b => b.classList.toggle("active", b === btn));
        });
    });
    const accentInput = root.querySelector("[data-act='accent-picker']");
    const accentValue = root.querySelector(".accent-value");
    const updateAccent = (value) => {
        const color = value || accentInput?.value || loadAccent();
        saveAccent(color);
        applyAccent(color);
        if (accentInput) accentInput.value = color;
        if (accentValue) accentValue.textContent = color;
        const preview = root.querySelector(".accent-preview");
        if (preview) preview.style.setProperty("--accent-preview", color);
    };
    accentInput?.addEventListener("input", (e) => updateAccent(e.target.value));
    root.querySelector("[data-act='accent-reset']")?.addEventListener("click", () => updateAccent("#f6c36a"));
    return { unmount() {} };
}

function clearLocalCaches() {
    if (typeof window === "undefined" || !window.localStorage) return 0;
    const prefixes = ["yuan-shell:", "yuan-phone"];
    const removed = [];
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (prefixes.some(p => key.startsWith(p))) {
            removed.push(key);
            try { window.localStorage.removeItem(key); } catch { /* ignore */ }
        }
    }
    return removed.length;
}
