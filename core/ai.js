import { AI_CONFIG } from "../config.js";
import { getWorldState } from "../data/world-state.js";
import { getShortMemory } from "../data/memory-short.js";
import { getLongMemory, addLongMemory, summarizeAndTrim } from "../data/memory-long.js";

export async function askAI(userInput = "") {
    const context = buildContext();
    const prompt = `
你是 YuanPhone 的世界驱动引擎，请在深色悬疑语气中回复用户。
参考上下文（最近剧情、聊天、通话、记忆）：
${JSON.stringify(context)}

用户：${userInput || "……"}
`.trim();
    const reply = await callGroq(prompt);
    return reply || "";
}

export async function generateNarrativeReply(userInput) {
    return requestAction("reply_story", userInput, () => ({
        action: "reply_story",
        payload: { text: `【本地】${userInput ? "我听见了。" : "你醒着吗？"}` }
    }));
}

export async function generatePhoneMessage(chatId) {
    const contact = getWorldState().chats.find(c => c.id === chatId) || { name: "元书" };
    return requestAction(
        "send_wechat",
        `对话对象：${contact.name}(${chatId})`,
        () => ({
            action: "send_wechat",
            payload: { chatId, text: "“我在看着你。”" }
        })
    );
}

export async function generateMomentComment(momentId) {
    const moment = getWorldState().moments.find(m => m.id === momentId) || getWorldState().moments[0];
    return requestAction(
        "add_moment_comment",
        moment ? `朋友圈：${moment.who} · ${moment.text}` : "朋友圈空白",
        () => ({
            action: "add_moment_comment",
            payload: { momentId: moment?.id || "m1", text: "留意夜色。" }
        })
    );
}

export async function generateCallDialogue() {
    return requestAction(
        "incoming_call",
        "生成通话来电",
        () => ({
            action: "incoming_call",
            payload: { name: "守望 · 来电", script: ["接吗？", "信号里全是他。"] }
        })
    );
}

async function requestAction(kind, userInput, fallback) {
    const context = buildContext();
    const instruction = `
你是 YuanPhone 的世界驱动引擎。基于以下世界状态、短期记忆与长期记忆，选择一个动作并以 JSON 返回：
{
  "action": "...",
  "payload": { ... }
}
禁止输出除 JSON 以外的内容。
动作类型：reply_story、send_wechat、add_moment_comment、incoming_call。
`;
    const prompt = `${instruction}\nKind:${kind}\nContext:${JSON.stringify(context)}\n用户输入:${userInput || "NULL"}`;
    const response = await callGroq(prompt);
    const action = parseAction(response);
    return action || (typeof fallback === "function" ? fallback() : null);
}

function buildContext() {
    const world = getWorldState();
    return {
        shortMemory: getShortMemory(),
        longMemory: getLongMemory().slice(-5),
        storyTail: world.story.slice(-6),
        chats: world.chats.map(chat => ({
            id: chat.id,
            name: chat.name,
            unread: chat.unread,
            preview: chat.preview
        })),
        moments: world.moments.slice(0, 3).map(m => ({
            id: m.id,
            who: m.who,
            text: m.text,
            comments: (m.comments || []).slice(-2)
        })),
        callHistory: world.callHistory.slice(0, 3),
        memo: (world.memoEntries || []).slice(0, 5)
    };
}

async function callGroq(prompt) {
    try {
        const res = await fetch(AI_CONFIG.apiBase, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    { role: "system", content: AI_CONFIG.systemPrompt },
                    { role: "user", content: prompt }
                ]
            })
        });
        const json = await res.json();
        return json.choices?.[0]?.message?.content || "";
    } catch (err) {
        console.warn("Groq request failed", err);
        return "";
    }
}

function parseAction(text) {
    if (!text) return null;
    try {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
            return JSON.parse(text.slice(start, end + 1));
        }
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function recordLongMemory(entry) {
    addLongMemory(entry);
    summarizeAndTrim();
}
