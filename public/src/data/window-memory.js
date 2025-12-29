import { getWindowId, resolveWindowId, windowScopedKey } from "../core/window-context.js";

// Window-scoped memory store. Three layers:
// - rawCache: verbatim recent narrator replies (non-editable) + optional opener fragment on首轮
// - stm: short-term memory summary (editable, summarizer产出)
// - ltm/persona: consolidated long-term memories (editable)

const STORAGE_KEY = "yuan-phone:window-memory";
const RAW_REPLY_LIMIT_KEY = "yuan-phone:raw-replies-limit";
const DEFAULT_RAW_REPLY_LIMIT = 3;
const RAW_REPLY_LIMIT_MAX = 20;

function storage() {
    if (typeof window === "undefined") return null;
    return window.localStorage || null;
}

function scopedKey(base, windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    return windowScopedKey(base, scoped);
}

function readMap() {
    const store = storage();
    if (!store) return {};
    try {
        const raw = store.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeMap(map) {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(map || {}));
    } catch {
        /* ignore persistence errors */
    }
}

function defaultWindowState() {
    return {
        stm: "",
        ltm: "",
        persona: "",
        rawCache: [],
        windowUserPersonaOverride: "",
        windowUserRefOverride: "",
        windowUserNameOverride: "",
        windowUserGenderOverride: "",
        windowUserHeightOverride: "",
        pendingPhoneEvents: [],
        stmAuto: false,
        ltmAuto: false,
        personaAuto: false,
        openingText: "",
        isFirstTurn: true,
        hasLTM: false,
        matcherEnabled: false
    };
}

function loadWindowState(windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const map = readMap();
    const saved = map[scoped] || {};
    return { ...defaultWindowState(), ...saved };
}

function saveWindowState(windowId, data) {
    if (!windowId) return;
    const scoped = resolveWindowId(windowId);
    const map = readMap();
    const next = {
        ...defaultWindowState(),
        ...(map[scoped] || {}),
        ...data
    };
    next.pendingPhoneEvents = Array.isArray(next.pendingPhoneEvents) ? next.pendingPhoneEvents.slice(0, 100) : [];
    next.rawCache = Array.isArray(next.rawCache) ? next.rawCache.slice() : [];
    map[scoped] = next;
    writeMap(map);
}

export function getRawReplyLimit(windowId = null) {
    const store = storage();
    if (!store) return DEFAULT_RAW_REPLY_LIMIT;
    try {
        const raw = store.getItem(scopedKey(RAW_REPLY_LIMIT_KEY, windowId));
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) {
            return Math.min(RAW_REPLY_LIMIT_MAX, Math.max(1, num));
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_RAW_REPLY_LIMIT;
}

export function setRawReplyLimit(value, windowId = null) {
    const store = storage();
    if (!store) return;
    const safe = Math.max(1, Math.min(RAW_REPLY_LIMIT_MAX, Number(value) || DEFAULT_RAW_REPLY_LIMIT));
    try {
        store.setItem(scopedKey(RAW_REPLY_LIMIT_KEY, windowId), String(safe));
    } catch {
        /* ignore */
    }
}

export function getSTM(windowId = null) {
    return loadWindowState(windowId).stm || "";
}

export function setSTM(text, windowId = null, options = {}) {
    const state = loadWindowState(windowId);
    const scoped = resolveWindowId(windowId || getWindowId?.());
    saveWindowState(scoped, {
        ...state,
        stm: text || "",
        stmAuto: Boolean(options.auto)
    });
    return text || "";
}

export function getLTM(windowId = null) {
    return loadWindowState(windowId).ltm || "";
}

export function setLTM(text, windowId = null, options = {}) {
    const state = loadWindowState(windowId);
    const scoped = resolveWindowId(windowId || getWindowId?.());
    saveWindowState(scoped, {
        ...state,
        ltm: text || "",
        ltmAuto: Boolean(options.auto),
        hasLTM: Boolean(text || state.hasLTM)
    });
    return text || "";
}

export function getPersonaMemoryText(windowId = null) {
    return loadWindowState(windowId).persona || "";
}

export function setPersonaMemoryText(text, windowId = null, options = {}) {
    const state = loadWindowState(windowId);
    const scoped = resolveWindowId(windowId || getWindowId?.());
    saveWindowState(scoped, {
        ...state,
        persona: text || "",
        personaAuto: Boolean(options.auto)
    });
    return text || "";
}

export function appendPendingPhoneEvent(event, windowId = null) {
    if (!event) return;
    const state = loadWindowState(windowId);
    const list = Array.isArray(state.pendingPhoneEvents) ? state.pendingPhoneEvents.slice() : [];
    const payload = {
        text: event.text || event.summary || "",
        type: event.type || "phone",
        time: event.time || Date.now()
    };
    list.push(payload);
    saveWindowState(resolveWindowId(windowId || getWindowId?.()), { ...state, pendingPhoneEvents: list.slice(-50) });
}

export function takePhoneDigest(windowId = null) {
    const state = loadWindowState(windowId);
    const items = Array.isArray(state.pendingPhoneEvents) ? state.pendingPhoneEvents.slice() : [];
    const digest = buildPhoneDigest(items);
    saveWindowState(resolveWindowId(windowId || getWindowId?.()), { ...state, pendingPhoneEvents: [] });
    return digest;
}

export function peekPendingPhoneEvents(windowId = null) {
    const state = loadWindowState(windowId);
    return Array.isArray(state.pendingPhoneEvents) ? state.pendingPhoneEvents.slice() : [];
}

function buildPhoneDigest(items = []) {
    if (!items.length) return [];
    return items.slice(-10).map(item => {
        const label = item.type || "event";
        return `[${label}] ${item.text || "（空）"}`;
    });
}

export function regenerateSTM(windowId = null, phoneDigest = []) {
    // Deprecated placeholder; real regeneration is handled by memory-engine summarizer.
    const state = loadWindowState(windowId);
    return state.stm || "";
}

export function consolidateLTM(windowId = null) {
    const state = loadWindowState(windowId);
    return { ltm: state.ltm || "", persona: state.persona || "" };
}

export function commitNarrativeMemory(windowId = null, phoneDigest = []) {
    const state = loadWindowState(windowId);
    const stm = state.stm || "";
    saveWindowState(resolveWindowId(windowId || getWindowId?.()), { ...state, stm, pendingPhoneEvents: phoneDigest || [] });
}

export function exportWindowBundle(windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    return {
        windowId: scoped,
        providerId: null,
        memory: state,
        worldState: null
    };
}

export function importWindowBundle(bundle) {
    if (!bundle || !bundle.windowId) return false;
    const scoped = resolveWindowId(bundle.windowId);
    const memory = bundle.memory || {};
    saveWindowState(scoped, {
        stm: memory.stm || "",
        ltm: memory.ltm || "",
        persona: memory.persona || "",
        rawCache: Array.isArray(memory.rawCache) ? memory.rawCache.slice() : [],
        pendingPhoneEvents: memory.pendingPhoneEvents || [],
        stmAuto: Boolean(memory.stmAuto),
        ltmAuto: Boolean(memory.ltmAuto),
        personaAuto: Boolean(memory.personaAuto),
        openingText: memory.openingText || "",
        isFirstTurn: typeof memory.isFirstTurn === "boolean" ? memory.isFirstTurn : true,
        matcherEnabled: Boolean(memory.matcherEnabled),
        hasLTM: Boolean(memory.hasLTM)
    });
    // worldState hydration is handled elsewhere; keep this focused on memory bundle.
    return true;
}

export function getRawReplies(windowId = null, limit = null) {
    const state = loadWindowState(windowId);
    const raw = Array.isArray(state.rawCache) ? state.rawCache.slice() : [];
    const take = Number.isFinite(limit) && limit > 0 ? limit : getRawReplyLimit(windowId);
    return raw.slice(-take);
}

export function pushRawReply(text, windowId = null) {
    if (!text) return getRawReplies(windowId);
    const state = loadWindowState(windowId);
    const cache = Array.isArray(state.rawCache) ? state.rawCache.slice() : [];
    cache.push(text);
    const limit = getRawReplyLimit(windowId);
    const trimmed = cache.slice(-Math.max(1, limit));
    saveWindowState(resolveWindowId(windowId || getWindowId?.()), { ...state, rawCache: trimmed });
    return trimmed;
}

export function getRawContextCache(windowId = null, options = {}) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const includeOpening = options.includeOpening === true;
    const state = loadWindowState(scoped);
    const base = Array.isArray(state.rawCache) ? state.rawCache.slice() : [];
    if (!includeOpening) return base;
    const opening = (state.openingText || "").trim();
    if (!opening) return base;
    return [`[开场白]\n${opening}`, ...base];
}

export function getMemoryAutoFlags(windowId = null) {
    const state = loadWindowState(windowId);
    return {
        stmAuto: Boolean(state.stmAuto),
        ltmAuto: Boolean(state.ltmAuto),
        personaAuto: Boolean(state.personaAuto)
    };
}

export function getHasLTM(windowId = null) {
    const state = loadWindowState(windowId);
    return Boolean(state.hasLTM) || Boolean((state.ltm || "").trim());
}

export function getMatcherEnabled(windowId = null) {
    const state = loadWindowState(windowId);
    return Boolean(state.matcherEnabled);
}

export function setMatcherEnabled(enabled, windowId = null) {
    const state = loadWindowState(windowId);
    const scoped = resolveWindowId(windowId || getWindowId?.());
    saveWindowState(scoped, { ...state, matcherEnabled: Boolean(enabled) });
    return Boolean(enabled);
}

export function getWindowUserPersonaOverride(windowId = null, fallback = "") {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const existing = state.windowUserPersonaOverride || "";
    if (existing) return existing;
    return fallback || "";
}

export function setWindowUserPersonaOverride(text, windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const value = (text || "").trim();
    saveWindowState(scoped, { ...state, windowUserPersonaOverride: value });
    return value;
}

export function getWindowUserNameOverride(windowId = null, fallback = "") {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const existing = state.windowUserNameOverride || "";
    if (existing) return existing;
    return fallback || "";
}

export function getWindowUserGenderOverride(windowId = null, fallback = "") {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const existing = state.windowUserGenderOverride || "";
    if (existing) return existing;
    return fallback || "";
}

export function getWindowUserHeightOverride(windowId = null, fallback = "") {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const existing = state.windowUserHeightOverride || "";
    if (existing) return existing;
    return fallback || "";
}

export function getWindowUserRefOverride(windowId = null, fallback = "") {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const existing = state.windowUserRefOverride || "";
    if (existing) return existing;
    return fallback || "";
}

export function setWindowUserIdentityOverride({ name = "", gender = "", height = "", ref = "" } = {}, windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const next = {
        ...state,
        windowUserNameOverride: (name || "").trim(),
        windowUserGenderOverride: (gender || "").trim(),
        windowUserHeightOverride: (height || "").trim(),
        windowUserRefOverride: (ref || "").trim()
    };
    saveWindowState(scoped, next);
    return {
        name: next.windowUserNameOverride,
        gender: next.windowUserGenderOverride,
        height: next.windowUserHeightOverride,
        ref: next.windowUserRefOverride
    };
}

export function resetWindowMemory(windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const current = loadWindowState(scoped);
    const base = defaultWindowState();
    const next = {
        ...base,
        openingText: current.openingText || "",
        windowUserPersonaOverride: current.windowUserPersonaOverride || "",
        windowUserNameOverride: current.windowUserNameOverride || "",
        windowUserGenderOverride: current.windowUserGenderOverride || "",
        windowUserHeightOverride: current.windowUserHeightOverride || "",
        windowUserRefOverride: current.windowUserRefOverride || ""
    };
    saveWindowState(scoped, next);
    return next;
}

export function resetWindowMemoryForStory(windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const current = loadWindowState(scoped);
    const base = defaultWindowState();
    const next = {
        ...base,
        openingText: current.openingText || "",
        windowUserPersonaOverride: current.windowUserPersonaOverride || "",
        windowUserNameOverride: current.windowUserNameOverride || "",
        windowUserGenderOverride: current.windowUserGenderOverride || "",
        windowUserHeightOverride: current.windowUserHeightOverride || "",
        isFirstTurn: true
    };
    saveWindowState(scoped, next);
    return next;
}

export function setOpeningText(text, windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    const opening = (text || "").trim();
    if (!opening) return state.openingText || "";
    saveWindowState(scoped, { ...state, openingText: opening });
    return opening;
}

export function getOpeningText(windowId = null) {
    const state = loadWindowState(windowId);
    return state.openingText || "";
}

export function getIsFirstTurn(windowId = null) {
    const state = loadWindowState(windowId);
    return Boolean(state.isFirstTurn);
}

export function setIsFirstTurn(value, windowId = null) {
    const scoped = resolveWindowId(windowId || getWindowId?.());
    const state = loadWindowState(scoped);
    saveWindowState(scoped, { ...state, isFirstTurn: Boolean(value) });
    return Boolean(value);
}
