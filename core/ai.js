import { getState } from "./state.js";
import { CONFIG } from "../config.js";

function collectRecentChats(limit = 3) {
    const chats = getState("phone.chats") || {};
    const merged = [];
    Object.values(chats).forEach((chat) => {
        const lastLog = chat.log ? chat.log.slice(-limit) : [];
        lastLog.forEach(msg => {
            merged.push({
                chat: chat.name,
                role: msg.from === "out" ? "user" : "npc",
                text: msg.text || msg.kind || "",
                kind: msg.kind || "text"
            });
        });
    });
    return merged.slice(-limit);
}

function collectStory(limit = 6) {
    const story = getState("story") || [];
    return story.slice(-limit);
}

function collectMoments(limit = 2) {
    const moments = getState("phone.moments") || [];
    return moments.slice(-limit);
}

function collectCalls(limit = 3) {
    const calls = getState("phone.calls") || [];
    return calls.slice(-limit);
}

export function buildCompactContext() {
    const wallet = getState("phone.wallet") || {};
    const unreadByApp = getState("phone.unreadByApp") || {};
    const unreadTotal = getState("phone.unreadTotal") || 0;
    return {
        story: collectStory(6),
        chats: collectRecentChats(3),
        walletBalance: wallet.balance || 0,
        calls: collectCalls(3),
        moments: collectMoments(2),
        unread: {
            total: unreadTotal,
            byApp: unreadByApp
        }
    };
}

export async function queryAI(userInput) {
    const context = buildCompactContext();
    const systemPrompt = CONFIG.prompt || "You are Yuan's lightweight AI.";
    const payload = {
        model: CONFIG.MODEL || "mock",
        prompt: `${systemPrompt}\n\nCurrent world-state:\n${JSON.stringify(context)}\n\nUser:${userInput}`
    };
    if (!CONFIG.API_URL) {
        return {
            text: "【占位】AI 接口未配置，当前仅返回本地示例。",
            payload,
            context
        };
    }
    try {
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(CONFIG.API_KEY ? { "Authorization": `Bearer ${CONFIG.API_KEY}` } : {})
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return {
            text: data?.reply ?? data?.text ?? JSON.stringify(data),
            payload,
            context
        };
    } catch (err) {
        console.error("AI request failed:", err);
        return {
            text: "【错误】AI 请求失败。",
            payload,
            context
        };
    }
}
