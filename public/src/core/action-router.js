import {
    sendMessage,
    commentMoment,
    addCallLog,
    updateCallLog
} from "../data/world-state.js";
import { triggerIncomingCall } from "../apps/phone.js";
import { addEventLog } from "../data/events-log.js";
import { getWindowId } from "./window-context.js";

export function applyAction(action) {
    if (!action || !action.action) return;
    try {
        const localWin = typeof getWindowId === "function" ? getWindowId() : null;
        if (action.windowId && localWin && action.windowId !== localWin) {
            console.warn("Window mismatch for action, ignored.", { expected: localWin, actionWindow: action.windowId });
            return;
        }
    } catch {
        /* ignore window id assertion errors */
    }
    const { payload = {} } = action;
    switch (action.action) {
        case "reply_story":
            console.warn("reply_story should be committed via UI pipeline, skipping direct append.");
            return;
        case "send_wechat":
            sendMessage(payload.chatId || "yuan", payload.text || "", payload.from || "in", {
                kind: payload.kind,
                amount: payload.amount
            });
            addEventLog({
                text: `微信 ${payload.chatId || "yuan"} → ${payload.text || payload.kind || "消息"}`,
                type: "wechat"
            });
            break;
        case "add_moment_comment":
            commentMoment(
                payload.momentId,
                payload.authorId || payload.from || "npc",
                payload.text || "",
                payload.mentions || [],
                payload.type || "comment"
            );
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
