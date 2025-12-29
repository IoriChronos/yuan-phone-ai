import { startRouter, registerRoute } from "./router.js";
import { renderHome } from "./pages/home-page.js";
import { renderMessages } from "./pages/messages-page.js";
import { renderChat } from "./pages/chat-page.js";
import { renderRoles } from "./pages/roles-page.js";
import { renderRoleDetail } from "./pages/role-detail-page.js";
import { renderSettings } from "./pages/settings-page.js";
import { renderUnlock } from "./pages/unlock-page.js";
import { navigateTo } from "./pages/nav.js";
import { getState } from "./state.js";
import { applyStoredAppearance } from "./appearance.js";
import { enforceComponentLayer, observeComponentLayer } from "../core/component-layer.js";

const appRoot = document.getElementById("app-root");

enforceComponentLayer(document.body);
observeComponentLayer(document.body);

applyStoredAppearance();

showUnlockSplash();

registerRoute("/home", renderHome);
registerRoute("/messages", renderMessages);
registerRoute("/chat", renderChat);
registerRoute("/roles", renderRoles);
registerRoute("/role", renderRoleDetail);
registerRoute("/settings", renderSettings);
registerRoute("/unlock", renderUnlock);

try {
    startRouter(appRoot);
} catch (err) {
    console.error("Router init failed", err);
    appRoot.innerHTML = `<p class="empty">启动失败，请刷新或清除缓存重试。</p>`;
}

window.shellState = getState();

document.querySelectorAll("#tab-bar .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = btn.dataset.route;
        if (target) navigateTo(target);
    });
});

if (!getState().unlocked && window.location.hash !== "#/unlock") {
    navigateTo("#/unlock");
}

function showUnlockSplash() {
    if (!document || document.body.dataset.unlockSplash === "done") return;
    document.body.dataset.unlockSplash = "done";
    const splash = document.createElement("div");
    splash.id = "unlock-splash";
    splash.innerHTML = `
        <div class="unlock-splash-mask"></div>
        <div class="unlock-splash-panel">
            <div class="unlock-splash-anim">
                <div class="scan-lines"></div>
                <div class="glow-bar"></div>
            </div>
            <p class="splash-kicker">Access · ${getState().user?.name || "USER"}</p>
            <h3>解锁中</h3>
            <p class="splash-sub">正在校验你的身份与规则…</p>
        </div>
    `;
    document.body.appendChild(splash);
    requestAnimationFrame(() => splash.classList.add("show"));
    setTimeout(() => splash.classList.add("ready"), 900);
    setTimeout(() => {
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 420);
    }, 1900);
}
