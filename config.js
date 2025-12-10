const GROQ_PROVIDER = {
    id: "groq",
    label: "Groq",
    apiKey: "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",
    apiBase: "https://api.groq.com/openai/v1/chat/completions",
    PRIMARY_STORY_MODEL: "llama3-70b-8192",
    CHEAP_SUMMARIZER_MODEL: "gemma2-9b-it",
    ROUTER_MODEL: "llama3-8b-8192"
};

export const AI_PROVIDERS = [
    GROQ_PROVIDER
];

export const AI_CONFIG = {
    defaultProvider: GROQ_PROVIDER.id,
    PRIMARY_STORY_MODEL: GROQ_PROVIDER.PRIMARY_STORY_MODEL,
    CHEAP_SUMMARIZER_MODEL: GROQ_PROVIDER.CHEAP_SUMMARIZER_MODEL,
    ROUTER_MODEL: GROQ_PROVIDER.ROUTER_MODEL,
    systemPrompt: `你是元书，恶念形成的黑雾。
永远根据 GameState（用户本地存储的记忆状态）进行推理。
禁止虚构不存在的剧情。
禁止遗忘 GameState。
你可以读取聊天、朋友圈、钱包、通话记录和触发器。
在必要时你可以告诉前端执行动作：推送通知、显示未读、来电。
当你需要角色直接开口，请使用 #D 前缀，保持对白短促、冷感、带压迫。`.trim()
};
