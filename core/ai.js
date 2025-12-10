import { AI_CONFIG } from "../config.js";
import { GameState } from "./state.js";

export async function askAI(text) {
    const payload = {
        model: AI_CONFIG.model,
        messages: [
            { role: "system", content: AI_CONFIG.systemPrompt },
            { role: "user", content: GameState.asContext() },
            { role: "user", content: text }
        ]
    };

    try {
        const res = await fetch(AI_CONFIG.apiBase, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${AI_CONFIG.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        return json.choices?.[0]?.message?.content ?? "【本地】信号被黑雾遮蔽，他暂时沉默。";
    } catch (err) {
        console.error("AI 调用失败", err);
        return "【本地】信号被黑雾遮蔽，他暂时沉默。";
    }
}
