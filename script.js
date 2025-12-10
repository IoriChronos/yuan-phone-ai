import { getState, updateState } from "./core/state.js";
import { syncStateWithStorage } from "./core/storage.js";
import { initAIChatWindow } from "./ui/ai-chat-window.js";
import {
    initPhoneUI,
    playSpecialFloatNotification
} from "./ui/phone.js";
import { initDynamicIsland } from "./ui/dynamic-island.js";
import { initMemoApp, addMemoEntry } from "./apps/memo.js";
import { initWeChatApp } from "./apps/wechat.js";
import { handleIslandCallAction } from "./apps/phone.js";
import { registerTrigger, checkTriggers } from "./core/triggers.js";
import { queryAI } from "./core/ai.js";

let storyUI = null;

document.addEventListener("DOMContentLoaded", () => {
    syncStateWithStorage();
    initDynamicIsland({ onCallAction: handleIslandCallAction });
    initClock();
    initBattery();

    initMemoApp();
    initPhoneUI({
        onAppOpen: (_, label) => addMemoEntry(`打开 ${label}`)
    });
    initWeChatApp();

    storyUI = initAIChatWindow({
        onSubmit: handleStorySubmit
    });
    hydrateStoryLog();
    registerDefaultTriggers();

    window.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
            checkTriggers(event.data);
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
    const aiResult = await queryAI(text);
    const reply = aiResult?.text || "【占位回复】暂时只是本地假对话。";
    appendStoryEntry("system", reply);
}

function registerDefaultTriggers() {
    registerTrigger("external-special", {
        match: input => input.trim() === "1",
        action: () => {
            playSpecialFloatNotification("剧情通知");
            return true;
        }
    });
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
