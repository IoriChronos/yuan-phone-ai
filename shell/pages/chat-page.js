import { getState, appendMessage, markWindowOpened, addWindow, updateRole } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderChat(root, params) {
    root.innerHTML = "";
    root.className = "chat-page";
    const [, roleId, winId] = params.parts || [];
    const state = getState();
    const win = state.windows.find(w => w.id === winId);
    const role = state.roles.find(r => r.id === roleId);
    if (!win || !role) {
        root.innerHTML = `<p class="empty">未找到聊天窗口。</p>`;
        return { unmount() {} };
    }
    const shouldOpen = !win.hasOpened;
    const opener = role.opener || "这是默认开场白";
    const slotKey = win.id || `win-${Date.now()}`;

    const wrap = document.createElement("div");
    wrap.className = "legacy-chat-shell";
    wrap.innerHTML = `
        <div class="chat-floating-head">
            <button class="chat-head-pill" data-act="back" aria-label="返回聊天列表">
                <span class="pill-text">
                    <span class="pill-role">
                        <span class="pill-role-text">${role.name}</span>
                        <span class="pill-role-exit">退出</span>
                    </span>
                </span>
            </button>
        </div>
        <div class="chat-single"></div>
    `;
    const edgeStrip = document.createElement("div");
    edgeStrip.className = "chat-edge-strip";
    wrap.appendChild(edgeStrip);

    const storyPane = wrap.querySelector(".chat-single");
    const storyFrame = document.createElement("iframe");
    storyFrame.className = "legacy-chat-frame";
    storyFrame.src = `story-embed.html?slot=${encodeURIComponent(slotKey)}&role=${encodeURIComponent(role.name)}`;
    storyPane?.appendChild(storyFrame);

    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("chat-enter"));

    const goBack = () => navigateTo("#/messages");
    const backBtn = wrap.querySelector("[data-act='back']");
    backBtn?.addEventListener("click", goBack);
    const toggleExit = (on) => {
        if (!backBtn) return;
        backBtn.classList.toggle("show-exit", !!on);
    };
    backBtn?.addEventListener("pointerenter", () => toggleExit(true));
    backBtn?.addEventListener("pointerleave", () => toggleExit(false));
    backBtn?.addEventListener("pointerdown", () => toggleExit(true));
    backBtn?.addEventListener("pointerup", () => toggleExit(false));

    const forwardInput = (text) => {
        if (!text) return;
        appendMessage(win.id, { text, from: "user" });
    };

    const onMessage = (event) => {
        if (event?.data?.type === "user-input" && event.data.text) {
            forwardInput(event.data.text);
            return;
        }
        if (event?.data?.type === "shell:new-window") {
            const roleId = event.data.roleId || role.id;
            const targetRole = getState().roles.find(r => r.id === roleId) || role;
            const count = getState().windows.filter(w => w.roleId === targetRole.id).length + 1;
            const newWin = addWindow(targetRole.id, `窗口 ${count}`);
            navigateTo(`#/chat/${targetRole.id}/${newWin.id}`);
            return;
        }
        if (event?.data?.type === "role-updated" && event.data.role) {
            const payload = event.data.role;
            const patch = {
                name: payload.name,
                bio: payload.bio,
                opener: payload.opener,
                persona: payload.persona,
                worldview: payload.worldview || payload.worldLore,
                storyline: payload.storyline,
                rules: payload.rules,
                profile: payload.profile
            };
            if (payload.color) patch.color = payload.color;
            Object.keys(patch).forEach(key => patch[key] === undefined && delete patch[key]);
            updateRole(payload.id || role.id, patch);
            const head = wrap.querySelector(".chat-head-pill .pill-role-text");
            if (head && payload.name) head.textContent = payload.name;
        }
    };

    storyFrame.addEventListener("load", () => {
        try {
            storyFrame.contentWindow.postMessage({
                type: "shell-chat-init",
                role: role.name,
                roleId: role.id,
                windowId: win.id
            }, "*");
            storyFrame.contentWindow.postMessage({
                type: "shell-role-sync",
                role,
                globalRules: state.user?.globalRules || "",
                globalProfile: state.user?.globalProfile || ""
            }, "*");
            if (shouldOpen) {
                storyFrame.contentWindow.postMessage({ type: "shell-opening", text: opener }, "*");
                markWindowOpened(win.id);
                appendMessage(win.id, { text: opener, from: "system" });
            }
            storyFrame.classList.add("is-ready");
        } catch {
            // ignore cross-origin errors (same origin expected)
        }
    });
    window.addEventListener("message", onMessage);

    const shell = document.getElementById("app-shell");
    shell?.classList.add("fullscreen");

    // Swipe back on touch devices
    let touchStartX = null;
    let touchFromEdge = false;
    const onTouchStart = (e) => {
        const x = e.touches?.[0]?.clientX || null;
        touchStartX = x;
        touchFromEdge = typeof x === "number" && x <= 60;
    };
    const onTouchEnd = (e) => {
        if (touchStartX == null || !touchFromEdge) return;
        const dx = (e.changedTouches?.[0]?.clientX || 0) - touchStartX;
        if (dx > 80) goBack();
        touchStartX = null;
        touchFromEdge = false;
    };
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });

    // Pointer swipe from left edge (desktop/trackpad)
    let pointerStartX = null;
    edgeStrip.addEventListener("pointerdown", (e) => {
        pointerStartX = e.clientX;
    });
    const resetPointer = () => { pointerStartX = null; };
    edgeStrip.addEventListener("pointerleave", resetPointer);
    edgeStrip.addEventListener("pointercancel", resetPointer);
    edgeStrip.addEventListener("pointerup", (e) => {
        if (pointerStartX != null && e.clientX - pointerStartX > 50) {
            goBack();
        }
        resetPointer();
    });

    document.body.classList.add("chat-fullscreen");

    return {
        unmount() {
            storyFrame.src = "about:blank";
            window.removeEventListener("message", onMessage);
            shell?.classList.remove("fullscreen");
            root.removeEventListener("touchstart", onTouchStart);
            root.removeEventListener("touchend", onTouchEnd);
            document.body.classList.remove("chat-fullscreen");
        }
    };
}
