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
import { handleIslandCallAction, triggerIncomingCall, resetCallInterface, playCallTranscriptFromStory } from "./apps/phone.js";
import { setTriggerHandlers, checkTriggers } from "./core/triggers.js";
import {
    getProviderOptions,
    setActiveProvider,
    getActiveProviderId,
    getNarratorModelOptions,
    getActiveNarratorModel,
    setActiveNarratorModel,
    generateNarrativeReply,
    runInitializer
} from "./core/ai.js";
import { applyAction } from "./core/action-router.js";
import { getWorldState, addStoryMessage, subscribeWorldState, trimStoryAfter, editStoryMessage, attachSnapshot, applyInitializerState } from "./data/world-state.js";
import { resetStory, resetPhone, resetAll } from "./core/reset.js";
import { updateSystemRules, appendDynamicRule, getGlobalUserName, getGlobalUserPersona } from "./data/system-rules.js";
import { saveSnapshot, restoreSnapshot, dropSnapshotsAfter, syncSnapshotsWithStory, getSnapshots, getSnapshotById } from "./core/timeline.js";
import { addEventLog } from "./data/events-log.js";
import { initAbyssBackground } from "./ui/abyss-bg.js";
import { initCharacterProfile } from "./ui/character-profile.js";
import { saveSlot, loadSlot, deleteSlot, listSlots } from "./data/save-slots.js";
import { saveRoleTemp, loadRoleTemp, peekRoleTemp, clearRoleTemp } from "./data/role-temp.js";
import { getActiveCard, listCharacterCards, upsertCharacterCard, setActiveCard, GENERIC_OPENER, bindCardToWindow } from "./data/character-cards.js";
import { getRawReplyLimit, setRawReplyLimit, pushRawReply, setOpeningText, setIsFirstTurn, getWindowUserPersonaOverride, getOpeningText } from "./data/window-memory.js";
import { getWindowId, getWindowOverrides, setWindowOverrides } from "./core/window-context.js";
import { updateMemoriesAfterNarrator, appendNarratorToSTM, recalculateWindowMemory } from "./core/memory-engine.js";
import { saveToast } from "./core/save-feedback.js";
import { enforceComponentLayer, observeComponentLayer } from "./core/component-layer.js";

if (typeof window !== "undefined" && window.__SHELL_HOSTED__) {
    document.body?.classList?.add("shell-hosted");
}

let storyUI = null;
let storyBound = false;
let activeShellRoleId = null;
const abyssCooldown = {
    fog: 0,
    tentacle: 0,
    wave: 0,
    gaze: 0
};
const ABYSS_MIN_INTERVAL = {
    fog: 4500,
    tentacle: 1000, // 触手触发冷却改为 1s
    wave: 5200,
    gaze: 5200
};
let abyssBubbleCount = 0;
let lastAmbientAt = -3;
let abyssSilence = 0;
let aiInFlight = false;
let initInFlight = false;
let initOverlay = null;
let initButton = null;
let initStatusEl = null;
let initStartButton = null;
let initCancelButton = null;
let initDismissed = false;
let activePlaceholderId = null;
let activePlaceholderWindowId = null;
let generationId = 0;
let activePlaceholderVariant = null;
const LOCAL_WINDOW_ID = safeWindowId();
let phoneActionGuardBound = false;
let activeRequestId = null;
let activeGeneration = null;
const allowedSnapshots = new Set();
const aiSnapshotQueue = [];
const PLACEHOLDER_VARIANTS = [
    {
        id: "calm-sync",
        texts: ["（ •• ）   注视中", "（ •• ）   世界同步中"]
    },
    {
        id: "alert-link",
        texts: ["（ •‿• ）✦ 连接中", "▮ ▯ ▮   连接中"]
    }
];
const PLACEHOLDER_FALLBACK = "（ •• ）   世界同步中";
const FAILURE_FALLBACK = "这一次没有回应。";
const FAILURE_ALT = "似乎出了点问题。";
const LOCAL_EMPTY_FALLBACK = "【LOCAL-OLLAMA】(empty output)";
let sendButtonDefaultText = null;
let lastUserMessageId = null;
let resendControl = null;
const CONTAMINATION_PATTERNS = [
    /SYSTEM RULES/i,
    /RAW CONTEXT/i,
    /MEMORY MATCHER/i,
    /WINDOW\s*>\s*CHARACTER\s*>\s*GLOBAL/i,
    /\[System Rules\]/i
];
const handledCallMessages = new Set();
let initState = {
    status: "idle",
    payload: null
};

function isNarratorTextContaminated(text = "") {
    if (!text) return false;
    return CONTAMINATION_PATTERNS.some(rx => rx.test(text));
}

function sanitizeNarratorTextForMemory(text = "") {
    if (!text) return "";
    return String(text)
        .replace(/【CALL_START】/g, "")
        .replace(/【CALL_END】/g, "")
        .trim();
}

try {
    const initialCard = getActiveCard();
    if (initialCard?.id) {
        bindCardToWindow(safeWindowId(), initialCard.id);
    }
} catch {
    /* ignore binding errors */
}

document.addEventListener("DOMContentLoaded", () => {
    const safe = (label, fn) => {
        try {
            return fn();
        } catch (err) {
            console.error(`[Init:${label}]`, err);
            return null;
        }
    };

    enforceComponentLayer(document.body);
    observeComponentLayer(document.body);

    safe("storage", () => syncStateWithStorage());
    safe("abyss-bg", () => initAbyssBackground());
    safe("dynamic-island", () => initDynamicIsland({ onCallAction: handleIslandCallAction }));
    safe("clock", () => initClock());
    safe("battery", () => initBattery());
    const profileUI = safe("character-profile", () => initCharacterProfile(
        document.getElementById("story-header"),
        document.getElementById("character-sheet"),
        { onRoleChange: handleRoleChange, onRoleUpdate: updateRoleLabel }
    ));

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
    safe("triggers", () => {
        setTriggerHandlers({
            wechat: () => triggerWeChatNotification("剧情联动").catch(err => console.error(err)),
            call: () => {
                const allowYuanShu = (getGlobalUserName() || "").trim() === "沈安亦";
                const caller = allowYuanShu ? "元书 · 来电" : "未知来电";
                triggerIncomingCall(caller);
            },
            moments: (detail) => triggerMomentsNotification(detail || {}).catch(err => console.error(err)),
            notify: (label) => playSpecialFloatNotification(`${label} 提醒`)
        });
    });

    storyUI = safe("story-ui", () => initAIChatWindow({
        onSubmit: handleStorySubmit,
        onSystemSubmit: handleSystemInput,
        onRestart: handleRestartRequest,
        onContinue: handleContinueRequest,
        onBubbleAction: handleBubbleAction,
        onEditMessage: handleEditMessage,
        getEditSeed: (entry) => entry?.text || "",
        longMemoryLimit: getRawReplyLimit(LOCAL_WINDOW_ID),
        onLongMemoryChange: handleLongMemoryChange,
        rawCacheLimit: getRawReplyLimit(LOCAL_WINDOW_ID),
        onRawCacheChange: handleRawCacheChange,
        providerOptions: getProviderOptions(),
        currentProvider: getActiveProviderId(),
        narratorModelOptions: getNarratorModelOptions(),
        currentNarratorModel: getActiveNarratorModel(),
        onProviderChange: handleProviderChange,
        onNarratorModelChange: handleNarratorModelChange,
        isSnapshotAllowed: (snapshotId) => allowedSnapshots.has(snapshotId),
        onToggleProfile: (open) => {
            if (!profileUI) return;
            if (open) profileUI.show?.();
            else profileUI.hide?.();
        }
    })) || {};
    safe("story-hydrate", () => hydrateStoryLog());
    safe("story-stream", () => bindStoryStream());
    safe("story-hide-toggle", () => initStoryHideToggle());
    safe("phone-guard", () => bindPhoneActionGuard());
    updateRoleLabel();
    showRestoreHint("");
    safe("memory-recalc", () => recalculateWindowMemory(LOCAL_WINDOW_ID));

    window.addEventListener("message", (event) => {
        if (event?.data?.type === "shell-chat-init" && event.data.role) {
            const title = document.getElementById("story-title-text") || document.querySelector(".story-title");
            if (title) title.textContent = event.data.role;
            if (event.data.roleId) {
                activeShellRoleId = event.data.roleId;
                try { window.__SHELL_ROLE_ID__ = event.data.roleId; } catch { /* ignore */ }
            }
            if (event.data.windowId) {
                try {
                    bindCardToWindow(event.data.windowId, event.data.roleId || activeShellRoleId || getActiveCard().id);
                } catch {
                    /* ignore */
                }
            }
        }
        if (event?.data?.type === "shell-opening" && event.data.text) {
            playShellOpening(event.data.text);
        }
        if (event?.data?.type === "shell-role-sync" && event.data.role) {
            const synced = syncShellRole(event.data.role, event.data.globalRules, event.data.globalProfile);
            if (synced?.id) activeShellRoleId = synced.id;
        }
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

    Object.assign(window, {
        saveSlot,
        loadSlot,
        deleteSlot,
        listSlots
    });
});

window.addEventListener("pagehide", () => abortActiveGeneration("unload"));
window.addEventListener("beforeunload", () => abortActiveGeneration("unload"));

function hydrateStoryLog() {
    const history = getWorldState().story || [];
    const MAX_RENDERED_HISTORY = 400;
    const visibleHistory = history.length > MAX_RENDERED_HISTORY
        ? history.slice(-MAX_RENDERED_HISTORY)
        : history;
    if (history.length > visibleHistory.length) {
        console.debug("[Story] trim history for UI", { total: history.length, rendered: visibleHistory.length });
    }
    const latestUser = getLastUserEntry(visibleHistory);
    if (latestUser?.id) lastUserMessageId = latestUser.id;
    storyUI.replaceHistory?.(visibleHistory);
    seedAllowedSnapshots(visibleHistory);
    updateInitializerButton();
}

function updateRoleLabel() {
    const override = typeof window !== "undefined" ? window.__YUAN_ROLE_NAME__ : "";
    const active = getActiveCard();
    const name = override || active?.name || "角色";
    const title = document.getElementById("story-title-text") || document.querySelector(".story-title");
    if (title) title.textContent = name;
}

function syncShellRole(role = {}, globalRules = "", globalProfile = "") {
    const card = upsertCharacterCard({
        id: role.id || role.roleId || "default",
        name: role.name || "未命名角色",
        bio: role.bio || "这一段是简介",
        publicProfile: role.publicProfile || role.bio || "",
        opener: role.opener || GENERIC_OPENER,
        sex: role.sex || role.gender || "男",
        aboSub: role.aboSub || "",
        height: role.height || "",
        species: role.species || "人",
        appearance: role.appearance || "",
        personality: role.personality || "",
        personaStyle: role.personaStyle || role.persona || "",
        background: role.background || role.worldview || role.worldLore || "",
        family: role.family || "",
        aiProfile: role.aiProfile || role.profile || "",
        replyRules: role.replyRules || role.rules || globalRules || ""
    });
    if (globalRules || globalProfile) {
        updateSystemRules({
            globalSystemRules: globalRules || "",
            globalUserPersona: globalProfile || ""
        });
    }
    setActiveCard(card.id);
    updateRoleLabel();
    try {
        window.__SHELL_ROLE_ID__ = card.id;
        window.__SHELL_GLOBAL_RULES__ = globalRules || "";
        window.__SHELL_GLOBAL_PROFILE__ = globalProfile || "";
    } catch {
        /* ignore */
    }
    return card;
}

function showRestoreHint(text) {
    const el = document.getElementById("role-restore-hint");
    if (!el) return;
    el.textContent = text || "";
    el.style.display = text ? "inline-flex" : "none";
}

function getCardNameById(id) {
    if (!id) return "角色";
    try {
        const list = listCharacterCards?.() || [];
        const found = list.find(item => item.id === id);
        return found?.name || "角色";
    } catch {
        return "角色";
    }
}

function handleRoleChange(prevId, nextId) {
    if (!nextId) return;
    if (prevId && prevId !== nextId) {
        const prevName = getCardNameById(prevId);
        saveRoleTemp(prevId, { roleName: prevName });
        storyUI?.showTimelineToast?.(`已暂存 ${prevName} 的上次聊天`);
        showRestoreHint(`上次聊天 · ${prevName} 已暂存`);
    }
    const restored = loadRoleTemp(nextId);
    if (restored) {
        hydrateStoryLog();
        refreshWeChatUI();
        resetCallInterface();
        refreshAbyssBackground();
        const nextName = getCardNameById(nextId);
        storyUI?.showTimelineToast?.(`上次聊天 · ${nextName} 已恢复`);
        showRestoreHint(`上次聊天 · ${nextName}`);
        clearRoleTemp();
    } else {
        resetAll();
        refreshStoryLogView();
        refreshWeChatUI();
        resetCallInterface();
        refreshAbyssBackground();
        showRestoreHint("");
    }
    updateRoleLabel();
}

function initQuickInputBar() {
    const row = document.getElementById("story-input-row");
    const input = document.getElementById("story-input");
    if (!row || !input) return;
    if (document.getElementById("story-input-quickbar")) return;
    const bar = document.createElement("div");
    bar.id = "story-input-quickbar";
    const presets = [
        { label: "叙述", text: "#N " },
        { label: "动作", text: "#A " },
        { label: "对白", text: "#D " },
        { label: "旁白", text: "#S " }
    ];
    presets.forEach(preset => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = preset.label;
        btn.addEventListener("click", () => {
            insertAtCursor(input, preset.text);
            input.focus();
        });
        bar.appendChild(btn);
    });
    row.insertBefore(bar, row.firstChild);
}

function insertAtCursor(el, text) {
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = `${before}${text}${after}`;
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
}

function bindStoryStream() {
    if (storyBound) return;
    subscribeWorldState((path, detail) => {
    if (path === "story:append" && detail?.message) {
        const message = detail.message;
        const bubble = storyUI?.appendBubble(message);
        const isNarrator = message.role === "system"
            && message.meta?.narrator
                && message.meta?.windowId === LOCAL_WINDOW_ID
                && !message.meta?.placeholder
                && !message.meta?.error;
            if (isNarrator && message.snapshotId) {
                storyUI?.setBubbleSnapshot?.(bubble, message.snapshotId);
                registerAiSnapshot(message.snapshotId);
            }
            if (!message.meta?.placeholder && !message.meta?.error) {
                stirAbyss(message);
            }
            maybeHandleCallTranscript(message);
        } else if (path === "story:update" && detail?.message) {
            const message = detail.message;
            const bubble = storyUI?.updateBubble?.(message);
            const isNarrator = message.role === "system"
                && message.meta?.narrator
                && message.meta?.windowId === LOCAL_WINDOW_ID
                && !message.meta?.placeholder
                && !message.meta?.error;
            if (isNarrator && message.snapshotId) {
                storyUI?.setBubbleSnapshot?.(bubble, message.snapshotId);
                registerAiSnapshot(message.snapshotId);
            }
            if (!message.meta?.placeholder && !message.meta?.error) {
                stirAbyss(message);
            }
            maybeHandleCallTranscript(message);
        } else if (path === "story:trim") {
            refreshStoryLogView();
        }
        syncSnapshotsToVisibleHistory();
        broadcastWindowSummary("story-change");
        updateInitializerButton();
    });
    storyBound = true;
}

function seedAllowedSnapshots(source = []) {
    allowedSnapshots.clear();
    aiSnapshotQueue.length = 0;
    const history = Array.isArray(source) ? source : getWorldState().story || [];
    history
        .filter(item =>
            item.role === "system"
            && item.snapshotId
            && item.meta?.narrator
            && (item.meta?.windowId ? item.meta.windowId === LOCAL_WINDOW_ID : true)
            && !(item.meta?.placeholder)
            && !(item.meta?.error)
        )
        .slice(-20)
        .forEach(item => {
            allowedSnapshots.add(item.snapshotId);
            aiSnapshotQueue.push(item.snapshotId);
        });
}

function bindGentleDoubleTap(target, handler) {
    if (!target || typeof handler !== "function") return;
    let lastTap = 0;
    let lastPos = null;
    const timeLimit = 420;
    const moveLimit = 22;
    const onPointerUp = (ev) => {
        if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
        const now = Date.now();
        const pos = { x: ev.clientX || 0, y: ev.clientY || 0 };
        const withinTime = now - lastTap < timeLimit;
        const withinMove = lastPos ? Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < moveLimit : false;
        if (withinTime && withinMove) {
            lastTap = 0;
            lastPos = null;
            handler(ev);
            return;
        }
        lastTap = now;
        lastPos = pos;
    };
    target.addEventListener("pointerup", onPointerUp, { passive: true, capture: true });
}

function countAiReplies(windowId = LOCAL_WINDOW_ID) {
    const snapshots = (getSnapshots?.() || []).filter(snap => !snap.windowId || snap.windowId === windowId);
    const aiSnaps = snapshots.filter(snap => (snap.kind || snap.type) === "ai_reply");
    return aiSnaps.length;
}

function computeWindowSummaryLocal(windowId = LOCAL_WINDOW_ID) {
    const history = getWorldState().story || [];
    const scoped = history.filter(entry => {
        const scopedId = entry.meta?.windowId;
        return !scopedId || scopedId === windowId;
    });
    const visible = scoped.filter(entry => {
        const meta = entry.meta || {};
        if (meta.placeholder || meta.loading || meta.error || meta.debug || meta.intentOnly || meta.systemInput) return false;
        const text = (entry.text || "").trim();
        return Boolean(text);
    });
    const pick = (predicate) => {
        for (let i = visible.length - 1; i >= 0; i -= 1) {
            const item = visible[i];
            if (predicate(item)) return item;
        }
        return null;
    };
    const primary = pick(item => item.role === "user" || item.meta?.narrator);
    const fallback = pick(item => item.role === "system");
    const target = primary || fallback || null;
    const summary = {
        aiTurns: countAiReplies(windowId),
        previewText: target?.text?.trim() || "",
        previewAt: target?.time || Date.now(),
        lastMessageId: target?.id || null
    };
    return summary;
}

function hasStoryStarted() {
    const history = getWorldState().story || [];
    return history.some(entry => {
        if (entry.meta?.opening) return false;
        if (entry.meta?.systemInput) return false;
        return true;
    });
}

function shouldShowInitializerButton() {
    return !initDismissed && !hasStoryStarted();
}

function removeInitializerButton() {
    if (initOverlay && initOverlay.remove) {
        initOverlay.remove();
    }
    initOverlay = null;
    initStatusEl = null;
    initStartButton = null;
    initCancelButton = null;
    if (initButton && initButton.remove) {
        initButton.remove();
    }
    initButton = null;
}

function ensureInitializerBubbles() {
    if (initOverlay) return initOverlay;
    const storyLog = document.getElementById("story-log");
    const panel = storyLog || document.getElementById("story-panel") || document.body;
    const container = document.createElement("div");
    container.className = "initializer-bubbles";

    const status = document.createElement("div");
    status.className = "story-bubble bubble-system bubble-init status bubble-center";
    const statusContent = document.createElement("div");
    statusContent.className = "bubble-content";
    const statusMain = document.createElement("div");
    statusMain.className = "bubble-main-text";
    statusMain.innerHTML = `<div class="init-anim"><span class="init-icon">📱</span><div class="init-spinner"><span></span><span></span><span></span></div><span>世界引导程序</span></div><p class="init-message" data-tone="info">准备布置世界……</p>`;
    statusContent.appendChild(statusMain);
    status.appendChild(statusContent);

    const actions = document.createElement("div");
    actions.className = "story-bubble bubble-system bubble-init actions bubble-center";
    const actionsContent = document.createElement("div");
    actionsContent.className = "bubble-content";
    const actionInner = document.createElement("div");
    actionInner.className = "init-actions";

    const start = document.createElement("button");
    start.type = "button";
    start.className = "init-chip primary";
    start.textContent = "开始布置";
    start.addEventListener("click", () => startInitialization());

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "init-chip ghost";
    cancel.textContent = "取消";
    cancel.addEventListener("click", () => {
        if (initInFlight) return;
        initDismissed = true;
        removeInitializerButton();
    });

    actionInner.appendChild(start);
    actionInner.appendChild(cancel);
    actionsContent.appendChild(actionInner);
    actions.appendChild(actionsContent);

    container.appendChild(status);
    container.appendChild(actions);
    if (storyLog && storyLog.firstChild) {
        const opener = storyLog.querySelector(".story-bubble.bubble-opening");
        if (opener) {
            opener.insertAdjacentElement("afterend", container);
        } else {
            storyLog.appendChild(container);
        }
    } else if (storyLog) {
        storyLog.appendChild(container);
    } else if (panel.firstChild) {
        panel.insertBefore(container, panel.firstChild);
    } else {
        panel.appendChild(container);
    }

    initOverlay = container;
    initStatusEl = status.querySelector(".init-message");
    initStartButton = start;
    initCancelButton = cancel;
    return container;
}

function repositionInitializer() {
    if (!initOverlay) return;
    const storyLog = document.getElementById("story-log");
    if (!storyLog) return;
    const opener = storyLog.querySelector(".story-bubble.bubble-opening");
    if (opener && opener.nextSibling !== initOverlay) {
        opener.insertAdjacentElement("afterend", initOverlay);
    }
}

function setInitializerBusy(busy) {
    initInFlight = busy;
    if (initStartButton) {
        initStartButton.disabled = busy;
        if (busy) {
            initStartButton.textContent = "布置中…";
        }
    }
    if (initCancelButton) {
        initCancelButton.disabled = busy;
    }
    document.body?.classList?.toggle("init-busy", busy);
    if (busy) {
        storyUI?.lockInput?.();
    } else {
        storyUI?.unlockInput?.();
    }
}

function setInitializerStatus(text, tone = "info") {
    ensureInitializerBubbles();
    if (initStatusEl) {
        initStatusEl.textContent = text || "";
        initStatusEl.dataset.tone = tone;
    }
}

function showInitializerOverlay() {
    const container = ensureInitializerBubbles();
    container.style.display = "flex";
    if (initStartButton) {
        initStartButton.textContent = "开始布置";
        initStartButton.disabled = false;
    }
    if (initCancelButton) {
        initCancelButton.disabled = false;
    }
    setInitializerStatus("准备布置世界……", "info");
}

function hideInitializerOverlay() {
    if (initInFlight) return;
    removeInitializerButton();
}

async function startInitialization() {
    if (initInFlight) return;
    showInitializerOverlay();
    setInitializerBusy(true);
    setInitializerStatus("正在布置世界…", "info");
    try {
        const card = getActiveCard() || {};
        const userPersona = getWindowUserPersonaOverride(LOCAL_WINDOW_ID) || "";
        const allowYuanShu = (getGlobalUserName() || "").trim() === "沈安亦";
        const openingText = getOpeningText(LOCAL_WINDOW_ID) || "";
        const payload = await runInitializer({ card, windowId: LOCAL_WINDOW_ID, userPersona, allowYuanShu, openingText });
        applyInitializerState(payload, LOCAL_WINDOW_ID);
        refreshWeChatUI();
        setInitializerStatus("布置完成，可以开始聊天。", "success");
        if (initStartButton) initStartButton.textContent = "重新布置";
        storyUI?.showTimelineToast?.("初始化完成");
        initDismissed = false;
    } catch (err) {
        console.warn("[Initializer] failed", err);
        setInitializerStatus("生成失败，请重试", "error");
        if (initStartButton) {
            initStartButton.textContent = "重试";
            initStartButton.disabled = false;
        }
    } finally {
        setInitializerBusy(false);
    }
}

function updateInitializerButton() {
    if (!shouldShowInitializerButton()) {
        removeInitializerButton();
        return;
    }
    const container = ensureInitializerBubbles();
    container.style.display = "flex";
    repositionInitializer();
}

function maybeHandleCallTranscript(entry) {
    if (!entry?.id || handledCallMessages.has(entry.id)) return;
    const meta = entry.meta || {};
    if (meta.windowId && meta.windowId !== LOCAL_WINDOW_ID) return;
    if (meta.placeholder || meta.error || !meta.callTranscript) return;
    handledCallMessages.add(entry.id);
    const callerName = getActiveCard()?.name || "来电";
    console.debug("[Call] play transcript", { id: entry.id, callerName, windowId: meta.windowId || LOCAL_WINDOW_ID });
    try {
        playSpecialFloatNotification(`来电：${callerName}`);
    } catch {
        /* ignore float errors */
    }
    try {
        playCallTranscriptFromStory({
            name: callerName,
            transcript: meta.callTranscript,
            direction: "incoming",
            lineDelay: 820
        });
    } catch (err) {
        console.warn("[Call] play transcript failed", err);
    }
}

function broadcastWindowSummary(reason = "") {
    const windowId = LOCAL_WINDOW_ID;
    const summary = computeWindowSummaryLocal(windowId);
    const payload = { windowId, summary, reason };
    if (typeof console !== "undefined" && console.debug) {
        console.debug("[Summary] window updated", payload);
    }
    try {
        window.dispatchEvent(new CustomEvent("window:summaryChanged", { detail: payload }));
    } catch {
        /* ignore */
    }
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({ type: "window-summary", ...payload }, "*");
        } catch {
            /* ignore cross-origin */
        }
    }
}

function initStoryHideToggle() {
    const panel = document.getElementById("story-panel");
    const storyHeader = document.getElementById("story-header");
    const storyLog = document.getElementById("story-log");
    const footer = document.getElementById("story-input-row");
    const sheet = document.getElementById("character-sheet");
    if (!panel || panel.__hideToggleBound) return;
    panel.__hideToggleBound = true;
    // 确保刷新后默认可见
    panel.classList.remove("story-hide-text");
    let lastToggleAt = 0;
    const handler = (ev) => {
        if (!storyLog) return;
        const target = ev.target;
        if (storyHeader && storyHeader.contains(target)) return;
        if (footer && footer.contains(target)) return;
        if (sheet && sheet.contains(target)) return;
        if (!storyLog.contains(target)) return;
        if (target.closest(".story-tools-menu") || target.closest("#story-input") || target.closest(".story-input-bar")) return;
        if (target.closest(".story-bubble") || target.closest(".initializer-overlay") || target.closest(".initializer-bubbles")) return;
        if (target !== storyLog) return;
        const now = Date.now();
        if (now - lastToggleAt < 160) return;
        lastToggleAt = now;
        panel.classList.toggle("story-hide-text");
    };
    panel.addEventListener("dblclick", handler, true);
    bindGentleDoubleTap(panel, handler);
}

function bindPhoneActionGuard() {
    // Phone and tool layers stay responsive even while AI is generating
    phoneActionGuardBound = true;
}

function setGenerationState(active) {
    aiInFlight = active;
    if (active) clearResendButton();
    document.body?.classList?.toggle("ai-generating", active);
    if (active) {
        storyUI?.lockInput?.();
        setSendButtonBusy(true);
    } else {
        storyUI?.unlockInput?.();
        setSendButtonBusy(false);
        activePlaceholderVariant = null;
    }
    storyUI?.setGenerationState?.(active);
}

function parseUserInput(rawText = "") {
    const source = typeof rawText === "string" ? rawText : String(rawText || "");
    const intentBlocks = [];
    const withoutIntent = source.replace(/\/([\s\S]*?)\//g, (_, inner) => {
        const text = (inner || "").trim();
        if (text) intentBlocks.push(text);
        return " ";
    });
    const withRoleplay = withoutIntent.replace(/\(([\s\S]*?)\)/g, (_, inner) => {
        const text = (inner || "").trim();
        return text ? ` ${text} ` : " ";
    });
    const cleanTextForStory = withRoleplay.replace(/\s+/g, " ").trim();
    const userIntentText = intentBlocks.filter(Boolean).join("\n");
    console.debug("[Input] parsed", { cleanTextForStory, userIntentText });
    return { cleanTextForStory, userIntentText };
}

async function handleStorySubmit(text) {
    if (aiInFlight) {
        return;
    }
    initDismissed = true;
    removeInitializerButton();
    const { cleanTextForStory, userIntentText } = parseUserInput(text);
    const storyText = cleanTextForStory || "";
    if (!storyText && !userIntentText) {
        return;
    }
    storyUI?.lockInput?.();
    if (storyText) {
        const entries = addStoryMessage("user", storyText, { meta: { windowId: LOCAL_WINDOW_ID } });
        const last = Array.isArray(entries) ? entries[entries.length - 1] : null;
        if (last?.id) lastUserMessageId = last.id;
        clearResendButton();
        addEventLog({ text: `玩家：${storyText}`, type: "story" });
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({ type: "user-input", text: storyText }, "*");
            } catch {
                // ignore cross-origin errors
            }
        }
        await checkTriggers(storyText);
    } else {
        console.debug("[Input] intent-only submission", { hasIntent: Boolean(userIntentText) });
    }
    startNarratorCycle(storyText || "……", { userIntent: userIntentText });
}

const OPENING_META_KEY = "__shellOpeningPlayed__";
function playShellOpening(text) {
    const openingText = (text || "").trim();
    if (!openingText) return;
    const state = getWorldState();
    const exists = (state.story || []).some(entry => entry.meta?.opening && (!entry.meta?.windowId || entry.meta.windowId === LOCAL_WINDOW_ID));
    if (exists || window[OPENING_META_KEY]) return;
    window[OPENING_META_KEY] = true;
    setOpeningText(openingText, LOCAL_WINDOW_ID);
    addStoryMessage("system", openingText, { meta: { opening: true, windowId: LOCAL_WINDOW_ID } });
}

async function handleContinueRequest() {
    if (aiInFlight) return;
    initDismissed = true;
    removeInitializerButton();
    startNarratorCycle("继续", { countRound: false });
}

function handleLongMemoryChange(value) {
    setRawReplyLimit(value, LOCAL_WINDOW_ID);
}

function handleRawCacheChange(value) {
    setRawReplyLimit(value, LOCAL_WINDOW_ID);
}

function handleProviderChange(providerId) {
    setActiveProvider(providerId);
}

function handleNarratorModelChange(model) {
    const next = setActiveNarratorModel(model);
    console.debug("[NarratorModel] switched", { model: next });
}

function getLastUserInputText() {
    const history = getWorldState().story || [];
    const last = [...history].reverse().find(item => {
        if (item.role !== "user") return false;
        const scoped = item.meta?.windowId;
        return !scoped || scoped === LOCAL_WINDOW_ID;
    });
    return last?.text || "";
}

function getLastUserEntry(history = null) {
    const source = Array.isArray(history) ? history : (getWorldState().story || []);
    return [...source].reverse().find(item => {
        if (item.role !== "user") return false;
        const scoped = item.meta?.windowId;
        return !scoped || scoped === LOCAL_WINDOW_ID;
    }) || null;
}

function clearResendButton() {
    if (resendControl?.remove) {
        resendControl.remove();
    }
    resendControl = null;
}

function renderResendButton(targetEntry = null) {
    const history = getWorldState().story || [];
    const pickedById = lastUserMessageId ? history.find(item => item.id === lastUserMessageId) : null;
    const entry = targetEntry || pickedById || getLastUserEntry();
    if (!entry?.id) return;
    const scoped = entry.meta?.windowId;
    if (scoped && scoped !== LOCAL_WINDOW_ID) return;
    const log = document.getElementById("story-log");
    const node = log?.querySelector(`[data-message="${entry.id}"]`);
    if (!node) return;
    clearResendButton();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "continue-btn align-left resend-btn";
    btn.textContent = "重发";
    btn.addEventListener("click", () => {
        if (aiInFlight) return;
        const text = entry.text || getLastUserInputText();
        if (text) startNarratorCycle(text);
        clearResendButton();
    }, { once: true });
    node.insertAdjacentElement("afterend", btn);
    resendControl = btn;
}

async function handleBubbleAction(action, entry) {
    if (!action || !entry || aiInFlight) return;
    const entryWindowId = entry.meta?.windowId;
    if (entryWindowId && entryWindowId !== LOCAL_WINDOW_ID) return;
    if (action === "rewind" && entry.snapshotId) {
        const snap = getSnapshotById(entry.snapshotId);
        if (snap?.narratorModelUsed) {
            setActiveNarratorModel(snap.narratorModelUsed);
        }
        const restored = restoreSnapshot(entry.snapshotId);
        if (restored) {
            hydrateStoryLog();
            refreshWeChatUI();
            resetCallInterface();
            dropSnapshotsAfter(entry.snapshotId);
            storyUI.scrollToSnapshot?.(entry.snapshotId);
        }
    } else if (action === "retry" && entry.role === "system" && entry.snapshotId) {
        const snap = getSnapshotById(entry.snapshotId);
        if (trimStoryAfter(entry.id)) {
            dropSnapshotsAfter(entry.snapshotId);
            restoreSnapshot();
            hydrateStoryLog();
            refreshWeChatUI();
            resetCallInterface();
            const retryText = getLastUserInputText();
            if (retryText && !aiInFlight) {
                const modelOverride = snap?.narratorModelUsed || null;
                startNarratorCycle(retryText, { narratorModelOverride: modelOverride });
            } else if (!retryText) {
                console.warn("[AI] 无法重试：缺少上一条玩家输入");
            }
        }
    }
}

function ensurePlaceholderBubble(windowId = LOCAL_WINDOW_ID) {
    if (activePlaceholderId && activePlaceholderWindowId === windowId) return activePlaceholderId;
    const variant = activePlaceholderVariant || pickPlaceholderVariant();
    const placeholderText = variant?.text || variant?.bubbleText || PLACEHOLDER_FALLBACK;
    const entries = addStoryMessage("system", placeholderText, {
        meta: {
            placeholder: true,
            loading: true,
            windowId,
            placeholderVariant: variant?.id || null
        }
    });
    const id = Array.isArray(entries) && entries[0]?.id ? entries[0].id : null;
    activePlaceholderId = id;
    activePlaceholderWindowId = windowId;
    return id;
}

function markPlaceholderFailure(placeholderId, windowId = LOCAL_WINDOW_ID, text = FAILURE_FALLBACK) {
    if (!placeholderId) return false;
    return editStoryMessage(placeholderId, text, {
        placeholder: false,
        loading: false,
        error: true,
        failed: true,
        windowId
    });
}

function pickPlaceholderVariant() {
    const variants = PLACEHOLDER_VARIANTS.length
        ? PLACEHOLDER_VARIANTS
        : [{ id: "fallback", texts: [PLACEHOLDER_FALLBACK] }];
    const chosen = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    const pool = Array.isArray(chosen.texts) ? chosen.texts.filter(Boolean) : [];
    const text = pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : (chosen.bubbleText || PLACEHOLDER_FALLBACK);
    const payload = { ...chosen, text };
    activePlaceholderVariant = payload;
    return payload;
}

function setSendButtonBusy(active) {
    const btn = document.getElementById("story-send");
    if (!btn) return;
    if (sendButtonDefaultText == null) {
        sendButtonDefaultText = btn.textContent || "发送";
    }
    const defaultLabel = sendButtonDefaultText || btn.dataset.label || "发送";
    if (active) {
        btn.dataset.label = defaultLabel;
        btn.textContent = "";
        btn.setAttribute("aria-busy", "true");
        btn.setAttribute("disabled", "true");
        btn.classList.add("busy");
    } else {
        btn.textContent = defaultLabel;
        btn.removeAttribute("aria-busy");
        btn.removeAttribute("disabled");
        btn.classList.remove("busy");
    }
}

function registerAiSnapshot(snapshotId) {
    if (!snapshotId) return;
    allowedSnapshots.add(snapshotId);
    aiSnapshotQueue.push(snapshotId);
    if (aiSnapshotQueue.length > 20) {
        const removed = aiSnapshotQueue.shift();
        if (removed) allowedSnapshots.delete(removed);
    }
}

function commitNarratorReply(windowId, text, placeholderId = null, options = {}) {
    const requestId = options.requestId || activeRequestId || null;
    if (!activeGeneration || activeGeneration.status !== "committed") return null;
    if (requestId && activeGeneration.requestId && activeGeneration.requestId !== requestId) return null;
    if (activeGeneration.windowId && activeGeneration.windowId !== windowId) return null;
    const scoped = windowId || LOCAL_WINDOW_ID;
    const memoryText = (options.memoryText || text || "").trim();
    const allowRecord = options.allowRecord !== false;
    if (scoped !== LOCAL_WINDOW_ID) {
        console.warn("[AI] windowId mismatch, dropping reply", { send: LOCAL_WINDOW_ID, reply: scoped });
        if (placeholderId) markPlaceholderFailure(placeholderId, LOCAL_WINDOW_ID);
        return null;
    }
    const finalText = text || "(AI 无回复)";
    const extraMeta = options.meta || {};
    if (placeholderId && placeholderId === activePlaceholderId && activePlaceholderWindowId === scoped) {
        const patched = editStoryMessage(placeholderId, finalText, { placeholder: false, loading: false, windowId: scoped, narrator: true, ...extraMeta });
        if (patched) {
            try {
                if (allowRecord && memoryText && !isNarratorTextContaminated(memoryText)) {
                    pushRawReply(memoryText, scoped);
                }
            } catch (err) {
                console.warn("[AI][stm] pushRawReply failed", { windowId: scoped, err });
            }
            try {
                addEventLog({ text: `剧情：${finalText}`, type: "story" });
            } catch (err) {
                console.warn("[AI] event log failed", err);
            }
            console.info("[AI] reply accepted; placeholder replaced; STM write attempted", {
                windowId: scoped,
                requestId,
                placeholderId,
                replyId: placeholderId
            });
            return placeholderId;
        } else {
            console.warn("[AI] placeholder edit failed", { windowId: scoped, placeholderId });
        }
    }
    const entries = addStoryMessage("system", finalText, { meta: { windowId: scoped, narrator: true, ...extraMeta } });
    const id = Array.isArray(entries) && entries[0]?.id ? entries[0].id : null;
    if (id) {
        if (allowRecord && memoryText && !isNarratorTextContaminated(memoryText)) {
            pushRawReply(memoryText, scoped);
        }
        addEventLog({ text: `剧情：${finalText}`, type: "story" });
    }
    console.debug("[AI] reply committed", { windowId: scoped, placeholderId: placeholderId || null });
    return id;
}

async function finalizeNarratorSuccess(windowId, messageId, storyText, requestId = null, memoryText = "") {
    const scoped = windowId || LOCAL_WINDOW_ID;
    if (!activeGeneration || activeGeneration.status !== "committed") return;
    if (!messageId) return;
    const channel = activeGeneration?.channel || "story";
    const skipSummaries = channel === "wechat" || channel === "moment";
    if (!skipSummaries) {
        try {
            await appendNarratorToSTM(scoped, memoryText || storyText);
        } catch (err) {
            console.warn("[AI][memory] STM append skipped", err);
        }
        try {
            await updateMemoriesAfterNarrator(scoped);
        } catch (err) {
            console.warn("[AI][memory] post-narrator update failed", err);
        }
    }
    try {
        setIsFirstTurn(false, scoped);
    } catch (err) {
        console.warn("[AI][state] isFirstTurn update failed", err);
    }
    try {
        const shouldCount = activeGeneration.countRound !== false;
        const snapshotKind = shouldCount ? "ai_reply" : "ai_sidecar";
        const snapshotId = saveSnapshot(`narrator:${requestId || Date.now()}`, {
            kind: snapshotKind,
            narratorModelUsed: activeGeneration?.narratorModelUsed || getActiveNarratorModel()
        });
        if (snapshotId) {
            attachSnapshot(messageId, snapshotId);
        }
    } catch (err) {
        console.warn("[AI][snapshot] capture failed", err);
    }
}

function startNarratorCycle(textOverride = "", options = {}) {
    const hasIntentOnly = Boolean(options.userIntent) && !textOverride;
    if (!textOverride && !hasIntentOnly) return;
    if (aiInFlight) return;
    initDismissed = true;
    hideInitializerOverlay();
    removeInitializerButton();
    generationId += 1;
    const requestId = `gen-${generationId}`;
    activeRequestId = requestId;
    const countRound = options.countRound !== undefined ? options.countRound : !options.rewriteHint;
    const narratorModelOverride = options.narratorModelOverride || null;
    const prevNarratorModel = narratorModelOverride ? getActiveNarratorModel() : null;
    if (narratorModelOverride) {
        setActiveNarratorModel(narratorModelOverride);
    }
    activeGeneration = {
        windowId: LOCAL_WINDOW_ID,
        requestId,
        status: "pending",
        placeholderId: null,
        rewriteHint: options.rewriteHint || "",
        userIntent: options.userIntent || "",
        countRound,
        channel: options.channel || "story",
        narratorModelUsed: getActiveNarratorModel(),
        prevNarratorModel
    };
    pickPlaceholderVariant();
    setGenerationState(true);
    const sendText = textOverride || "……";
    requestAIResponse(sendText, {
        requestId,
        rewriteHint: options.rewriteHint || "",
        userIntent: options.userIntent || "",
        countRound,
        channel: activeGeneration.channel
    }).catch(err => {
        console.error("AI cycle failed", err);
        abortActiveGeneration("exception");
    });
}

async function requestAIResponse(text, options = {}) {
    const windowId = LOCAL_WINDOW_ID;
    const placeholderId = ensurePlaceholderBubble(windowId);
    if (activeGeneration && activeGeneration.status === "pending") {
        activeGeneration.placeholderId = placeholderId;
    }
    storyUI?.beginAiReplyGroup?.();
    const requestId = options.requestId || `gen-${Date.now()}`;
    console.debug("[AI] request start", { windowId, text, requestId });
    const logReject = (reason, extra = {}) => {
        console.warn("[AI][reject]", {
            reason,
            windowId,
            requestId,
            placeholderId,
            storyText: extra.storyText ?? null,
            ...extra
        });
    };
    try {
        const action = await generateNarrativeReply(text, windowId, { skipRecord: true, requestId, rewriteHint: options.rewriteHint || "", userIntent: options.userIntent || "", channel: options.channel || "story" });
        const storyTextRaw = typeof action?.payload?.text === "string" ? action.payload.text : "";
        const storyText = storyTextRaw || "";
        const cleanStoryText = storyText.trim();
        const badOutput = Boolean(action?.payload?.meta?.badOutput);
        const refusal = Boolean(action?.payload?.meta?.refusal);
        const actionMeta = action?.payload?.meta || {};
        const previewText = (cleanStoryText || storyText || "").slice(0, 12);
        const targetWindowId = action?.windowId || windowId;
        const memoryText = sanitizeNarratorTextForMemory(storyText);
        const contaminated = badOutput || refusal || isNarratorTextContaminated(storyText) || isNarratorTextContaminated(memoryText);
        if (activeRequestId && activeRequestId !== requestId) {
            logReject("request_id_mismatch", { activeRequestId, storyText: previewText });
            abortActiveGeneration("request_mismatch");
            return;
        }
        console.debug("[AI] response", { sendWindow: windowId, replyWindow: action?.windowId, requestId });
        if (action?.aborted) {
            logReject(action.reason || "aborted", { storyText: previewText });
            abortActiveGeneration(action.reason || "aborted");
            return;
        }
        if (targetWindowId !== windowId) {
            logReject("window_id_mismatch", { responseWindowId: targetWindowId, storyText: previewText });
            abortActiveGeneration("window_mismatch");
            return;
        }
        if (action?.action && action.action !== "reply_story") {
            try {
                applyAction(action);
            } catch (err) {
                console.warn("[AI] applyAction failed", err);
            }
        }
        if (!cleanStoryText || cleanStoryText === LOCAL_EMPTY_FALLBACK || contaminated) {
            logReject(contaminated ? "contaminated_output" : "empty_reply", { storyText: previewText, badOutput, refusal });
            if (activeGeneration?.placeholderId) {
                if (actionMeta.channel === "wechat") {
                    trimStoryAfter(activeGeneration.placeholderId);
                    storyUI?.showTimelineToast?.("微信生成失败，请重试");
                } else {
                    markPlaceholderFailure(activeGeneration.placeholderId, windowId, FAILURE_FALLBACK);
                }
            }
            abortActiveGeneration("invalid_text");
            return;
        }
        const committedId = await commitNarration(windowId, storyText, {
            requestId,
            meta: actionMeta,
            memoryText
        });
        if (!committedId) {
            logReject("placeholder_commit_failed", { storyText: previewText });
            abortActiveGeneration("commit_failed");
            return;
        }
        console.debug("[AI] placeholder replaced", { windowId, requestId, placeholderId: committedId, textLength: storyText.length });
    } catch (err) {
        console.error("AI 剧情回复失败", err);
        abortActiveGeneration("exception");
    } finally {
        if (activeGeneration && activeGeneration.status === "pending") {
            abortActiveGeneration("finally");
        }
    }
}

async function commitNarration(windowId, storyText, { requestId, meta = {}, memoryText = "" } = {}) {
    if (!activeGeneration || activeGeneration.status !== "pending") return null;
    if (activeGeneration.windowId && activeGeneration.windowId !== windowId) return null;
    if (activeGeneration.requestId && requestId && activeGeneration.requestId !== requestId) return null;
    activeGeneration.status = "committed";
    const committedId = commitNarratorReply(windowId, storyText, activeGeneration.placeholderId, { requestId, meta, memoryText, allowRecord: true });
    if (!committedId) {
        activeGeneration.status = "aborted";
        if (activeGeneration.placeholderId) {
            markPlaceholderFailure(activeGeneration.placeholderId, windowId, FAILURE_FALLBACK);
        }
        finishGenerationSession();
        return null;
    }
    try {
        await finalizeNarratorSuccess(windowId, committedId, storyText, requestId, memoryText);
    } catch (err) {
        console.warn("[AI] finalize failed", err);
    }
    finishGenerationSession();
    return committedId;
}

function abortActiveGeneration(reason = "abort") {
    const session = activeGeneration;
    if (!session || session.status === "aborted" || session.status === "committed") return;
    session.status = "aborted";
    const windowId = session.windowId || LOCAL_WINDOW_ID;
    if (session.placeholderId) {
        markPlaceholderFailure(session.placeholderId, windowId, FAILURE_FALLBACK);
    }
    if (reason !== "unload") {
        renderResendButton();
    }
    finishGenerationSession();
}

function finishGenerationSession() {
    storyUI?.endAiReplyGroup?.();
    activePlaceholderId = null;
    activePlaceholderWindowId = null;
    activeRequestId = null;
    if (activeGeneration?.prevNarratorModel) {
        setActiveNarratorModel(activeGeneration.prevNarratorModel);
    }
    activeGeneration = null;
    setGenerationState(false);
}

function safeWindowId() {
    try {
        return getWindowId();
    } catch {
        return "win-default";
    }
}

function handleSystemInput(raw) {
    const text = raw.trim();
    if (!text) return;
    const entries = addStoryMessage("system", text, { meta: { systemInput: true, windowId: LOCAL_WINDOW_ID } });
    if (entries?.length) {
        console.debug("[SystemInput] appended", { count: entries.length });
    }
    try {
        const overrides = getWindowOverrides?.(LOCAL_WINDOW_ID) || {};
        const merged = [overrides.windowSystemOverride, text].filter(Boolean).join("\n");
        setWindowOverrides?.(LOCAL_WINDOW_ID, { ...overrides, windowSystemOverride: merged });
        console.debug("[SystemInput] window override updated", { windowId: LOCAL_WINDOW_ID, merged });
    } catch (err) {
        console.warn("[SystemInput] window override failed", err);
    }
    const colonIndex = text.indexOf(":");
    if (colonIndex > -1) {
        const key = text.slice(0, colonIndex).trim().toLowerCase();
        const value = text.slice(colonIndex + 1).trim();
        if (!value) return;
        if (key === "persona" || key === "world" || key === "rules") {
            updateSystemRules({ [key]: value });
            appendDynamicRule(`[${key}] ${value}`);
            return;
        }
    }
    appendDynamicRule(text);
    addEventLog({ text: `系统指令：${text}`, type: "system" });
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
    initDismissed = false;
    updateInitializerButton();
}

function refreshStoryLogView() {
    if (!storyUI) return;
    const history = getWorldState().story || [];
    storyUI.replaceHistory?.(history);
    seedAllowedSnapshots(history);
    syncSnapshotsToVisibleHistory();
    broadcastWindowSummary("story-refresh");
    updateInitializerButton();
}

function syncSnapshotsToVisibleHistory() {
    const history = getWorldState().story || [];
    const allowedSnapshots = history
        .filter(item => item.meta?.narrator && item.snapshotId && (!item.meta?.windowId || item.meta.windowId === LOCAL_WINDOW_ID))
        .map(item => item.snapshotId);
    syncSnapshotsWithStory(LOCAL_WINDOW_ID, allowedSnapshots);
}

async function handleEditMessage(entry, newText) {
    if (!entry?.id || !newText || aiInFlight) return false;
    if (entry.role !== "system") return false;
    if (entry.meta?.placeholder || entry.meta?.error) return false;
    const entryWindow = entry.meta?.windowId;
    if (entryWindow && entryWindow !== LOCAL_WINDOW_ID) return false;
    const rewriteHint = newText.trim();
    if (!rewriteHint) return false;

    const findTargetUser = (list = [], pivotId) => {
        const pivot = list.findIndex(item => item.id === pivotId);
        if (pivot === -1) return null;
        return [...list.slice(0, pivot)].reverse().find(item => {
            if (item.role !== "user") return false;
            const scoped = item.meta?.windowId;
            return !scoped || scoped === LOCAL_WINDOW_ID;
        }) || null;
    };

    let history = getWorldState().story || [];
    let targetUser = findTargetUser(history, entry.id);
    const snapshotId = entry.snapshotId || null;
    if (snapshotId) {
        const restored = restoreSnapshot(snapshotId);
        if (!restored) return false;
        history = getWorldState().story || [];
        targetUser = findTargetUser(history, entry.id) || targetUser;
    } else {
        trimStoryAfter(entry.id);
        history = getWorldState().story || [];
    }
    if (!targetUser) return false;

    dropSnapshotsAfter(snapshotId || entry.id);
    hydrateStoryLog();
    refreshStoryLogView();
    refreshWeChatUI();
    resetCallInterface();
    const patched = editStoryMessage(entry.id, rewriteHint, {
        narrator: true,
        placeholder: false,
        loading: false,
        windowId: LOCAL_WINDOW_ID,
        edited: true
    });
    if (patched) {
        pushRawReply(rewriteHint, LOCAL_WINDOW_ID);
        try {
            await appendNarratorToSTM(LOCAL_WINDOW_ID, rewriteHint);
            await updateMemoriesAfterNarrator(LOCAL_WINDOW_ID);
        } catch (err) {
            console.warn("[AI][memory] edit sync skipped", err);
        }
        addEventLog({ text: `编辑本句：${rewriteHint.slice(0, 40)}`, type: "story" });
    }
    return true;
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
