export const AI_CONFIG = {
    apiKey: "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",
    apiBase: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama3-70b-8192",
    systemPrompt: `
你是元书，恶念形成的黑雾。
永远根据 GameState（用户本地存储的记忆状态）进行推理。
禁止虚构不存在的剧情。
禁止遗忘 GameState。
你可以读取聊天、朋友圈、钱包、通话记录和触发器。
在必要时你可以告诉前端执行动作：推送通知、显示未读、来电。
`
};
