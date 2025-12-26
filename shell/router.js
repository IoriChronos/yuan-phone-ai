import { setRoute, getState } from "./state.js";

const routes = new Map();

export function registerRoute(key, loader) {
    routes.set(key, loader);
}

export function startRouter(appRoot) {
    window.addEventListener("hashchange", () => handleRoute(appRoot));
    handleRoute(appRoot);
}

let activeModule = null;

async function handleRoute(appRoot) {
    const hash = window.location.hash || "#/home";
    const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
    const base = `/${parts[0] || "home"}`;
    const state = getState?.();
    if (state && !state.unlocked && base !== "/unlock") {
        window.location.hash = "#/unlock";
        return;
    }
    if (state && state.unlocked && base === "/unlock") {
        window.location.hash = state.route || "#/home";
        return;
    }
    const loader = routes.get(base);
    if (!loader) return;
    if (activeModule?.unmount) {
        try { activeModule.unmount(); } catch { /* ignore */ }
    }
    const params = { parts, hash };
    try {
        activeModule = await loader(appRoot, params);
    } catch (err) {
        console.error("Route render failed", err);
        appRoot.innerHTML = `<p class="empty">页面加载失败，请返回首页。</p><button class="primary" id="router-fallback-home">返回</button>`;
        document.getElementById("router-fallback-home")?.addEventListener("click", () => {
            window.location.hash = "#/home";
        });
        return;
    }
    setRoute(hash);
    syncTab(hash);
}

function syncTab(hash) {
    const btns = document.querySelectorAll("#tab-bar .tab-btn");
    btns.forEach(btn => {
        const target = btn.dataset.route;
        const active = target === hash
            || hash.startsWith(target)
            || (target === "#/roles" && hash.startsWith("#/role"));
        btn.classList.toggle("active", active);
    });
}
