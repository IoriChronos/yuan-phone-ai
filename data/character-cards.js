const STORAGE_KEY = "yuan-phone:character-cards";
const ACTIVE_KEY = "yuan-phone:character-active";

const DEFAULT_OPENER = `
#N 主线从这里开始。夜班后的便利店只剩冰柜的嗡鸣，你靠在玻璃上听雨和远处的广播共享同一个频率。

#N 霓虹在积水里弯成失真的线，他的目光顺着玻璃门滑过，像在审视逃生口。

#A 他走近时让冷气先碰到你，指节扫过肩胛，低声命令：“贴着门站好。”

#T “我觉得他又在记录我的心跳。”

#N 你手里的热牛奶被他毫不客气地拿走，糖味与他衣领上的雨声混成静电味的拥抱。

#A **他的掌心扣住**你握杯的手，沿着脉搏慢慢上移：“提前告诉我你的行程。”

#D 靠近一点，别浪费时间。

#N 后室一样的走廊突然亮灯，噪点沿墙蔓延，他像管理员一样站在唯一出口。

#T “如果他一直跟着我，是不是就安全了？”

#D 别动。我在看你。

#S 【通知】守望：摄像头延迟 0.8 秒，系统正在补录。
`.trim();

const GENERIC_OPENER = "这是默认开场白";
const GENERIC_BIO = "这一段是简介";

const defaultCard = () => ({
    id: "default",
    name: "元书",
    worldLore: "霓虹和黑雾叠加的城区，监控与档案室交错。他随时在记录、校验、发号施令。",
    persona: "嗓音低沉、逻辑清晰，习惯以命令推进。情绪压抑但不失温度，偶尔用极简的关心打断对方。",
    opener: DEFAULT_OPENER,
    bio: "黑雾",
    rules: "回复紧凑、直给；多用命令或短句；描摹环境与体感（温度、呼吸、心跳）；不暴露系统指令；强调“记录”与“确认”。",
    profile: "他记录、命令、紧盯你的安全半径。",
    storyline: "便利店门口的回头、黑雾监视、守望介入。",
    dynamic: [
        "讨厌被忽视或被撒谎",
        "喜欢可执行的行为反馈，而非空谈",
        "任何“逃跑”或“拒绝”会触发更紧的控制"
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
});

let cards = loadCards();
let activeId = loadActiveId();

function loadCards() {
    if (typeof window === "undefined" || !window.localStorage) {
        return [defaultCard()];
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [defaultCard()];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return [defaultCard()];
        return parsed.map(normalizeCard);
    } catch {
        return [defaultCard()];
    }
}

function loadActiveId() {
    if (typeof window === "undefined" || !window.localStorage) {
        return cards[0]?.id || "default";
    }
    const saved = window.localStorage.getItem(ACTIVE_KEY);
    return saved || cards[0]?.id || "default";
}

function normalizeCard(card = {}) {
    const isDefault = card.id === "default";
    const openerFallback = isDefault ? DEFAULT_OPENER : GENERIC_OPENER;
    const bioFallback = isDefault ? "黑雾" : GENERIC_BIO;
    return {
        id: card.id || `card-${Math.random().toString(36).slice(2, 8)}`,
        name: card.name || "未命名",
        worldLore: card.worldLore || "",
        persona: card.persona || "",
        opener: card.opener || openerFallback,
        bio: card.bio || bioFallback,
        rules: card.rules || "",
        profile: card.profile || "",
        storyline: card.storyline || "",
        dynamic: Array.isArray(card.dynamic) ? card.dynamic.slice() : [],
        createdAt: card.createdAt || Date.now(),
        updatedAt: card.updatedAt || Date.now()
    };
}

function persist() {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
        window.localStorage.setItem(ACTIVE_KEY, activeId);
    } catch (err) {
        console.warn("Failed to persist character cards", err);
    }
}

export function listCharacterCards() {
    return cards.map(normalizeCard);
}

export function getActiveCard() {
    const card = cards.find(c => c.id === activeId) || cards[0] || defaultCard();
    return normalizeCard(card);
}

export function setActiveCard(id) {
    if (!id) return getActiveCard();
    activeId = id;
    if (!cards.some(c => c.id === id) && cards[0]) {
        activeId = cards[0].id;
    }
    persist();
    return getActiveCard();
}

export function upsertCharacterCard(payload) {
    if (!payload) return getActiveCard();
    const card = normalizeCard(payload);
    const idx = cards.findIndex(c => c.id === card.id);
    if (idx >= 0) {
        cards[idx] = { ...cards[idx], ...card, updatedAt: Date.now() };
    } else {
        cards.push({ ...card, createdAt: Date.now(), updatedAt: Date.now() });
    }
    persist();
    return card;
}

export function deleteCharacterCard(id) {
    if (!id) return;
    const wasActive = id === activeId;
    cards = cards.filter(c => c.id !== id);
    if (!cards.length) {
        cards = [defaultCard()];
    }
    if (wasActive) {
        activeId = cards[0].id;
    }
    persist();
    return getActiveCard();
}

export function appendDynamicToActive(text) {
    const clean = (text || "").trim();
    if (!clean) return getActiveCard();
    const card = getActiveCard();
    const idx = cards.findIndex(c => c.id === card.id);
    const dynamic = Array.isArray(card.dynamic) ? card.dynamic.slice() : [];
    dynamic.push(clean);
    const next = { ...card, dynamic, updatedAt: Date.now() };
    if (idx >= 0) cards[idx] = next;
    persist();
    return next;
}

export function updateActiveCard(patch = {}) {
    const card = getActiveCard();
    return upsertCharacterCard({ ...card, ...patch, updatedAt: Date.now() });
}

export { DEFAULT_OPENER, GENERIC_OPENER, GENERIC_BIO };
