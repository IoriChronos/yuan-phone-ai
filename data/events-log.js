import { addSystemEvent, getWorldState } from "./world-state.js";
import { queueEventForSummary } from "./memory-long.js";

export function addEventLog(entry) {
    const normalized = normalizeEntry(entry);
    addSystemEvent(normalized);
    queueEventForSummary(normalized);
}

export function getEventsLog() {
    return (getWorldState().eventsLog || []).slice();
}

function normalizeEntry(entry) {
    if (!entry) return { text: "（空事件）", type: "system", time: Date.now() };
    if (typeof entry === "string") {
        return { text: entry, type: "system", time: Date.now() };
    }
    return {
        text: entry.text || entry.summary || "（空事件）",
        type: entry.type || "system",
        time: entry.time || Date.now()
    };
}
