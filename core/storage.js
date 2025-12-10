import { GameState, getState, updateState, subscribeState } from "./state.js";

const STORAGE_PREFIX = "yuan-phone:";
const STORAGE_PATHS = [
    "story",
    "phone.chats",
    "phone.moments",
    "phone.calls",
    "phone.wallet",
    "phone.memoLog",
    "phone.unreadByApp",
    "phone.unreadTotal"
];

let saveTimer = null;
let hasSynced = false;

function storageAvailable() {
    try {
        const testKey = "__yuan_phone_test__";
        window.localStorage.setItem(testKey, "1");
        window.localStorage.removeItem(testKey);
        return true;
    } catch (err) {
        console.warn("LocalStorage unavailable:", err);
        return false;
    }
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        saveState();
    }, 200);
}

export function saveState() {
    if (!storageAvailable()) return;
    STORAGE_PATHS.forEach((path) => {
        const value = getState(path);
        if (value === undefined) return;
        try {
            window.localStorage.setItem(`${STORAGE_PREFIX}${path}`, JSON.stringify(value));
        } catch (err) {
            console.warn("Failed to save state", path, err);
        }
    });
}

export function loadState() {
    if (!storageAvailable()) return GameState;
    STORAGE_PATHS.forEach((path) => {
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${path}`);
        if (raw == null) return;
        try {
            const value = JSON.parse(raw);
            updateState(path, value, { silent: true });
        } catch (err) {
            console.warn("Failed to parse state", path, err);
        }
    });
    return GameState;
}

export function syncStateWithStorage() {
    if (hasSynced) return;
    hasSynced = true;
    loadState();
    subscribeState(() => scheduleSave());
}
