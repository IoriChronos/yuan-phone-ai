const DEFAULT_WINDOW_ID = "win-default";
const BINDING_MAP_KEY = "yuan-phone:window-characters";
const WINDOW_OVERRIDES_KEY = "yuan-phone:window-overrides";

const derivedWindowId = deriveWindowId();
const memoryBindings = {};
const overrideCache = {};

function deriveWindowId() {
    if (typeof window === "undefined") return DEFAULT_WINDOW_ID;
    const params = new URLSearchParams(window.location?.search || "");
    const slotParam = params.get("slot") || "";
    const hashSlot = (window.location?.hash || "").replace(/^#/, "");
    const hinted = window.__SHELL_WINDOW_ID__ || window.__YUAN_SLOT__ || slotParam || hashSlot;
    return sanitizeWindowId(hinted || DEFAULT_WINDOW_ID);
}

function sanitizeWindowId(raw) {
    return String(raw || DEFAULT_WINDOW_ID).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function storageAvailable() {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
        const key = "__win_scope_test__";
        window.localStorage.setItem(key, "1");
        window.localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function readBindingMap() {
    if (!storageAvailable()) return { ...memoryBindings };
    try {
        const raw = window.localStorage.getItem(BINDING_MAP_KEY);
        if (!raw) return { ...memoryBindings };
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            return { ...parsed, ...memoryBindings };
        }
    } catch {
        /* ignore */
    }
    return { ...memoryBindings };
}

function persistBindingMap(map) {
    if (!storageAvailable()) return;
    try {
        window.localStorage.setItem(BINDING_MAP_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

function sessionStorageAvailable() {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    try {
        const key = "__win_scope_session_test__";
        window.sessionStorage.setItem(key, "1");
        window.sessionStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function normalizeOverrides(raw = {}) {
    return {
        windowSystemOverride: raw.windowSystemOverride || "",
        windowUserPersonaOverride: raw.windowUserPersonaOverride || "",
        // TODO: clarify whether window-level persona edits should affect AI; kept for UI echo only.
        windowPersonaOverride: raw.windowPersonaOverride || ""
    };
}

function readOverrideMap() {
    const fallback = { ...overrideCache };
    if (!sessionStorageAvailable()) return fallback;
    try {
        const raw = window.sessionStorage.getItem(WINDOW_OVERRIDES_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            Object.keys(parsed).forEach(key => {
                overrideCache[key] = normalizeOverrides(parsed[key]);
            });
            return { ...overrideCache };
        }
    } catch {
        /* ignore */
    }
    return fallback;
}

function persistOverrideMap(map) {
    if (!sessionStorageAvailable()) return;
    try {
        window.sessionStorage.setItem(WINDOW_OVERRIDES_KEY, JSON.stringify(map));
    } catch {
        /* ignore */
    }
}

export function getWindowId() {
    return derivedWindowId;
}

export function assertWindowId(windowId) {
    if (!windowId) {
        throw new Error("windowId is required for scoped operations.");
    }
    if (windowId !== derivedWindowId) {
        throw new Error(`Window scope mismatch: expected ${derivedWindowId}, got ${windowId}`);
    }
}

export function windowScopedKey(base, windowId = derivedWindowId) {
    const safeBase = String(base || "").trim();
    const target = sanitizeWindowId(windowId || derivedWindowId);
    return `${safeBase}:${target}`;
}

export function bindWindowCharacter(windowId = derivedWindowId, characterId) {
    if (!characterId) return null;
    const map = readBindingMap();
    map[sanitizeWindowId(windowId)] = characterId;
    memoryBindings[sanitizeWindowId(windowId)] = characterId;
    persistBindingMap(map);
    return characterId;
}

export function getWindowCharacterId(windowId = derivedWindowId) {
    const map = readBindingMap();
    return map[sanitizeWindowId(windowId)] || null;
}

export function getKnownWindowBindings() {
    return readBindingMap();
}

export function resolveWindowId(candidate) {
    return sanitizeWindowId(candidate || derivedWindowId);
}

export function getWindowOverrides(windowId = derivedWindowId) {
    const scoped = sanitizeWindowId(windowId || derivedWindowId);
    const map = readOverrideMap();
    const overrides = map[scoped] ? normalizeOverrides(map[scoped]) : normalizeOverrides();
    overrideCache[scoped] = overrides;
    return overrides;
}

export function setWindowOverrides(windowId = derivedWindowId, overrides = {}) {
    if (!windowId) return normalizeOverrides();
    const scoped = sanitizeWindowId(windowId || derivedWindowId);
    const map = readOverrideMap();
    const normalized = normalizeOverrides(overrides);
    map[scoped] = normalized;
    overrideCache[scoped] = normalized;
    persistOverrideMap(map);
    return normalized;
}

export function clearWindowOverrides(windowId = derivedWindowId) {
    const scoped = sanitizeWindowId(windowId || derivedWindowId);
    const map = readOverrideMap();
    delete map[scoped];
    delete overrideCache[scoped];
    persistOverrideMap(map);
}

try {
    if (typeof window !== "undefined") {
        Object.defineProperty(window, "__YUAN_WINDOW_ID__", {
            value: derivedWindowId,
            writable: false,
            configurable: false
        });
    }
} catch {
    /* ignore */
}
