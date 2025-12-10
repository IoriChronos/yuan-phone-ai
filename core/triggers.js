import { GameState, updateState } from "./state.js";

const triggerMap = new Map();
let handlerRefs = {
    wechat: null,
    call: null,
    moments: null,
    notify: null
};

function recordTrigger(entry) {
    const list = (GameState.triggers || []).slice(-20);
    list.push({ ...entry, time: Date.now() });
    updateState("triggers", list);
}

export function setTriggerHandlers(handlers = {}) {
    handlerRefs = { ...handlerRefs, ...handlers };
}

export function registerTrigger(name, rule) {
    if (!name || typeof rule !== "object") return;
    triggerMap.set(name, rule);
}

export async function checkTriggers(input, context = {}) {
    const text = (input ?? "").toString();
    if (text.trim() === "1") {
        triggerRandomEvent("story-1");
    }
    for (const [, rule] of triggerMap.entries()) {
        try {
            const matched = typeof rule.match === "function" ? await rule.match(text, context) : false;
            if (matched && typeof rule.action === "function") {
                return rule.action(text, context);
            }
        } catch (err) {
            console.error("Trigger execution error:", err);
        }
    }
    return null;
}

export function triggerRandomEvent(reason = "manual") {
    const options = [];
    if (handlerRefs.wechat) options.push("wechat");
    if (handlerRefs.call) options.push("call");
    if (handlerRefs.moments) options.push("moments");
    if (!options.length) return;
    const pick = options[Math.floor(Math.random() * options.length)];
    if (pick === "wechat") {
        handlerRefs.wechat?.();
        recordTrigger({ type: "wechat", reason });
        handlerRefs.notify?.("微信");
    } else if (pick === "call") {
        handlerRefs.call?.();
        recordTrigger({ type: "call", reason });
        handlerRefs.notify?.("来电");
    } else if (pick === "moments") {
        handlerRefs.moments?.();
        recordTrigger({ type: "moments", reason });
        handlerRefs.notify?.("朋友圈");
    }
}
