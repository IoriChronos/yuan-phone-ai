import { getWorldState, setWorldState } from "./world-state.js";
import { getLongMemory, loadLongMemory } from "./memory-long.js";
import { getShortMemory, hydrateShortMemory } from "./memory-short.js";
import { getSystemRules, updateSystemRules } from "./system-rules.js";

const KEY = "yuan-phone:role-temp";

function storage() {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
}

function readMap(store) {
    const raw = store.getItem(KEY);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const hasSinglePayload = parsed.roleId && parsed.worldState;
        if (hasSinglePayload) {
            return { [parsed.roleId]: parsed };
        }
        return parsed;
    } catch {
        return {};
    }
}

function writeMap(store, map) {
    try {
        if (!map || !Object.keys(map).length) {
            store.removeItem(KEY);
            return;
        }
        store.setItem(KEY, JSON.stringify(map));
    } catch (err) {
        console.warn("role-temp write failed", err);
    }
}

export function saveRoleTemp(roleId, meta = {}) {
    const store = storage();
    if (!store || !roleId) return;
    const payload = {
        roleId,
        roleName: meta.roleName || "",
        savedAt: Date.now(),
        worldState: cloneValue(getWorldState()),
        memoryLong: cloneValue(getLongMemory()),
        memoryShort: cloneValue(getShortMemory()),
        systemRules: cloneValue(getSystemRules())
    };
    const map = readMap(store);
    map[roleId] = payload;
    writeMap(store, map);
}

export function loadRoleTemp(roleId) {
    const store = storage();
    if (!store || !roleId) return null;
    const map = readMap(store);
    const payload = map[roleId];
    if (!payload) return null;
    try {
        applyPayload(payload);
        delete map[roleId];
        writeMap(store, map);
        return payload;
    } catch (err) {
        console.warn("loadRoleTemp failed", err);
        return null;
    }
}

export function clearRoleTemp(roleId = null) {
    const store = storage();
    if (!store) return;
    if (!roleId) {
        store.removeItem(KEY);
        return;
    }
    const map = readMap(store);
    delete map[roleId];
    writeMap(store, map);
}

export function peekRoleTemp(roleId = null) {
    const store = storage();
    if (!store) return null;
    const map = readMap(store);
    if (roleId) return map[roleId] || null;
    return map;
}

function applyPayload(payload) {
    if (payload.worldState) setWorldState(cloneValue(payload.worldState));
    if (payload.memoryLong) loadLongMemory(cloneValue(payload.memoryLong));
    if (payload.memoryShort) hydrateShortMemory(cloneValue(payload.memoryShort));
    if (payload.systemRules) updateSystemRules(cloneValue(payload.systemRules));
}

function cloneValue(value) {
    if (typeof window !== "undefined" && window.structuredClone) {
        try {
            return window.structuredClone(value);
        } catch {
            // fallback below
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}
