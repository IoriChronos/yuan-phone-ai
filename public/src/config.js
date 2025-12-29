// ================================
// Providers
// ================================

// 本地主力（默认）
// 稳定、长文、可控 —— qwen2.5:14b
const LOCAL_PROVIDER = {
    id: "local",
    label: "qwen2.5:14b",
    kind: "local",

    narratorModel: "qwen2.5:14b",
    storyModel: "qwen2.5:14b",

    setupAssistantModel: "qwen2.5:7b",
    summarizerModel: "llama3.1:8b",
    matcherModel: "llama3.1:8b",
    utilityModel: "llama3.1:8b",
    systemModel: "llama3.1:8b"
};

// 高自由度强文笔（Hermes）
const HERMES_PROVIDER = {
    id: "insane-writer",
    label: "失控文笔",
    kind: "local",

    narratorModel: "hermes3:8b",
    storyModel: "hermes3:8b",

    setupAssistantModel: "qwen2.5:7b",
    summarizerModel: "llama3.1:8b",
    matcherModel: "llama3.1:8b",
    utilityModel: "llama3.1:8b",
    systemModel: "llama3.1:8b"
};

// 直觉型 / 无过滤兜底
const DOLPHIN_PROVIDER = {
    id: "no-filter",
    label: "无过滤直觉",
    kind: "local",

    narratorModel: "dolphin",
    storyModel: "dolphin",

    setupAssistantModel: "qwen2.5:7b",
    summarizerModel: "llama3.1:8b",
    matcherModel: "llama3.1:8b",
    utilityModel: "llama3.1:8b",
    systemModel: "llama3.1:8b"
};

// Gemini（HTTP / 云端）
const GEMINI_HTTP_PROVIDER = {
    id: "gemini",
    label: "Gemini 2.0 Flash",
    kind: "gemini",

    apiBase: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    apiKey: "<GEMINI_API_KEY>",

    narratorModel: "gemini-2.0-flash",
    storyModel: "gemini-2.0-flash",

    setupAssistantModel: "gemini-2.0-flash",
    summarizerModel: "gemini-2.0-flash",
    matcherModel: "gemini-2.0-flash",
    utilityModel: "gemini-2.0-flash",
    systemModel: "gemini-2.0-flash"
};

// Claude（占位，不启用）
const CLAUDE_PROVIDER = {
    id: "claude",
    label: "Claude（未启用）",
    kind: "http",

    apiBase: "<CLAUDE_API_BASE>",
    apiKey: "<CLAUDE_API_KEY>",

    narratorModel: "<CLAUDE_MODEL>",
    storyModel: "<CLAUDE_MODEL>",

    setupAssistantModel: "<CLAUDE_MODEL>",
    summarizerModel: "<CLAUDE_MODEL>",
    matcherModel: "<CLAUDE_MODEL>",
    utilityModel: "<CLAUDE_MODEL>",
    systemModel: "<CLAUDE_MODEL>"
};

// ================================
// Provider Registry
// ================================

export const AI_PROVIDERS = [
    LOCAL_PROVIDER,        // ✅ 默认
    HERMES_PROVIDER,       // 强文笔
    DOLPHIN_PROVIDER,      // 无过滤
    GEMINI_HTTP_PROVIDER   // 云端
    // CLAUDE_PROVIDER      // 未来启用
];

// ================================
// Global AI Config
// ================================

export const AI_CONFIG = {
    // 🔥 默认就是 qwen2.5:14b
    defaultProvider: LOCAL_PROVIDER.id,

    // Narrator 下拉（只影响剧情）
    narratorModel: "qwen2.5:14b",
    narratorModels: [
        "qwen2.5:14b",
        "hermes3:8b",
        "dolphin",
        "gemini-2.0-flash"
    ],

    // 固定后台分工（不受 UI 影响）
    summarizerModel: "llama3.1:8b",
    matcherModel: "llama3.1:8b",
    setupAssistantModel: "qwen2.5:7b",
    initializerModel: "qwen2.5:7b",

    roleRouting: {
        story: {
            defaultProvider: LOCAL_PROVIDER.id,
            modelKey: "narratorModel"
        },
        utility: {
            defaultProvider: LOCAL_PROVIDER.id,
            modelKey: "utilityModel"
        },
        system: {
            defaultProvider: LOCAL_PROVIDER.id,
            modelKey: "systemModel"
        },
        setup: {
            defaultProvider: LOCAL_PROVIDER.id,
            modelKey: "setupAssistantModel"
        },
        initializer: {
            defaultProvider: LOCAL_PROVIDER.id,
            modelKey: "initializerModel"
        }
    },

    // 兜底常量（历史兼容）
    PRIMARY_STORY_MODEL: "qwen2.5:14b",
    CHEAP_SUMMARIZER_MODEL: "llama3.1:8b",
    ROUTER_MODEL: "llama3.1:8b",
    PHONE_MODEL: "llama3.1:8b",

    storyModel: "qwen2.5:14b",
    memoryModel: "llama3.1:8b",
    phoneModel: "llama3.1:8b",

    systemPrompt: ""
};

// ================================
// Wallet
// ================================

export const WALLET_DEFAULT = {
    balance: 10000,
    events: []
};