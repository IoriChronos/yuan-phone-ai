import { AI_CONFIG } from "../config.js";
import { getWorldState } from "../data/world-state.js";
import { getShortMemory } from "../data/memory-short.js";
import {
    getLongMemory,
    addLongMemoryEpisode,
    getLongMemoryContextLimit
} from "../data/memory-long.js";
import { buildSystemPrompt } from "../data/system-rules.js";

export async function askAI(userInput = "") {
    const prompt = buildContextDocument(userInput);
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
    const instruction = `
你是 YuanPhone 的世界驱动引擎。基于以下世界状态、短期记忆与长期记忆，返回一个 JSON：
{
  "action": "reply_story | send_wechat | add_moment_comment | incoming_call",
  "payload": { ... }
}
禁止说明文字，只能是 JSON。
Kind: ${kind}`.trim();
    const prompt = `${instruction}\n\n${buildContextDocument(userInput || "（剧情联动）")}`;
    const response = await callGroq(prompt);
    const action = parseAction(response);
    return action || (typeof fallback === "function" ? fallback() : null);
}

function buildContextDocument(userInput) {
    const { sections } = composeContext();
    const rules = buildSystemPrompt();
    const parts = [
        rules ? `SYSTEM RULES:\n${rules}` : "",
        `LONG MEMORY (${sections.longMemory.count} 条)：\n${sections.longMemory.text}`,
        `SHORT MEMORY · 剧情 (${sections.short.storyCount})：\n${sections.short.storyText}`,
        `SHORT MEMORY · 手机 (${sections.short.eventCount})：\n${sections.short.eventText}`,
        `WORLD SNAPSHOT：\n${sections.world}`,
        `CURRENT INPUT：\n${userInput || "……"}`
    ].filter(Boolean);
    return parts.join("\n\n");
}

function composeContext() {
    const world = getWorldState();
    const shortMemory = normalizeShortMemory(getShortMemory());
    const longState = normalizeLongMemory(getLongMemory());
    const limit = getLongMemoryContextLimit();
    const longEpisodes = longState.slice(-limit);
    const storyLines = shortMemory.story.map(formatStoryMemory).join("\n") || "（空）";
    const eventLines = shortMemory.events.map(formatEventMemory).join("\n") || "（空）";
    const worldSnapshot = JSON.stringify({
        chats: world.chats.slice(0, 3).map(chat => ({
            id: chat.id,
            name: chat.name,
            unread: chat.unread,
            preview: chat.preview
        })),
        moments: world.moments.slice(0, 2).map(m => ({
            who: m.who,
            text: m.text,
            likes: m.likes,
            recentComments: (m.comments || []).slice(-2)
        })),
        wallet: world.wallet?.balance ?? 0,
        unread: world.unread
    });
    const longText = longEpisodes
        .map((ep, idx) => `${idx + 1}. ${ep.summary}`)
        .join("\n") || "（无总结）";
    return {
        sections: {
            longMemory: { count: longEpisodes.length, text: longText },
            short: {
                storyCount: shortMemory.story.length,
                storyText: storyLines,
                eventCount: shortMemory.events.length,
                eventText: eventLines
            },
            world: worldSnapshot
        }
    };
}

function normalizeShortMemory(memory = {}) {
    if (Array.isArray(memory)) {
        return { story: memory.slice(-20), events: [] };
    }
    return {
        story: Array.isArray(memory.story) ? memory.story.slice() : [],
        events: Array.isArray(memory.events) ? memory.events.slice() : []
    };
}

function normalizeLongMemory(data) {
    if (Array.isArray(data)) return data.slice();
    if (!data || !Array.isArray(data.episodes)) return [];
    return data.episodes.slice();
}

function formatStoryMemory(entry) {
    const role = entry.role === "user" ? "我" : entry.role === "system" ? "元书" : entry.role;
    return `${role}：${entry.text}`;
}

function formatEventMemory(entry) {
    const badge = entry.app === "moments" ? "朋友圈" : entry.app === "phone" ? "电话" : "微信";
    return `[${badge}] ${entry.text}`;
}

async function callGroq(prompt) {
    try {
        const systemRules = buildSystemPrompt();
        const messages = [
            { role: "system", content: AI_CONFIG.systemPrompt }
        ];
        if (systemRules) {
            messages.push({ role: "system", content: systemRules });
        }
        messages.push({ role: "user", content: prompt });
        const res = await fetch(AI_CONFIG.apiBase, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages
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
    if (!entry) return;
    const summary = entry.text || JSON.stringify(entry);
    addLongMemoryEpisode({
        summary: `剧情：${summary}`,
        tags: entry.tags || ["story"]
    });
}
