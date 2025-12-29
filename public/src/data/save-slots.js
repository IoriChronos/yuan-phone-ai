import { getWorldState, setWorldState } from "./world-state.js";
import { getLongMemory, loadLongMemory } from "./memory-long.js";
import { getShortMemory, hydrateShortMemory } from "./memory-short.js";
import { getSystemRules, updateSystemRules } from "./system-rules.js";
import { getActiveCard, setActiveCard, listCharacterCards } from "./character-cards.js";
import { getPersonaMemory, loadPersonaMemory } from "./memory-persona.js";
import { getWindowId } from "../core/window-context.js";

const SLOT_KEYS = ["yuan-phone:slot:1", "yuan-phone:slot:2", "yuan-phone:slot:3"];

function storage() {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
}

function countUserMessages(state) {
    const story = state?.story || [];
    return story.filter(item => item?.role === "user").length;
}

function sanitizeRoleId(roleId) {
    return (roleId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resolveRole(roleId) {
    const active = getActiveCard();
    if (!roleId || roleId === active.id) {
        return { id: active.id, name: active.name || active.id };
    }
    try {
        const list = listCharacterCards?.() || [];
        const hit = list.find(c => c.id === roleId);
        if (hit) return { id: hit.id, name: hit.name || hit.id };
    } catch {
        // ignore lookup errors
    }
    return { id: roleId, name: roleId };
}

function currentWindowId(explicitId = null) {
    try {
        return explicitId || getWindowId();
    } catch {
        return explicitId || "win-default";
    }
}

function slotKey(index, roleId, windowId = null) {
    const base = SLOT_KEYS[index - 1];
    if (!base) return { key: "", legacy: "" };
    const safeRole = sanitizeRoleId(roleId);
    const scopedWindow = sanitizeRoleId(currentWindowId(windowId));
    return {
        key: `${base}:${scopedWindow}:${safeRole}`,
        legacy: base
    };
}

function readPayload(store, index, roleId, windowId = null) {
    const { key, legacy } = slotKey(index, roleId, windowId);
    if (!key && !legacy) return null;
    let raw = store.getItem(key);
    // 仅为默认角色兼容旧存档
    if (!raw && roleId === "default") {
        raw = store.getItem(legacy);
    }
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed ? { ...parsed, slotKey: key, windowId: windowId || parsed.windowId } : null;
    } catch {
        return null;
    }
}

export function saveSlot(index = 1, roleId = null, windowId = null) {
    const store = storage();
    if (!store) return;
    const { id, name } = resolveRole(roleId);
    const scopedWindow = currentWindowId(windowId);
    const { key, legacy } = slotKey(index, id, scopedWindow);
    if (!key) return;
    const prev = readPayload(store, index, id, scopedWindow);
    const payload = {
        savedAt: Date.now(),
        roleId: id,
        roleName: name,
        slotName: prev?.slotName || `槽位 ${index}`,
        windowId: scopedWindow,
        worldState: getWorldState(),
        memoryLong: getLongMemory(),
        memoryShort: getShortMemory(),
        systemRules: getSystemRules(),
        personaMemory: getPersonaMemory({ windowId: scopedWindow, characterId: id }),
        activeCardId: id,
        turns: countUserMessages(getWorldState())
    };
    store.setItem(key, JSON.stringify(payload));
    if (id === "default" && legacy) {
        try {
            store.removeItem(legacy);
        } catch {
            // ignore cleanup error
        }
    }
}

export function loadSlot(index = 1, roleId = null, windowId = null) {
    const store = storage();
    if (!store) return null;
    const { id } = resolveRole(roleId);
    const scopedWindow = currentWindowId(windowId);
    const payload = readPayload(store, index, id, scopedWindow);
    if (!payload) return null;
    try {
        if (payload.worldState) setWorldState(payload.worldState);
        if (payload.memoryLong) loadLongMemory(payload.memoryLong);
        if (payload.memoryShort) hydrateShortMemory(payload.memoryShort);
        if (payload.personaMemory) loadPersonaMemory(payload.personaMemory, { windowId: scopedWindow, characterId: payload.roleId || id });
        if (payload.systemRules) updateSystemRules(payload.systemRules);
        if (payload.activeCardId) setActiveCard(payload.activeCardId);
        return payload;
    } catch (err) {
        console.warn("Failed to load slot", err);
        return null;
    }
}

export function deleteSlot(index = 1, roleId = null, windowId = null) {
    const store = storage();
    if (!store) return;
    const { id } = resolveRole(roleId);
    const { key, legacy } = slotKey(index, id, currentWindowId(windowId));
    if (!key) return;
    store.removeItem(key);
    if (id === "default" && legacy) {
        store.removeItem(legacy);
    }
}

export function renameSlot(index = 1, name = "", roleId = null, windowId = null) {
    const store = storage();
    if (!store) return null;
    const { id } = resolveRole(roleId);
    const scopedWindow = currentWindowId(windowId);
    const payload = readPayload(store, index, id, scopedWindow);
    if (!payload) return null;
    const label = name.trim() || `槽位 ${index}`;
    const key = slotKey(index, id, scopedWindow).key;
    if (!key) return null;
    const next = { ...payload, slotName: label };
    try {
        store.setItem(key, JSON.stringify(next));
        return next;
    } catch (err) {
        console.warn("Failed to rename slot", err);
        return null;
    }
}

export function listSlots(roleId = null) {
    const store = storage();
    if (!store) return [];
    const { id, name } = resolveRole(roleId);
    const scopedWindow = currentWindowId();
    return SLOT_KEYS.map((_, idx) => {
        const payload = readPayload(store, idx + 1, id, scopedWindow);
        if (!payload) {
            return {
                index: idx + 1,
                empty: true,
                slotName: `槽位 ${idx + 1}`,
                roleId: id,
                roleName: name,
                windowId: scopedWindow
            };
        }
        return {
            index: idx + 1,
            empty: false,
            savedAt: payload.savedAt,
            slotName: payload.slotName || `槽位 ${idx + 1}`,
            roleId: payload.roleId || id,
            roleName: payload.roleName || name,
            windowId: payload.windowId || scopedWindow,
            turns: typeof payload.turns === "number" ? payload.turns : countUserMessages(payload.worldState)
        };
    });
}
