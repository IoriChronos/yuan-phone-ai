import { addMemoEntry } from "./memo.js";
import { getState, updateState } from "../core/state.js";
import {
    DEFAULT_ISLAND_LABEL,
    setIslandLabel,
    showIslandCallAlert,
    hideIslandCallAlert,
    triggerIslandNotify
} from "../ui/dynamic-island.js";

const callOverlayState = {
    container: null,
    nameEl: null,
    statusEl: null,
    timerEl: null,
    endBtn: null,
    timerId: null,
    startTime: 0,
    activeName: "",
    direction: ""
};

let islandCallState = null;
let callRetryTimeout = null;

function ensureCallOverlayElements() {
    if (!callOverlayState.container) {
        callOverlayState.container = document.getElementById("in-call-overlay");
        callOverlayState.nameEl = document.getElementById("in-call-name");
        callOverlayState.statusEl = document.getElementById("in-call-status");
        callOverlayState.timerEl = document.getElementById("in-call-timer");
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
}

export function startCallSession(name, direction = "incoming") {
    ensureCallOverlayElements();
    hideIslandCallAlert();
    if (!callOverlayState.container) return;
    callOverlayState.activeName = name;
    callOverlayState.direction = direction;
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
}

export function endCallSession(reason = "结束通话") {
    ensureCallOverlayElements();
    if (!callOverlayState.container) return;
    callOverlayState.container.classList.remove("show");
    if (callOverlayState.timerId) {
        clearInterval(callOverlayState.timerId);
        callOverlayState.timerId = null;
    }
    callOverlayState.startTime = 0;
    if (callOverlayState.activeName) {
        addMemoEntry(`${reason} · ${callOverlayState.activeName}`);
    }
    callOverlayState.activeName = "";
    callOverlayState.direction = "";
    setIslandLabel(DEFAULT_ISLAND_LABEL);
}

export function handleIslandCallAction(action) {
    if (!islandCallState) return;
    const name = islandCallState.name;
    if (action === "accept") {
        addMemoEntry(`接听来电 ← ${name}`);
        startCallSession(name, "incoming");
        islandCallState = null;
    } else if (action === "decline") {
        addMemoEntry(`拒绝来电 ← ${name}`);
        const shouldRetry = islandCallState.retry;
        islandCallState = null;
        hideIslandCallAlert();
        if (shouldRetry) {
            scheduleCallRetry(name);
        }
    }
}

function scheduleCallRetry(name, delay = 3000) {
    if (callRetryTimeout) clearTimeout(callRetryTimeout);
    callRetryTimeout = setTimeout(() => {
        triggerIncomingCall(name, false);
    }, delay);
}

export function triggerIncomingCall(name = "未知来电", retry = true) {
    pushCallHistory({ name, time: "刚刚", note: "来电" });
    showIslandCallAlert(name);
    triggerIslandNotify(`来电：${name}`);
    addMemoEntry(`来电 ← ${name}`);
    islandCallState = { name, retry };
    setIslandLabel(name);
}

export function triggerOutgoingCall(name = "未知线路") {
    pushCallHistory({ name, time: "刚刚", note: "去电" });
    addMemoEntry(`呼出 → ${name}`);
    triggerIslandNotify(`呼出：${name}`);
    startCallSession(name, "outgoing");
}
