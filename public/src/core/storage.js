import { getWorldState } from "../data/world-state.js";
import { getLongMemory, loadLongMemory } from "../data/memory-long.js";
import { initState, subscribeState } from "./state.js";
import { getWindowId } from "./window-context.js";

const STORAGE_VERSION = 2;

function slotSuffix() {
    if (typeof window === "undefined") return "";
    try {
        const slot = getWindowId();
        return slot ? `:${slot}` : "";
    } catch {
        const slot = window.__YUAN_SLOT__ || "";
        if (!slot) return "";
        return `:${slot}`;
    }
}

function storageKey(name) {
    const suffix = slotSuffix();
    if (name === "world") return `yuan-phone${suffix}:world`;
    if (name === "longMemory") return `yuan-phone${suffix}:memory-long`;
    if (name === "backupPrefix") return `yuan-phone${suffix}:backup:`;
    return `yuan-phone${suffix}:${name}`;
}
const MAX_BACKUPS = 3;

export function loadInitialData() {
    return {
        worldState: loadWorldStateSnapshot(),
        memoryLong: loadLongMemorySnapshot()
    };
}

export function syncStateWithStorage() {
    const { worldState, memoryLong } = loadInitialData();
    initState(worldState);
    loadLongMemory(memoryLong);
    subscribeState(() => saveWorldStateSnapshot());
    window.addEventListener("beforeunload", () => {
        saveWorldStateSnapshot();
        saveLongMemorySnapshot();
    });
}

export function saveWorldStateSnapshot(state = getWorldState()) {
    if (!storageAvailable()) return;
    const data = trimWorldStateForPersist(state);
    const payload = {
        version: STORAGE_VERSION,
        data
    };
    try {
        window.localStorage.setItem(storageKey("world"), JSON.stringify(payload));
        writeBackup(payload);
    } catch (err) {
        console.warn("Failed to save world state", err);
    }
}

export function saveLongMemorySnapshot(data = getLongMemory()) {
    if (!storageAvailable()) return;
    try {
        window.localStorage.setItem(storageKey("longMemory"), JSON.stringify({
            version: STORAGE_VERSION,
            data
        }));
    } catch (err) {
        console.warn("Failed to save long memory", err);
    }
}

function loadWorldStateSnapshot() {
    if (!storageAvailable()) return null;
    const raw = window.localStorage.getItem(storageKey("world"));
    if (!raw) return null;
    try {
        const payload = JSON.parse(raw);
        return applyMigrations(payload);
    } catch (err) {
        console.warn("Failed to parse world state snapshot", err);
        return null;
    }
}

function loadLongMemorySnapshot() {
    if (!storageAvailable()) return [];
    const raw = window.localStorage.getItem(storageKey("longMemory"));
    if (!raw) return [];
    try {
        const payload = JSON.parse(raw);
        return payload.data || payload || [];
    } catch (err) {
        console.warn("Failed to parse long memory snapshot", err);
        return [];
    }
}

function applyMigrations(payload) {
    if (!payload) return null;
    let version = payload.version || 1;
    let data = payload.data || payload;
    if (!data.contacts && data.phone) {
        data = convertLegacyState(data);
    }
    if (version < STORAGE_VERSION) {
        version = STORAGE_VERSION;
    }
    return data;
}

function convertLegacyState(legacy) {
    const story = legacy.story || [];
    const phone = legacy.phone || {};
    const chats = (phone.chats || []).map(chat => ({
        id: chat.id,
        name: chat.name,
        icon: chat.icon,
        time: chat.time,
        unread: chat.unread,
        log: chat.log || chat.messages || [],
        preview: chat.preview
    }));
    return {
        story,
        contacts: legacy.contacts || [],
        chats,
        chatOrder: chats.map(c => c.id),
        moments: phone.moments || [],
        callHistory: phone.calls || [],
        memoEntries: phone.memoLog || [],
        eventsLog: legacy.eventsLog || [],
        unread: {
            total: legacy.phone?.unreadTotal || 0,
            byApp: legacy.phone?.unreadByApp || { wechat: 0, phone: 0 }
        },
        unreadMomentsCount: legacy.unreadMomentsCount || 0,
        wallet: phone.wallet || { balance: 0, events: [] },
        blackFog: legacy.blackFog || { nodes: [] }
    };
}

function writeBackup(payload) {
    try {
        const key = `${storageKey("backupPrefix")}${Date.now()}`;
        window.localStorage.setItem(key, JSON.stringify(payload));
        pruneBackups();
    } catch (err) {
        console.warn("Failed to write backup", err);
    }
}

function pruneBackups() {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(storageKey("backupPrefix"))) {
            keys.push(key);
        }
    }
    keys.sort((a, b) => (a > b ? -1 : 1));
    keys.slice(MAX_BACKUPS).forEach(key => {
        window.localStorage.removeItem(key);
    });
}

function storageAvailable() {
    try {
        const testKey = "__world_state_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

function trimWorldStateForPersist(state) {
    if (!state || !Array.isArray(state.story)) return state;
    const MAX_STORY_SAVE = 800;
    if (state.story.length <= MAX_STORY_SAVE) return state;
    console.debug("[Storage] trim story before save", { total: state.story.length, saved: MAX_STORY_SAVE });
    return {
        ...state,
        story: state.story.slice(-MAX_STORY_SAVE)
    };
}
