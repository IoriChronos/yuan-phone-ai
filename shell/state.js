const STORAGE_KEY = "yuan-shell:state";
const UNLOCK_KEY = "yuan-shell:unlocked";

const defaultState = {
    user: { name: "沈安亦", globalRules: "", globalProfile: "" },
    roles: [
        {
            id: "r-default",
            name: "元书",
            bio: "黑雾里的记录者",
            color: "#f6c36a",
            opener: "这是默认开场白",
            persona: "低沉、控制欲、带着压迫感但不失温度。",
            worldview: "霓虹与黑雾交叠的城区，监控与档案室交错。",
            storyline: "守望与黑雾的对抗，从门口的回头开始。",
            profile: "他记录、命令、紧盯你的安全半径。"
        }
    ],
    windows: [
        { id: "w-default", roleId: "r-default", title: "主线", messages: [], updatedAt: Date.now(), hasOpened: false }
    ],
    route: "#/home",
    unlocked: false
};

let state = loadState();
const listeners = new Set();

function loadState() {
    if (typeof window === "undefined" || !window.localStorage) return { ...defaultState };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const unlocked = window.localStorage.getItem(UNLOCK_KEY) === "1";
            return { ...defaultState, unlocked };
        }
        const parsed = JSON.parse(raw);
        const unlockedFromKey = window.localStorage.getItem(UNLOCK_KEY) === "1";
        const unlocked = typeof parsed.unlocked === "boolean" ? parsed.unlocked : unlockedFromKey;
        const normalizeRole = (role) => ({
            ...role,
            persona: role?.persona || "",
            worldview: role?.worldview || "",
            storyline: role?.storyline || "",
            rules: role?.rules || "",
            profile: role?.profile || ""
        });
        return {
            ...defaultState,
            ...parsed,
            user: { ...defaultState.user, ...(parsed.user || {}) },
            roles: (parsed.roles?.length ? parsed.roles : defaultState.roles).map(normalizeRole),
            windows: parsed.windows?.length ? parsed.windows : defaultState.windows,
            unlocked
        };
    } catch {
        return { ...defaultState };
    }
}

function persist() {
    try {
        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

export function getState() {
    return state;
}

export function updateState(patch) {
    state = { ...state, ...patch };
    persist();
    emit();
}

export function addRole(payload) {
    const id = payload.id || `role-${Date.now()}`;
    const role = {
        id,
        name: payload.name || "未命名角色",
        bio: payload.bio || "这一段是简介",
        opener: payload.opener || "这是默认开场白",
        color: payload.color || pickColor(),
        persona: payload.persona || "",
        worldview: payload.worldview || "",
        storyline: payload.storyline || "",
        rules: payload.rules || "",
        profile: payload.profile || ""
    };
    state.roles = [role, ...state.roles.filter(r => r.id !== id)];
    persist();
    emit();
    return role;
}

export function updateRole(roleId, patch) {
    state.roles = state.roles.map(r => r.id === roleId ? { ...r, ...patch } : r);
    persist();
    emit();
}

export function removeRole(roleId) {
    if (roleId === "r-default") return;
    state.roles = state.roles.filter(r => r.id !== roleId);
    state.windows = state.windows.filter(w => w.roleId !== roleId);
    persist();
    emit();
}

export function addWindow(roleId, title = "新窗口") {
    const win = { id: `win-${Date.now()}`, roleId, title, messages: [], updatedAt: Date.now(), hasOpened: false };
    state.windows = [win, ...state.windows];
    persist();
    emit();
    return win;
}

export function deleteWindow(windowId) {
    state.windows = state.windows.filter(w => w.id !== windowId);
    persist();
    emit();
}

export function updateWindow(windowId, patch) {
    state.windows = state.windows.map(w => w.id === windowId ? { ...w, ...patch } : w);
    persist();
    emit();
}

export function appendMessage(windowId, message) {
    const win = state.windows.find(w => w.id === windowId);
    if (!win) return;
    win.messages = win.messages || [];
    win.messages.push({ ...message, id: message.id || `msg-${Date.now()}` });
    win.updatedAt = Date.now();
    persist();
    emit();
    return win;
}

export function markWindowOpened(windowId) {
    const win = state.windows.find(w => w.id === windowId);
    if (!win) return;
    if (win.hasOpened) return;
    win.hasOpened = true;
    persist();
    emit();
}

export function setRoute(route) {
    state.route = route;
    persist();
    emit();
}

export function unlock() {
    state.unlocked = true;
    try {
        window.localStorage?.setItem(UNLOCK_KEY, "1");
    } catch {
        /* ignore */
    }
    persist();
    emit();
}

export function resetUnlock() {
    state.unlocked = false;
    try {
        window.localStorage?.removeItem(UNLOCK_KEY);
    } catch {
        /* ignore */
    }
    persist();
    emit();
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit() {
    listeners.forEach(fn => {
        try { fn(state); } catch { /* ignore */ }
    });
}

function pickColor() {
    const palette = ["#f6c36a", "#8bd6ff", "#ff9cc2", "#a0ffc6", "#ffe7ba"];
    return palette[state.roles.length % palette.length];
}
