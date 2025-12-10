import { getWorldState, addMemoEntry as recordMemoEntry, clearMemoEntries as resetMemoEntries, subscribeWorldState } from "../data/world-state.js";

let memoListEl = null;

function formatMemoTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function getMemoList() {
    const state = getWorldState();
    return state.memoEntries || [];
}

export function renderMemoLog() {
    if (!memoListEl) return;
    const list = getMemoList();
    memoListEl.innerHTML = "";
    list.forEach(item => {
        const row = document.createElement("div");
        row.className = "memo-item";
        const span = document.createElement("span");
        span.textContent = formatMemoTime(item.time);
        const text = document.createElement("div");
        text.textContent = item.text;
        row.appendChild(span);
        row.appendChild(text);
        memoListEl.appendChild(row);
    });
}

export function addMemoEntry(text) {
    recordMemoEntry(text);
}

export function clearMemoEntries() {
    resetMemoEntries();
}

export function initMemoApp() {
    memoListEl = document.getElementById("memo-log");
    const memoClearBtn = document.getElementById("memo-clear");
    if (memoClearBtn) memoClearBtn.addEventListener("click", () => {
        clearMemoEntries();
    });
    subscribeWorldState((path) => {
        if (path.startsWith("memo")) renderMemoLog();
    });
    renderMemoLog();
}
