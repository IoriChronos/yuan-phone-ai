import { GameState, subscribeState } from "./state.js";

const STORAGE_KEY = "yuan-phone:gameState";
let saveTimer = null;
let synced = false;

function storageAvailable() {
    try {
        const key = "__yuan_phone_test__";
        window.localStorage.setItem(key, "1");
        window.localStorage.removeItem(key);
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
    try {
        const snapshot = JSON.stringify(GameState, (key, value) => {
            if (key === "phone") return undefined;
            return value;
        });
        window.localStorage.setItem(STORAGE_KEY, snapshot);
    } catch (err) {
        console.warn("Failed to persist GameState", err);
    }
}

export function loadState() {
    if (!storageAvailable()) return GameState;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return GameState;
    try {
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([key, value]) => {
            if (key === "asContext" || key === "phone") return;
            GameState[key] = value;
        });
        normalizeChats(GameState.chats);
        const chats = GameState.chats || [];
        const wechatUnread = chats.reduce((sum, chat) => sum + (chat.unread || 0), 0);
        GameState.unread.byApp.wechat = wechatUnread;
        GameState.unread.total = wechatUnread + (GameState.unread.byApp.phone || 0);
    } catch (err) {
        console.warn("Failed to parse GameState", err);
    }
    return GameState;
}

export function syncStateWithStorage() {
    if (synced) return;
    synced = true;
    loadState();
    subscribeState(() => scheduleSave());
}

function normalizeChats(list = []) {
    list.forEach(chat => {
        if (chat && !chat.log && Array.isArray(chat.messages)) {
            chat.log = chat.messages;
            delete chat.messages;
        }
        if (chat && chat.title && !chat.name) {
            chat.name = chat.title;
        }
        if (chat && !chat.preview) {
            chat.preview = computePreview(chat.log);
        }
    });
}

function computePreview(log = []) {
    if (!log.length) return "";
    const last = log[log.length - 1];
    if (last.text) return last.text;
    if (last.kind === "pay") return `转账 ¥${(last.amount || 0).toFixed(2)}`;
    if (last.kind === "red") {
        return `${last.redeemed ? "已收红包" : "红包"} ¥${(last.amount || 0).toFixed(2)}`;
    }
    return "";
}
