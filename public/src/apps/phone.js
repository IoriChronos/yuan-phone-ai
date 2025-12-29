import { getState, updateState } from "../core/state.js";
import { addShortEventMemory } from "../data/memory-short.js";
import { addEventLog } from "../data/events-log.js";
import {
    DEFAULT_ISLAND_LABEL,
    setIslandLabel,
    showIslandCallAlert,
    hideIslandCallAlert,
    triggerIslandNotify,
    collapseIslandAfterCall
} from "../ui/dynamic-island.js";

const callOverlayState = {
    container: null,
    nameEl: null,
    statusEl: null,
    timerEl: null,
    transcriptEl: null,
    endBtn: null,
    timerId: null,
    startTime: 0,
    activeName: "",
    direction: "",
    transcriptLog: [],
    transcriptTimer: null,
    historyIndex: null
};

let islandCallState = null;
let callRetryTimeout = null;

function recordCallEvent(text, meta = {}) {
    if (!text) return;
    const entry = {
        type: "call",
        app: "phone",
        text,
        meta: { ...meta },
        time: Date.now()
    };
    try {
        addShortEventMemory(entry);
    } catch (err) {
        console.warn("记录通话短期记忆失败", err);
    }
    try {
        addEventLog({ text, type: "call", time: entry.time });
    } catch (err) {
        console.warn("记录通话事件失败", err);
    }
}

function ensureCallOverlayElements() {
    if (!callOverlayState.container) {
        callOverlayState.container = document.getElementById("in-call-overlay");
        callOverlayState.nameEl = document.getElementById("in-call-name");
        callOverlayState.statusEl = document.getElementById("in-call-status");
        callOverlayState.timerEl = document.getElementById("in-call-timer");
        callOverlayState.transcriptEl = document.getElementById("in-call-transcript");
        callOverlayState.endBtn = document.getElementById("in-call-end");
        if (callOverlayState.endBtn) {
            callOverlayState.endBtn.addEventListener("click", () => {
                endCallSession("挂断");
            });
        }
    }
}

function updateCallTimerDisplay() {
    if (!callOverlayState.timerEl || !callOverlayState.startTime) return;
    const elapsed = Math.floor((Date.now() - callOverlayState.startTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    callOverlayState.timerEl.textContent = `${mm}:${ss}`;
}

function pushCallHistory(entry) {
    const calls = (getState("phone.calls") || []).slice();
    calls.unshift(entry);
    if (calls.length > 50) calls.length = 50;
    updateState("phone.calls", calls);
    return 0;
}

function updateCallHistory(index, patch = {}) {
    const calls = (getState("phone.calls") || []).slice();
    if (!calls[index]) return;
    calls[index] = { ...calls[index], ...patch };
    updateState("phone.calls", calls);
}

export function startCallSession(name, direction = "incoming", options = {}) {
    ensureCallOverlayElements();
    hideIslandCallAlert();
    if (!callOverlayState.container) return;
    callOverlayState.activeName = name;
    callOverlayState.direction = direction;
    callOverlayState.transcriptLog = [];
    const scriptLines = Array.isArray(options.scriptLines) ? options.scriptLines.filter(line => (line || "").trim()) : [];
    if (callOverlayState.transcriptEl) {
        callOverlayState.transcriptEl.innerHTML = "";
    }
    const historyIndex = typeof islandCallState?.historyIndex === "number"
        ? islandCallState.historyIndex
        : callOverlayState.historyIndex;
    callOverlayState.historyIndex = historyIndex != null ? historyIndex : pushCallHistory({ name, time: "刚刚", note: direction === "incoming" ? "来电" : "去电" });
    if (callOverlayState.historyIndex != null) {
        updateCallHistory(callOverlayState.historyIndex, { note: direction === "incoming" ? "来电 · 通话中" : "去电 · 通话中" });
    }
    if (callOverlayState.nameEl) callOverlayState.nameEl.textContent = name;
    if (callOverlayState.statusEl) {
        callOverlayState.statusEl.textContent = direction === "incoming" ? "来电 · 通话中" : "呼出 · 通话中";
    }
    callOverlayState.container.classList.add("show");
    callOverlayState.startTime = Date.now();
    updateCallTimerDisplay();
    if (callOverlayState.timerId) clearInterval(callOverlayState.timerId);
    callOverlayState.timerId = setInterval(updateCallTimerDisplay, 1000);
    setIslandLabel(`${name} · 通话中`);
    if (scriptLines.length) {
        playScriptLines(scriptLines, options.lineDelay || 900);
    }
    recordCallEvent(`${name} ${direction === "incoming" ? "接通来电" : "开始通话"}`, { direction });
}

export function endCallSession(reason = "结束通话") {
    ensureCallOverlayElements();
    if (!callOverlayState.container) return;
    callOverlayState.container.classList.remove("show");
    if (callOverlayState.timerId) {
        clearInterval(callOverlayState.timerId);
        callOverlayState.timerId = null;
    }
    stopTranscriptLoop();
    callOverlayState.startTime = 0;
    const finishedName = callOverlayState.activeName;
    const finishedDirection = callOverlayState.direction;
    if (callOverlayState.historyIndex != null) {
        updateCallHistory(callOverlayState.historyIndex, {
            note: reason,
            transcript: callOverlayState.transcriptLog || []
        });
    }
    callOverlayState.activeName = "";
    callOverlayState.direction = "";
    callOverlayState.historyIndex = null;
    callOverlayState.transcriptLog = [];
    setIslandLabel(DEFAULT_ISLAND_LABEL);
    collapseIslandAfterCall();
    recordCallEvent(`${finishedName || "未知来电"} 通话结束：${reason}`, {
        direction: finishedDirection || "unknown"
    });
}

export function handleIslandCallAction(action) {
    if (!islandCallState) return;
    const name = islandCallState.name;
    if (action === "accept") {
        startCallSession(name, "incoming");
    } else if (action === "decline") {
        const shouldRetry = islandCallState.retry;
        if (typeof islandCallState.historyIndex === "number") {
            updateCallHistory(islandCallState.historyIndex, { note: "拒接" });
        }
        hideIslandCallAlert();
        if (shouldRetry) {
            scheduleCallRetry(name);
        }
    }
    islandCallState = null;
}

function scheduleCallRetry(name, delay = 3000) {
    if (callRetryTimeout) clearTimeout(callRetryTimeout);
    callRetryTimeout = setTimeout(() => {
        triggerIncomingCall(name, false);
    }, delay);
}

export function triggerIncomingCall(name = "未知来电", retry = true) {
    const index = pushCallHistory({ name, time: "刚刚", note: "来电" });
    showIslandCallAlert(name);
    triggerIslandNotify(`来电：${name}`);
    islandCallState = { name, retry, historyIndex: index };
    setIslandLabel(name);
    recordCallEvent(`来电提醒：${name}`, { direction: "incoming" });
}

export function triggerOutgoingCall(name = "未知线路") {
    callOverlayState.historyIndex = pushCallHistory({ name, time: "刚刚", note: "去电" });
    triggerIslandNotify(`呼出：${name}`);
    startCallSession(name, "outgoing");
    recordCallEvent(`呼出：${name}`, { direction: "outgoing" });
}
function appendTranscriptLine(text, role = "npc") {
    if (!callOverlayState.transcriptEl) return;
    callOverlayState.transcriptLog = callOverlayState.transcriptLog || [];
    callOverlayState.transcriptLog.push({ role, text });
    const row = document.createElement("div");
    row.className = `transcript-row ${role}`;
    row.textContent = text;
    callOverlayState.transcriptEl.appendChild(row);
    callOverlayState.transcriptEl.scrollTop = callOverlayState.transcriptEl.scrollHeight;
}

function stopTranscriptLoop() {
    if (callOverlayState.transcriptTimer) {
        clearTimeout(callOverlayState.transcriptTimer);
        callOverlayState.transcriptTimer = null;
    }
}

function playScriptLines(lines = [], delay = 900) {
    stopTranscriptLoop();
    if (!callOverlayState.activeName) return;
    const queue = Array.isArray(lines) ? lines.filter(line => (line || "").trim()) : [];
    if (!queue.length) return;
    let idx = 0;
    const pump = () => {
        if (!callOverlayState.activeName) return;
        const line = queue[idx];
        appendTranscriptLine(line, "npc");
        idx += 1;
        if (idx < queue.length) {
            callOverlayState.transcriptTimer = setTimeout(pump, delay);
        }
    };
    pump();
}

function normalizeTranscriptLines(transcript = "") {
    return String(transcript || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
}

export function playCallTranscriptFromStory({ name = "来电", transcript = "", direction = "incoming", lineDelay = 900 } = {}) {
    const lines = normalizeTranscriptLines(transcript);
    if (!lines.length) return;
    const caller = (name || "来电").trim() || "来电";
    startCallSession(caller, direction, { scriptLines: lines, lineDelay });
    return { caller, lines: lines.length };
}

export function resetCallInterface() {
    ensureCallOverlayElements();
    if (callOverlayState.container) {
        callOverlayState.container.classList.remove("show");
    }
    stopTranscriptLoop();
    callOverlayState.startTime = 0;
    callOverlayState.activeName = "";
    callOverlayState.direction = "";
    callOverlayState.historyIndex = null;
    callOverlayState.transcriptLog = [];
    setIslandLabel(DEFAULT_ISLAND_LABEL);
    collapseIslandAfterCall();
}
