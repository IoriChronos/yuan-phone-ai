import {
    addStoryMessage,
    addChatMessage,
    addMomentComment,
    addCallLog,
    updateCallLog
} from "../data/world-state.js";
import { recordLongMemory } from "./ai.js";
import { triggerIncomingCall } from "../apps/phone.js";
import { addEventLog } from "../data/events-log.js";

export function applyAction(action) {
    if (!action || !action.action) return;
    const { payload = {} } = action;
    switch (action.action) {
        case "reply_story":
            if (payload.text) {
                addStoryMessage("system", payload.text);
                recordLongMemory({ text: payload.text });
                addEventLog({ text: `剧情：${payload.text}`, type: "story" });
            }
            break;
        case "send_wechat":
            addChatMessage(payload.chatId || "yuan", {
                from: payload.from || "in",
                text: payload.text,
                kind: payload.kind,
                amount: payload.amount
            });
            addEventLog({
                text: `微信 ${payload.chatId || "yuan"} → ${payload.text || payload.kind || "消息"}`,
                type: "wechat"
            });
            break;
        case "add_moment_comment":
            addMomentComment(payload.momentId, {
                from: payload.from || "AI",
                text: payload.text,
                type: payload.type || "comment"
            });
            addEventLog({
                text: `朋友圈评论 ${payload.momentId || "unknown"}：${payload.text || ""}`,
                type: payload.type === "mention" ? "moment_mention" : "moments"
            });
            break;
        case "incoming_call":
            triggerIncomingCall(payload.name || "未知来电", payload.retry ?? true);
            if (Array.isArray(payload.script) && payload.script.length) {
                const index = addCallLog({ name: payload.name || "未知来电", note: "来电" });
                updateCallLog(index, { transcript: payload.script });
            }
            addEventLog({
                text: `来电触发：${payload.name || "未知来电"}`,
                type: "call"
            });
            break;
        default:
            console.warn("Unknown action", action);
    }
}
