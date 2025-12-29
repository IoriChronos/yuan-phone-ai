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
    if (handlerRefs.moments) {
        options.push("moment_comment", "moment_like", "moment_mention");
    }
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
    } else if (pick.startsWith("moment_")) {
        const detailType = pick.replace("moment_", "");
        handlerRefs.moments?.({ type: detailType });
        recordTrigger({ type: pick, reason });
        const label = detailType === "like" ? "朋友圈点赞" : "朋友圈";
        handlerRefs.notify?.(label);
    }
}
