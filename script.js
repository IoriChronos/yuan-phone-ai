import { getState, updateState } from "./core/state.js";
import { syncStateWithStorage } from "./core/storage.js";
import { initAIChatWindow } from "./ui/ai-chat-window.js";
import {
    initPhoneUI,
    playSpecialFloatNotification
} from "./ui/phone.js";
import { initDynamicIsland } from "./ui/dynamic-island.js";
import { initMemoApp, addMemoEntry } from "./apps/memo.js";
import { initWeChatApp, triggerWeChatNotification, triggerMomentsNotification } from "./apps/wechat.js";
import { handleIslandCallAction, triggerIncomingCall } from "./apps/phone.js";
import { setTriggerHandlers, checkTriggers } from "./core/triggers.js";
import { askAI } from "./core/ai.js";

let storyUI = null;

document.addEventListener("DOMContentLoaded", () => {
    syncStateWithStorage();
    initDynamicIsland({ onCallAction: handleIslandCallAction });
    initClock();
    initBattery();

    initMemoApp();
    initPhoneUI({
        onAppOpen: (id, label) => {
            const name = label || id;
            addMemoEntry(`打开 ${name}`);
            updateState("lastAppOpened", name);
        }
    });
    initWeChatApp();
    setTriggerHandlers({
        wechat: () => triggerWeChatNotification("剧情联动").catch(err => console.error(err)),
        call: () => triggerIncomingCall("元书 · 来电"),
        moments: () => triggerMomentsNotification().catch(err => console.error(err)),
        notify: (label) => playSpecialFloatNotification(`${label} 提醒`)
    });

    storyUI = initAIChatWindow({
        onSubmit: handleStorySubmit
    });
    hydrateStoryLog();

    window.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
            const maybe = checkTriggers(event.data);
            if (maybe && typeof maybe.then === "function") {
                maybe.catch(err => console.error(err));
            }
        }
    });
});

function hydrateStoryLog() {
    const history = getState("story") || [];
    history.forEach(entry => {
        storyUI.appendBubble(entry.role, entry.text);
    });
}

function appendStoryEntry(role, text) {
    const history = getState("story") || [];
    const next = history.slice();
    next.push({ role, text });
    updateState("story", next);
    storyUI.appendBubble(role, text);
}

async function handleStorySubmit(text) {
    appendStoryEntry("user", text);
    await checkTriggers(text);
    const reply = await askAI(`剧情输入：${text}`);
    appendStoryEntry("system", reply || "(AI 无回复)");
}

function initClock() {
    updateTime();
    setInterval(updateTime, 1000);
}

function updateTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const el = document.getElementById("sb-time");
    if (el) el.textContent = `${hh}:${mm}`;
}

function initBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(bat => {
        function updateBattery() {
            const bar = document.getElementById("bat-level");
            if (bar) bar.style.width = `${bat.level * 100}%`;
        }
        updateBattery();
        bat.onlevelchange = updateBattery;
    });
}
