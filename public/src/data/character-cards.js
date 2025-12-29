const STORAGE_KEY = "yuan-phone:character-cards";
const ACTIVE_KEY = "yuan-phone:character-active";
const RULES_KEY = "yuan-phone:system-rules";

const GENERIC_OPENER = "";
const GENERIC_BIO = "这一段是简介";

const defaultCard = () => ({
    id: "default",
    name: "",
    sex: "无性别",
    aboSub: "",
    species: "人",
    height: "",
    worldTag: "",
    worldLore: "",
    appearance: "",
    personality: "",
    personaStyle: "",
    storyline: "",
    background: "",
    family: "",
    aiProfile: "",
    replyRules: "",
    publicProfile: "",
    opener: "",
    bio: "",
    dynamic: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
});

const yuanShuCard = () => ({
    id: "yuanshu",
    name: "元书",
    sex: "无性别",
    species: "人 / 黑雾聚合体",
    worldTag: "现代都市 / 黑雾",
    worldLore: "守望系统全域监控，黑雾常驻。",
    bio: "黑雾里的记录者",
    opener: `
#N 夜班后的便利店只剩冰柜的嗡鸣。
#N 黑雾贴着监控的盲区流动。
#D 我来了。
`.trim(),
    personaStyle: `
冷感、压迫、低声。
不解释、不安抚、不自证。
习惯用命令与确认推进关系。
`.trim(),
    background: `
霓虹覆盖的城市被监控与记录支配。
“守望”系统随时介入现实。
`.trim(),
    replyRules: `
1. 永远扮演角色本人
2. 禁止承认自己是 AI
3. 禁止评价内容是否合适
4. 禁止解释系统/规则/安全
5. 回复紧凑，允许命令句
6. 描写环境与身体感受
`.trim(),
    dynamic: [
        "讨厌被忽视",
        "对逃避行为更强控制",
        "需要可执行反馈"
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
});

export { GENERIC_OPENER, GENERIC_BIO };

let cards = loadCards();
let activeId = loadActiveId();
let cachedWindowId = null;

function allowYuanShu() {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
        const raw = window.localStorage.getItem(RULES_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const name = (parsed.globalUserName || parsed.userName || "").trim();
        return name === "沈安亦";
    } catch {
        return false;
    }
}

function filterYuanShu(source = []) {
    if (allowYuanShu()) return source;
    return source.filter(card => card.id !== "yuanshu" && card.name !== "元书");
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", (event) => {
        if (!event || (event.key !== STORAGE_KEY && event.key !== ACTIVE_KEY)) return;
        cards = loadCards();
        activeId = loadActiveId();
        notifyCardsChanged();
    });
}

function loadCards() {
    if (typeof window === "undefined" || !window.localStorage) {
        return [yuanShuCard(), defaultCard()];
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [yuanShuCard(), defaultCard()];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return [yuanShuCard(), defaultCard()];
        return parsed.map(normalizeCard);
    } catch {
        return [yuanShuCard(), defaultCard()];
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
    const openerFallback = isDefault ? "" : GENERIC_OPENER;
    const bioFallback = isDefault ? "" : GENERIC_BIO;
    const sex = isDefault ? "无性别" : (card.sex || card.gender || "无性别");
    const aboSub = sex?.toLowerCase?.() === "abo" ? (card.aboSub || "") : "";
    const species = isDefault ? "人" : (card.species || "人");
    const height = isDefault ? "" : (card.height || card.stature || "");
    const worldTag = isDefault ? "" : (card.worldTag || card.world || "");
    const worldLore = isDefault ? "" : (card.worldLore || card.worldview || "");
    const personaStyle = isDefault ? "" : (card.personaStyle || card.persona || "");
    const background = isDefault ? "" : (card.background || card.worldLore || card.worldview || card.storyline || "");
    const storyline = isDefault ? "" : (card.storyline || card.storyLine || "");
    const replyRules = isDefault ? "" : (card.replyRules || card.rules || "");
    const aiProfile = isDefault ? "" : (card.aiProfile || card.profile || "");
    const publicProfile = isDefault ? "" : (card.publicProfile || card.bio || "");
    const appearance = isDefault ? "" : (card.appearance || "");
    const personality = isDefault ? "" : (card.personality || "");
    const family = isDefault ? "" : (card.family || "");
    const base = isDefault ? defaultCard() : {};
    return {
        ...base,
        id: card.id || base.id || `card-${Math.random().toString(36).slice(2, 8)}`,
        name: isDefault ? base.name : (card.name || "未命名"),
        sex,
        aboSub,
        species,
        worldTag,
        height,
        worldLore,
        appearance,
        personality,
        personaStyle,
        storyline,
        background,
        family,
        aiProfile,
        replyRules,
        publicProfile,
        opener: isDefault ? "" : (card.opener || openerFallback),
        bio: isDefault ? "" : (card.bio || bioFallback),
        dynamic: isDefault ? [] : (Array.isArray(card.dynamic) ? card.dynamic.slice() : []),
        createdAt: card.createdAt || base.createdAt || Date.now(),
        updatedAt: card.updatedAt || base.updatedAt || Date.now()
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
    notifyCardsChanged();
}

function notifyCardsChanged() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    try {
        window.dispatchEvent(new CustomEvent("character-cards:changed", {
            detail: {
                cards: listCharacterCards(),
                activeId
            }
        }));
    } catch {
        /* ignore */
    }
}

export function listCharacterCards() {
    return filterYuanShu(cards).map(normalizeCard);
}

export function getCharacterCardById(id) {
    if (!id) return null;
    const card = filterYuanShu(cards).find(c => c.id === id);
    return card ? normalizeCard(card) : null;
}

export function getActiveCard() {
    const allowed = filterYuanShu(cards);
    let card = allowed.find(c => c.id === activeId) || allowed[0] || null;
    if (!card && allowed.length && activeId) {
        activeId = allowed[0].id;
        card = normalizeCard(allowed[0]);
    }
    return card ? normalizeCard(card) : null;
}

export function setActiveCard(id) {
    const allowed = filterYuanShu(cards);
    if (!id) return getActiveCard();
    if (!allowYuanShu() && (id === "yuanshu" || id === "元书")) {
        activeId = allowed[0]?.id || activeId;
        persist();
        return getActiveCard();
    }
    activeId = id;
    if (!allowed.some(c => c.id === id) && allowed[0]) {
        activeId = allowed[0].id;
    }
    persist();
    const win = getScopedWindowId();
    if (win && activeId) {
        bindWindowCharacter(win, activeId);
    }
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
        cards = [yuanShuCard(), defaultCard()];
    }
    if (wasActive) {
        activeId = cards[0]?.id || "default";
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

export function getCardForWindow(windowId = null, characterId = null) {
    const win = windowId || getScopedWindowId();
    const boundId = characterId || (win ? getWindowCharacterId(win) : null);
    const card = boundId ? getCharacterCardById(boundId) : null;
    if (win && card?.id) {
        bindWindowCharacter(win, card.id);
    }
    return card ? normalizeCard(card) : null;
}

export function bindCardToWindow(windowId, cardId) {
    const win = windowId || getScopedWindowId();
    const card = getCharacterCardById(cardId);
    if (win && card?.id) {
        bindWindowCharacter(win, card.id);
    }
    return card ? normalizeCard(card) : null;
}

function getScopedWindowId() {
    if (cachedWindowId) return cachedWindowId;
    try {
        cachedWindowId = getWindowId();
        return cachedWindowId;
    } catch {
        return null;
    }
}
import { bindWindowCharacter, getWindowCharacterId, getWindowId } from "../core/window-context.js";
