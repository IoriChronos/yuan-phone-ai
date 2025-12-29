import { getSeedState, updateWorldState, initializeWorldState, getWorldState, addStoryMessage } from "../data/world-state.js";
import { hydrateShortMemory, clearShortMemory } from "../data/memory-short.js";
import { loadLongMemory, clearMemory as clearLongMemory } from "../data/memory-long.js";
import { clearSystemRules } from "../data/system-rules.js";
import { saveWorldStateSnapshot, saveLongMemorySnapshot } from "./storage.js";
import { clearSnapshots } from "./timeline.js";
import { getOpeningText, resetWindowMemoryForStory, setOpeningText } from "../data/window-memory.js";
import { getWindowId } from "./window-context.js";
import { getActiveCard } from "../data/character-cards.js";
import { forcePhoneToHomeScreen } from "../ui/phone.js";

function clearMMOStateStorage() {
    if (typeof window === "undefined") return;
    try {
        const clearMatching = (store) => {
            if (!store) return;
            const keys = [];
            for (let i = 0; i < store.length; i += 1) {
                const key = store.key(i);
                if (key && key.includes("martial-mmo-state")) {
                    keys.push(key);
                }
            }
            keys.forEach(key => store.removeItem(key));
        };
        clearMatching(window.sessionStorage);
        clearMatching(window.localStorage);
    } catch {
        /* ignore */
    }
}

function broadcastMMOReset() {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new Event("mmo-reset"));
    } catch {
        /* ignore */
    }
}

function broadcastPhoneReset() {
    if (typeof window === "undefined") return;
    try {
        window.dispatchEvent(new Event("phone-reset"));
    } catch {
        /* ignore */
    }
}

function clone(value) {
    if (typeof window !== "undefined" && window.structuredClone) {
        return window.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

function replaceArray(target, source) {
    if (!Array.isArray(target) || !Array.isArray(source)) return;
    target.length = 0;
    source.forEach(item => {
        target.push(clone(item));
    });
}

function resolveOpeningText(scopedWindow) {
    const existing = (getOpeningText(scopedWindow) || "").trim();
    if (existing) return existing;
    const current = getWorldState();
    const seed = getSeedState();
    const findOpening = (list = []) => {
        const entry = (list || []).find(item => item.meta?.opening && (!item.meta.windowId || item.meta.windowId === scopedWindow));
        return (entry?.text || "").trim();
    };
    const fromStory = findOpening(current.story || []);
    if (fromStory) return fromStory;
    const fromSeed = findOpening(seed.story || []);
    if (fromSeed) return fromSeed;
    const card = getActiveCard?.();
    const fromCard = (card?.opener || "").trim();
    if (fromCard) return fromCard;
    console.error("[Reset] opening text missing", { windowId: scopedWindow });
    return "（缺少开场白）";
}

export function resetStory() {
    const scopedWindow = getWindowId();
    const openingText = resolveOpeningText(scopedWindow);
    if (openingText) {
        setOpeningText(openingText, scopedWindow);
    }
    updateWorldState(state => {
        state.story = [];
    }, "reset:story");
    clearShortMemory();
    clearLongMemory();
    resetWindowMemoryForStory(scopedWindow);
    hydrateShortMemory([]);
    loadLongMemory([]);
    if (openingText) {
        addStoryMessage("system", openingText, { meta: { opening: true, windowId: scopedWindow } });
    }
    saveWorldStateSnapshot();
    saveLongMemorySnapshot([]);
}

export function resetPhone() {
    const seed = getSeedState();
    updateWorldState(state => {
        replaceArray(state.chats, seed.chats);
        state.chatOrder = seed.chatOrder.slice();
        replaceArray(state.moments, seed.moments);
        replaceArray(state.callHistory, seed.callHistory);
        state.memoEntries = [];
        state.eventsLog = [];
        state.triggers = [];
        state.wallet = clone(seed.wallet);
        state.unread = clone(seed.unread);
        state.unreadMomentsCount = seed.unreadMomentsCount;
        state.lastAppOpened = null;
        state.blackFog = clone(seed.blackFog);
    }, "reset:phone");
    clearMMOStateStorage();
    broadcastMMOReset();
    broadcastPhoneReset();
    forcePhoneToHomeScreen();
    saveWorldStateSnapshot();
}

export function resetAll() {
    const seed = getSeedState();
    const base = clone(seed);
    const scopedWindow = getWindowId();
    const openingText = resolveOpeningText(scopedWindow);
    clearSnapshots();
    clearShortMemory();
    clearLongMemory();
    resetWindowMemoryForStory(scopedWindow);
    initializeWorldState(base);
    updateWorldState(state => {
        state.story = [];
    }, "reset:story");
    hydrateShortMemory([]);
    loadLongMemory([]);
    clearSystemRules();
    clearMMOStateStorage();
    broadcastMMOReset();
    broadcastPhoneReset();
    forcePhoneToHomeScreen();
    if (openingText) {
        setOpeningText(openingText, scopedWindow);
        addStoryMessage("system", openingText, { meta: { opening: true, windowId: scopedWindow } });
    }
    saveWorldStateSnapshot();
    saveLongMemorySnapshot([]);
}
