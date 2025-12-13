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
import { initShoppingApp } from "./apps/shopping.js";
import { initMMOApp } from "./apps/mmo.js";
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
const abyssCooldown = {
    fog: 0,
    tentacle: 0,
    wave: 0,
    gaze: 0
};
const ABYSS_MIN_INTERVAL = {
    fog: 4500,
    tentacle: 7200,
    wave: 5200,
    gaze: 5200
};
let abyssBubbleCount = 0;
let lastAmbientAt = -3;
let abyssSilence = 0;

document.addEventListener("DOMContentLoaded", () => {
    const safe = (label, fn) => {
        try {
            return fn();
        } catch (err) {
            console.error(`[Init:${label}]`, err);
            return null;
        }
    };

    safe("storage", () => syncStateWithStorage());
    safe("snapshot", () => saveSnapshot("boot"));
    safe("abyss-bg", () => initAbyssBackground());
    safe("dynamic-island", () => initDynamicIsland({ onCallAction: handleIslandCallAction }));
    safe("clock", () => initClock());
    safe("battery", () => initBattery());

    safe("memo", () => initMemoApp());
    safe("shopping", () => initShoppingApp());
    safe("mmo", () => initMMOApp());
    safe("phone", () => initPhoneUI({
        onAppOpen: (id, label) => {
            const name = label || id;
            addMemoEntry(`打开 ${name}`);
            updateState("lastAppOpened", name);
        }
    }));
    safe("wechat", () => initWeChatApp());
    safe("triggers", () => setTriggerHandlers({
        wechat: () => triggerWeChatNotification("剧情联动").catch(err => console.error(err)),
        call: () => triggerIncomingCall("元书 · 来电"),
        moments: (detail) => triggerMomentsNotification(detail || {}).catch(err => console.error(err)),
        notify: (label) => playSpecialFloatNotification(`${label} 提醒`)
    }));

    storyUI = safe("story-ui", () => initAIChatWindow({
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
    })) || {};
    safe("story-hydrate", () => hydrateStoryLog());
    safe("story-stream", () => bindStoryStream());
    safe("story-hide-toggle", () => initStoryHideToggle());

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
            stirAbyss(detail.message);
        } else if (path === "story:update" && detail?.message) {
            storyUI?.updateBubble?.(detail.message);
        }
    });
    storyBound = true;
}

function initStoryHideToggle() {
    const panel = document.getElementById("story-panel");
    if (!panel || panel.__hideToggleBound) return;
    panel.__hideToggleBound = true;
    // 确保刷新后默认可见
    panel.classList.remove("story-hide-text");
    const handler = (ev) => {
        if (ev.target.closest(".story-bubble") || ev.target.closest("#story-input") || ev.target.closest(".story-input-bar")) return;
        panel.classList.toggle("story-hide-text");
    };
    panel.addEventListener("dblclick", handler, true);
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

function stirAbyss(entry) {
    if (!entry?.text) return;
    if (entry.role && entry.role !== "system") return;
    const engine = document.getElementById("story-panel")?.__abyssBg;
    if (!engine) return;
    if (isDialogueOnly(entry)) return;
    if (abyssSilence > 0) {
        abyssSilence = Math.max(0, abyssSilence - 1);
        return;
    }

    const text = entry.text || "";
    const denseLen = text.replace(/\s+/g, "").length;
    const now = Date.now();
    abyssBubbleCount += 1;

    const FX_TRIGGERS = {
        ambient: /(夜里|深夜|灯光|雨|下雨|窗外|天色|房间里|安静|沉默|空气|阴冷|发凉)/,
        fogDual: /(雾|云|冷了下来|冷脸|冷笑|生气)/,
        gaze: /(看着你|盯着你|目光|记录|确认|规则|记住|凝视|注视)/,
        psyche: /(呼吸变慢|喉咙发紧|意识到|察觉|没法拒绝|无法反驳|被迫|不由自主|压迫感)/,
        disorient: /(忽然|突然|不对劲|像是|仿佛|时间停了一下|脸红|羞|恍惚)/,
        jump: /(古代|烛火|灯光|后室|回廊|空房间|黄光|阳光|修仙|灵气|阵法|山门|jump)/i,
        tentacle: /(触手|缠绕|卷住|伸出|蠕|裹住)/,
        egg: /(彩蛋|符印|蛋|礼物|宝箱)/
    };

    const detectors = [
        {
            id: "jump",
            priority: 1,
            match: FX_TRIGGERS.jump.test(text),
            action: () => {
                engine.jumpBurst?.();
            }
        },
        {
            id: "tentacle",
            priority: 2,
            match: FX_TRIGGERS.tentacle.test(text) && canAwaken("tentacle", now),
            action: () => {
                const count = Math.random() > 0.5 ? 2 : 1;
                const speed = 0.8 + Math.random() * 0.6;
                const thickness = 0.8 + Math.random() * 0.9;
                engine.summonTentacle?.({ count, speed, thickness });
                markAwaken("tentacle", now);
            }
        },
        {
            id: "fog-high",
            priority: 3,
            match: FX_TRIGGERS.fogDual.test(text) && canAwaken("fog", now),
            action: () => {
                engine.fogUpper?.(0.98 + Math.random() * 0.3);
                engine.fogBase?.(1.08 + Math.random() * 0.32);
                markAwaken("fog", now);
                lastAmbientAt = abyssBubbleCount;
            }
        },
        {
            id: "gaze",
            priority: 4,
            match: FX_TRIGGERS.gaze.test(text) && canAwaken("gaze", now),
            action: () => {
                engine.predatorGaze?.((-6 + Math.random() * 12).toFixed(1));
                markAwaken("gaze", now);
            }
        },
        {
            id: "psyche",
            priority: 5,
            match: FX_TRIGGERS.psyche.test(text),
            action: () => engine.dimSurround?.(0.35 + Math.random() * 0.25)
        },
        {
            id: "egg",
            priority: 6,
            match: FX_TRIGGERS.egg.test(text) || Math.random() < 0.06,
            action: () => {
                engine.showSigil?.();
                engine.eggBurst?.();
            }
        },
        {
            id: "disorient",
            priority: 7,
            match: FX_TRIGGERS.disorient.test(text),
            action: () => engine.glitchFlash?.()
        }
    ];

    const triggerAmbient = (FX_TRIGGERS.ambient.test(text) || denseLen >= 45) && (abyssBubbleCount - lastAmbientAt >= 3);

    detectors.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    let used = 0;
    for (const detector of detectors) {
        if (used >= 3) break;
        if (detector.match && detector.action) {
            detector.action();
            used += 1;
            if (detector.id === "jump") break;
        }
    }

    if (used === 0 && triggerAmbient && canAwaken("fog", now)) {
        const power = 1 + Math.random() * 0.2;
        engine.fogBase?.(power);
        markAwaken("fog", now);
        lastAmbientAt = abyssBubbleCount;
    }
}

function canAwaken(key, now) {
    const last = abyssCooldown[key] || 0;
    return now - last > (ABYSS_MIN_INTERVAL[key] || 4000);
}

function markAwaken(key, now) {
    abyssCooldown[key] = now;
}

function isDialogueOnly(entry) {
    if (entry?.meta?.storyType === "dialogue") return true;
    const text = entry?.text || "";
    return /^#?D\b/m.test(text);
}
