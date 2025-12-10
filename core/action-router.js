import {
    addStoryMessage,
    addChatMessage,
    addMomentComment,
    addCallLog,
    updateCallLog
} from "../data/world-state.js";
import { recordLongMemory } from "./ai.js";
import { triggerIncomingCall } from "../apps/phone.js";

export function applyAction(action) {
    if (!action || !action.action) return;
    const { payload = {} } = action;
    switch (action.action) {
        case "reply_story":
            if (payload.text) {
                addStoryMessage("system", payload.text);
                recordLongMemory({ text: payload.text });
            }
            break;
        case "send_wechat":
            addChatMessage(payload.chatId || "yuan", {
                from: payload.from || "in",
                text: payload.text,
                kind: payload.kind,
                amount: payload.amount
            });
            break;
        case "add_moment_comment":
            addMomentComment(payload.momentId, {
                from: payload.from || "AI",
                text: payload.text,
                type: payload.type || "comment"
            });
            break;
        case "incoming_call":
            triggerIncomingCall(payload.name || "未知来电", payload.retry ?? true);
            if (Array.isArray(payload.script) && payload.script.length) {
                const index = addCallLog({ name: payload.name || "未知来电", note: "来电" });
                updateCallLog(index, { transcript: payload.script });
            }
            break;
        default:
            console.warn("Unknown action", action);
    }
}
