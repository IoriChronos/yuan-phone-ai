import { updateState } from "./core/state.js";
import { syncStateWithStorage } from "./core/storage.js";
import { initAIChatWindow } from "./ui/ai-chat-window.js";
import {
    initPhoneUI,
    playSpecialFloatNotification
} from "./ui/phone.js";
import { initDynamicIsland } from "./ui/dynamic-island.js";
import { initMemoApp, addMemoEntry } from "./apps/memo.js";
import { initWeChatApp, triggerWeChatNotification, triggerMomentsNotification, refreshWeChatUI } from "./apps/wechat.js";
import { handleIslandCallAction, triggerIncomingCall, resetCallInterface } from "./apps/phone.js";
import { setTriggerHandlers, checkTriggers } from "./core/triggers.js";
import {
    generateNarrativeReply,
    getProviderOptions,
    setActiveProvider,
    getActiveProviderId
} from "./core/ai.js";
import { applyAction } from "./core/action-router.js";
import { getWorldState, addStoryMessage, subscribeWorldState, trimStoryAfter, editStoryMessage } from "./data/world-state.js";
import { resetStory, resetPhone, resetAll } from "./core/reset.js";
import { updateSystemRules, appendDynamicRule } from "./data/system-rules.js";
import { saveSnapshot, restoreSnapshot, dropSnapshotsAfter } from "./core/timeline.js";
import { getLongMemoryContextLimit, setLongMemoryContextLimit } from "./data/memory-long.js";
import { addEventLog } from "./data/events-log.js";
import { initAbyssBackground } from "./ui/abyss-bg.js";

let storyUI = null;
let storyBound = false;

document.addEventListener("DOMContentLoaded", () => {
    syncStateWithStorage();
    saveSnapshot("boot");
    initAbyssBackground();
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
        moments: (detail) => triggerMomentsNotification(detail || {}).catch(err => console.error(err)),
        notify: (label) => playSpecialFloatNotification(`${label} 提醒`)
    });

    storyUI = initAIChatWindow({
        onSubmit: handleStorySubmit,
        onSystemSubmit: handleSystemInput,
        onRestart: handleRestartRequest,
        onContinue: handleContinueRequest,
        onBubbleAction: handleBubbleAction,
        onEditMessage: handleEditMessage,
        longMemoryLimit: getLongMemoryContextLimit(),
        onLongMemoryChange: handleLongMemoryChange,
        providerOptions: getProviderOptions(),
        currentProvider: getActiveProviderId(),
        onProviderChange: handleProviderChange
    });
    hydrateStoryLog();
    bindStoryStream();

    window.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
            const maybe = checkTriggers(event.data);
            if (maybe && typeof maybe.then === "function") {
                maybe.catch(err => console.error(err));
            }
        }
    });

    window.addEventListener("timeline:overflow", () => {
        storyUI?.showTimelineToast?.("旧的快照已覆盖");
    });
});

function hydrateStoryLog() {
    const history = getWorldState().story || [];
    storyUI.replaceHistory?.(history);
}

function bindStoryStream() {
    if (storyBound) return;
    subscribeWorldState((path, detail) => {
        if (path === "story:append" && detail?.message) {
            const bubble = storyUI?.appendBubble(detail.message);
            const snapshotId = saveSnapshot(`${detail.message.role}:${Date.now()}`);
            if (snapshotId) {
                detail.message.snapshotId = snapshotId;
                storyUI?.setBubbleSnapshot?.(bubble, snapshotId);
            }
        } else if (path === "story:update" && detail?.message) {
            storyUI?.updateBubble?.(detail.message);
        }
    });
    storyBound = true;
}

async function handleStorySubmit(text) {
    addStoryMessage("user", text);
    addEventLog({ text: `玩家：${text}`, type: "story" });
    await checkTriggers(text);
    await requestAIResponse(text, { skipTriggers: true });
}

async function handleContinueRequest() {
    await requestAIResponse("继续", { skipUser: true, skipTriggers: true });
}

function handleLongMemoryChange(value) {
    setLongMemoryContextLimit(value);
}

function handleProviderChange(providerId) {
    setActiveProvider(providerId);
}

async function handleBubbleAction(action, entry) {
    if (!action || !entry) return;
    if (action === "rewind" && entry.snapshotId) {
        const restored = restoreSnapshot(entry.snapshotId);
        if (restored) {
            hydrateStoryLog();
            refreshWeChatUI();
            resetCallInterface();
            storyUI.scrollToSnapshot?.(entry.snapshotId);
        }
    } else if (action === "retry" && entry.role === "system") {
        if (trimStoryAfter(entry.id)) {
            dropSnapshotsAfter(entry.snapshotId);
            hydrateStoryLog();
            refreshWeChatUI();
            resetCallInterface();
            await requestAIResponse("重说上一句", { skipUser: true, skipTriggers: true });
        }
    }
}

async function requestAIResponse(text, options = {}) {
    if (!options.skipTriggers) {
        await checkTriggers(text);
    }
    storyUI?.beginAiReplyGroup?.();
    try {
        const action = await generateNarrativeReply(text);
        if (action) {
            applyAction(action);
        } else {
            addStoryMessage("system", "(AI 无回复)");
        }
    } catch (err) {
        console.error("AI 剧情回复失败", err);
        addStoryMessage("system", "(AI 无回复)");
    } finally {
        storyUI?.endAiReplyGroup?.();
    }
}

function handleSystemInput(raw) {
    const text = raw.trim();
    if (!text) return;
    addStoryMessage("user", text, { meta: { systemInput: true } });
    addEventLog({ text: `系统指令：${text}`, type: "system" });
    const colonIndex = text.indexOf(":");
    if (colonIndex > -1) {
        const key = text.slice(0, colonIndex).trim().toLowerCase();
        const value = text.slice(colonIndex + 1).trim();
        if (!value) return;
        if (key === "persona" || key === "world" || key === "rules") {
            updateSystemRules({ [key]: value });
            return;
        }
    }
    appendDynamicRule(text);
}

function handleRestartRequest(kind) {
    if (kind === "story") {
        resetStory();
        refreshStoryLogView();
    } else if (kind === "phone") {
        resetPhone();
        refreshWeChatUI();
        resetCallInterface();
    } else if (kind === "all") {
        resetAll();
        refreshWeChatUI();
        resetCallInterface();
    }
    refreshStoryLogView();
    refreshAbyssBackground();
}

function refreshStoryLogView() {
    if (!storyUI) return;
    const history = getWorldState().story || [];
    storyUI.replaceHistory?.(history);
}

async function handleEditMessage(entry, newText) {
    if (!entry?.id || !newText) return false;
    const success = editStoryMessage(entry.id, newText);
    if (success) {
        addEventLog({ text: `修订 AI 回复：${newText}`, type: "story" });
    }
    return success;
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

function refreshAbyssBackground() {
    const panel = document.getElementById("story-panel");
    const engine = panel?.__abyssBg;
    if (engine && typeof engine.refresh === "function") {
        engine.refresh();
    }
}
