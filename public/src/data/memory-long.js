import { getWindowId, windowScopedKey } from "../core/window-context.js";

const MAX_EPISODES = 200;
const SUMMARY_CHUNK_SIZE = 20;
const DEFAULT_CONTEXT_LIMIT = 3;

let episodes = [];
let pendingEvents = [];
let contextKeyCache = null;
let contextLimit = DEFAULT_CONTEXT_LIMIT;

function contextLimitKey() {
    if (contextKeyCache) return contextKeyCache;
    try {
        contextKeyCache = windowScopedKey("yuan-phone:long-memory-limit", getWindowId());
    } catch {
        contextKeyCache = "yuan-phone:long-memory-limit";
    }
    return contextKeyCache;
}

function loadContextLimit() {
    if (typeof window === "undefined" || !window.localStorage) {
        return DEFAULT_CONTEXT_LIMIT;
    }
    const raw = window.localStorage.getItem(contextLimitKey());
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
    return DEFAULT_CONTEXT_LIMIT;
}

function persistContextLimit() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        window.localStorage.setItem(contextLimitKey(), String(contextLimit));
    } catch (err) {
        console.warn("Failed to persist long memory limit", err);
    }
}

export function setLongMemoryContextLimit(value) {
    const next = Math.max(1, Math.min(12, Number(value) || DEFAULT_CONTEXT_LIMIT));
    contextLimit = next;
    persistContextLimit();
}

export function getLongMemoryContextLimit() {
    return contextLimit;
}

export function loadLongMemory(data = {}) {
    if (Array.isArray(data)) {
        episodes = data.slice();
        pendingEvents = [];
        return;
    }
    episodes = Array.isArray(data.episodes) ? data.episodes.slice() : [];
    pendingEvents = Array.isArray(data.pending) ? data.pending.slice() : [];
    if (Number.isFinite(data.contextLimit)) {
        contextLimit = data.contextLimit;
    }
}

export function getLongMemory() {
    return {
        episodes: episodes.slice(),
        pending: pendingEvents.slice(),
        contextLimit
    };
}

export function addLongMemoryEpisode(entry) {
    if (!entry || !entry.summary) return;
    episodes.push({
        summary: entry.summary,
        timestamp: entry.timestamp || Date.now(),
        tags: entry.tags || []
    });
    if (episodes.length > MAX_EPISODES) {
        episodes.splice(0, episodes.length - MAX_EPISODES);
    }
}

export function queueEventForSummary(event) {
    if (!event) return;
    pendingEvents.push({
        text: event.text || "",
        type: event.type || "event",
        time: event.time || Date.now()
    });
    if (pendingEvents.length >= SUMMARY_CHUNK_SIZE) {
        const episode = summarizeEvents(pendingEvents.slice(0, SUMMARY_CHUNK_SIZE));
        addLongMemoryEpisode(episode);
        pendingEvents.splice(0, SUMMARY_CHUNK_SIZE);
    }
}

function summarizeEvents(events) {
    const text = events.map(e => e.text).join(" / ").slice(0, 360);
    const tags = deriveTags(events);
    return {
        summary: text ? `事件速记：${text}` : "事件速记：……",
        timestamp: events[events.length - 1]?.time || Date.now(),
        tags
    };
}

function deriveTags(events = []) {
    const tags = new Set();
    events.forEach(e => {
        if (!e?.text) return;
        if (e.text.includes("来电") || e.type === "call") tags.add("call");
        if (e.text.includes("红包") || e.text.includes("转账")) tags.add("wallet");
        if (e.text.includes("朋友圈")) tags.add("moments");
        if (e.text.includes("微信")) tags.add("wechat");
    });
    return Array.from(tags);
}

export function clearMemory() {
    episodes = [];
    pendingEvents = [];
}

export function exportLongMemoryPayload() {
    return {
        episodes: episodes.slice(),
        pending: pendingEvents.slice(),
        contextLimit
    };
}
