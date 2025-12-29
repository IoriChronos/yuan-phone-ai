import { listCharacterCards, upsertCharacterCard, deleteCharacterCard } from "../data/character-cards.js";
import { setGlobalSystemRules, setGlobalUserPersona, setGlobalUserName, setGlobalUserGender, setGlobalUserHeight } from "../data/system-rules.js";

const STORAGE_KEY = "yuan-shell:state";
const UNLOCK_KEY = "yuan-shell:unlocked";

const defaultState = {
    user: { name: "玩家", gender: "男", height: "", globalRules: "", globalProfile: "" },
    roles: [],
    windows: [
        { id: "w-default", roleId: "r-default", title: "主线", messages: [], updatedAt: Date.now(), hasOpened: false }
    ],
    route: "#/home",
    unlocked: false
};

let state = loadState();
syncSystemRulesFromState(state.user);
const listeners = new Set();

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("character-cards:changed", () => {
        state.roles = syncRolesFromCards(mapRoleColors(state.roles));
        persist();
        emit();
    });
}

function loadState() {
    if (typeof window === "undefined" || !window.localStorage) {
        return {
            ...defaultState,
            roles: syncRolesFromCards([])
        };
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const unlockedFallback = window.localStorage.getItem(UNLOCK_KEY) === "1";
        if (!raw) {
            const roles = syncRolesFromCards([]);
            const roleIds = roles.map(r => r.id);
            const windows = defaultState.windows.map(w => ({ ...w, roleId: roleIds[0] || w.roleId }));
            return { ...defaultState, unlocked: unlockedFallback, roles, windows };
        }
        const parsed = JSON.parse(raw);
        const unlocked = typeof parsed.unlocked === "boolean" ? parsed.unlocked : unlockedFallback;
        const colorMap = mapRoleColors(parsed.roles || defaultState.roles);
        const roles = syncRolesFromCards(colorMap);
        const roleIds = roles.map(r => r.id);
        const windows = (parsed.windows?.length ? parsed.windows : defaultState.windows).map(w => {
            if (roleIds.includes(w.roleId)) return w;
            const fallbackRole = roleIds[0] || w.roleId;
            return { ...w, roleId: fallbackRole };
        });
        return {
            ...defaultState,
            ...parsed,
            user: { ...defaultState.user, ...(parsed.user || {}) },
            roles,
            windows,
            unlocked
        };
    } catch {
        return { ...defaultState, roles: syncRolesFromCards([]) };
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
    const nextUser = patch?.user ? { ...state.user, ...patch.user } : state.user;
    state = { ...state, ...patch, user: nextUser };
    if (patch?.user) {
        const { globalRules, globalProfile, name, gender, height } = nextUser;
        if (globalRules !== undefined) setGlobalSystemRules(globalRules || "");
        if (globalProfile !== undefined) setGlobalUserPersona(globalProfile || "", { name, gender, height });
        if (name !== undefined) setGlobalUserName(name || "玩家");
        if (gender !== undefined) setGlobalUserGender(gender || "");
        if (height !== undefined) setGlobalUserHeight(height || "");
        if (typeof console !== "undefined" && console.debug) {
            console.debug("[Shell] user updated", { name, gender, height, hasRules: Boolean(globalRules), hasProfile: Boolean(globalProfile) });
        }
    }
    persist();
    emit();
}

export function addRole(payload) {
    const id = payload.id || `role-${Date.now()}`;
    const card = upsertCharacterCard({ id, ...payload, updatedAt: Date.now() });
    const roleCount = state?.roles?.length || 0;
    const role = toRole(card, payload.color || pickColor(roleCount), roleCount);
    state.roles = [role, ...state.roles.filter(r => r.id !== id)];
    persist();
    emit();
    return role;
}

export function updateRole(roleId, patch) {
    const card = upsertCharacterCard({ id: roleId, ...patch, updatedAt: Date.now() });
    state.roles = state.roles.map((r, idx) => r.id === roleId ? toRole(card, r.color, idx) : r);
    persist();
    emit();
}

export function removeRole(roleId) {
    if (roleId === "r-default") return;
    deleteCharacterCard(roleId);
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

export function computeWindowSummary(windowId) {
    const win = state.windows.find(w => w.id === windowId);
    if (!win) return { aiTurns: 0, previewText: "", previewAt: 0, lastMessageId: null };
    return {
        aiTurns: win.aiRounds || win.aiTurns || 0,
        previewText: win.preview || "",
        previewAt: win.updatedAt || 0,
        lastMessageId: win.lastMessageId || null
    };
}

export function updateWindowSummary(windowId, summary = {}) {
    if (!windowId) return;
    state.windows = state.windows.map(w => {
        if (w.id !== windowId) return w;
        const nextUpdatedAt = summary.previewAt || summary.updatedAt || w.updatedAt || Date.now();
        return {
            ...w,
            aiRounds: summary.aiTurns ?? summary.rounds ?? w.aiRounds ?? w.aiTurns ?? 0,
            aiTurns: summary.aiTurns ?? w.aiTurns ?? w.aiRounds ?? 0,
            preview: summary.previewText ?? summary.preview ?? w.preview ?? "",
            lastMessageId: summary.lastMessageId ?? w.lastMessageId ?? null,
            updatedAt: nextUpdatedAt
        };
    });
    persist();
    emit();
    if (typeof console !== "undefined" && console.debug) {
        console.debug("[Shell] window summary updated", { windowId, summary });
    }
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

function syncSystemRulesFromState(user = {}) {
    const name = user.name || defaultState.user.name;
    const gender = user.gender || defaultState.user.gender || "男";
    const height = user.height || "";
    if (user.globalRules !== undefined) setGlobalSystemRules(user.globalRules || "");
    if (user.globalProfile !== undefined) setGlobalUserPersona(user.globalProfile || "", { name, gender, height });
    setGlobalUserName(name || "玩家");
    setGlobalUserGender(gender || "");
    setGlobalUserHeight(height || "");
}

function syncRolesFromCards(colorMap = {}) {
    const cards = listCharacterCards?.() || [];
    if (!cards.length) return defaultState.roles;
    return cards.map((card, idx) => toRole(card, colorMap[card.id] || pickColor(idx), idx));
}

function toRole(card, color, index = 0) {
    return {
        ...card,
        color: color || pickColor(index)
    };
}

function mapRoleColors(roles = []) {
    return roles.reduce((map, role) => {
        if (role?.id && role.color) {
            map[role.id] = role.color;
        }
        return map;
    }, {});
}

function pickColor(index = 0) {
    const palette = ["#f6c36a", "#8bd6ff", "#ff9cc2", "#a0ffc6", "#ffe7ba"];
    const base = Number.isFinite(index) ? index : 0;
    return palette[base % palette.length];
}
