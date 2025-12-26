import { navigateTo } from "./nav.js";
import { resetUnlock } from "../state.js";

export function renderSettings(root) {
    root.innerHTML = "";
    root.className = "settings-page";
    root.innerHTML = `
        <div class="settings-card">
            <h3>设置</h3>
            <p>此处可挂载未来的同步、主题等配置。</p>
            <div class="settings-actions">
                <button class="ghost" data-act="reset-unlock">重置解锁</button>
                <button class="ghost" data-act="back">返回首页</button>
            </div>
            <p class="settings-hint" aria-live="polite"></p>
        </div>
    `;
    const hint = root.querySelector(".settings-hint");
    root.querySelector("[data-act='back']")?.addEventListener("click", () => navigateTo("#/home"));
    root.querySelector("[data-act='reset-unlock']")?.addEventListener("click", () => {
        resetUnlock();
        if (hint) hint.textContent = "解锁状态已清除，下一次将要求输入口令。";
        setTimeout(() => navigateTo("#/unlock"), 200);
    });
    return { unmount() {} };
}
