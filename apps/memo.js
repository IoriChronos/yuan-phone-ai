import { getState, updateState } from "../core/state.js";

const MAX_MEMO = 50;
let memoListEl = null;

function formatMemoTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function getMemoList() {
    return getState("phone.memoLog") || [];
}

function setMemoList(list) {
    updateState("phone.memoLog", list);
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
    if (!text) return;
    const list = getMemoList().slice();
    list.unshift({ text, time: new Date().toISOString() });
    if (list.length > MAX_MEMO) list.length = MAX_MEMO;
    setMemoList(list);
    renderMemoLog();
}

export function clearMemoEntries() {
    setMemoList([]);
    renderMemoLog();
}

export function initMemoApp() {
    memoListEl = document.getElementById("memo-log");
    const memoClearBtn = document.getElementById("memo-clear");
    if (memoClearBtn) memoClearBtn.addEventListener("click", clearMemoEntries);
    renderMemoLog();
}
