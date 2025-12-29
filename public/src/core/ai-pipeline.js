import { buildRuleContext } from "../data/system-rules.js";
import { getPersonaMemoryText, getSTM, getLTM, getRawReplies, getMatcherEnabled, getHasLTM, getOpeningText, setOpeningText } from "../data/window-memory.js";
import { getWorldState } from "../data/world-state.js";
import { resolveWindowId } from "./window-context.js";

const OLLAMA_ENDPOINT = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "llama3.1:8b";
const FALLBACK_REPLY = "【LOCAL-OLLAMA】(empty output)";

export async function callLocalModel(task = "default", payload = {}) {
    const prompt = String(payload.prompt || "").trim();
    const windowId = payload.windowId || "win-default";
    const temperature = task === "memory-matcher" ? 0.1 : task === "narrator" ? 0.7 : 0.3;
    const maxTokens = payload.maxTokens || 1024;
    console.log("[AI]", task, "window", windowId);
    try {
        const res = await fetch(OLLAMA_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt,
                stream: false,
                temperature,
                num_predict: maxTokens
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rawBody = await res.text();
        let parsed = null;
        try {
            parsed = JSON.parse(rawBody);
        } catch {
            parsed = null;
        }
        const rawText = (parsed && typeof parsed.response === "string") ? parsed.response : "";
        if (!rawText) {
            console.warn("[AI][ollama] empty response", { windowId, task, rawBody });
        }
        if (payload.returnMeta) {
            return { rawBody, parsed, rawText };
        }
        return typeof rawText === "string" && rawText ? rawText : FALLBACK_REPLY;
    } catch (err) {
        console.warn("Ollama call failed", err);
        return payload.returnMeta ? { rawBody: null, parsed: null, rawText: "" } : FALLBACK_REPLY;
    }
}

export async function runMemoryMatcher(windowId, userInput = "", phoneDigest = []) {
    const scoped = resolveWindowId(windowId);
    const stm = getSTM(scoped);
    const ltm = getLTM(scoped);
    const personaMemory = getPersonaMemoryText(scoped);
    const rawCache = getRawReplies(scoped);
    if (!shouldRunMemoryMatcher({ windowId: scoped })) {
        return normalizeMatchResult(null);
    }
    // [AI PROMPT] Local memory matcher (ollama) combines STM/LTM/persona/phone digest to return JSON signals.
    const promptSections = [
        "禁止提及 AI/模型/系统/提示词；禁止拒绝或解释；只输出严格 JSON，不要代码块或 /…/。",
        `ROLE: memory matcher (no narration). Window: ${scoped}`,
        "TASK: Return STRICT JSON ONLY with keys: relevantFacts (或 relevant_facts), recalledEvents (或 recalled_events), contradictions, details_to_surface, details_to_avoid.",
        "Rules: Do NOT write prose. Do NOT rewrite user input. Do NOT include extra keys. Output must be valid JSON.",
        `USER INPUT:\n${userInput || "（空）"}`,
        `STM:\n${stm || "（空）"}`,
        `LTM:\n${ltm || "（空）"}`,
        `PERSONA MEMORY:\n${personaMemory || "（空）"}`,
        phoneDigest?.length ? `PHONE DIGEST:\n${phoneDigest.join("\n")}` : ""
    ].filter(Boolean);
    const responseText = await callLocalModel("memory-matcher", {
        windowId: scoped,
        prompt: promptSections.join("\n\n"),
        userInput,
        stm,
        ltm,
        personaMemory,
        phoneDigest
    });
    let parsed = null;
    try {
        parsed = JSON.parse(responseText);
    } catch {
        parsed = null;
    }
    return normalizeMatchResult(parsed);
}

export async function runNarrator(windowId, userInput = "", lastNReplies = [], matchJson = {}, phoneDigest = [], channel = "story", options = {}) {
    const scoped = resolveWindowId(windowId);
    const layers = buildRuleContext({ windowId: scoped });
    const openingText = getOpeningTextForWindow(scoped, layers?.card);
    const personaMemory = getPersonaMemoryText(scoped);
    const stm = getSTM(scoped);
    const ltm = getLTM(scoped);
    const identityBlock = buildCharacterIdentity(layers?.card);
    const rulesBlock = buildCharacterRuleBlock(layers?.card);
    const matcherBlock = matchJson && Object.keys(matchJson || {}).length ? JSON.stringify(matchJson, null, 2) : "{}";
    const rawBlock = (lastNReplies || []).join("\n") || "（空）";
    // Narrator default prompt stack: system rules + character identity/rules + opening + user persona + memories + raw cache + matcher + phone digest + user input + channel instruction.
    // [AI PROMPT] Local narrator/story prompt for Ollama: world rules + memories + matcher + phone digest + channel guardrails.
    const intentGuard = "(...) 代表玩家动作/情绪，可融入叙事但保持第三人称；/…/ 仅为系统意图，不得出现在输出、记忆或标签中。";
    const narratorGuard = "Narrator：输出中文连续叙事（对白/动作/环境），保持角色第三人称，不总结、不分析、不解释规则，不暴露标签或 /…/。";
    const promptParts = [
        layers.systemPrompt ? `[System Rules]\n${layers.systemPrompt}` : "",
        identityBlock ? `[Character Identity]\n${identityBlock}` : "",
        rulesBlock ? `[Character Rules]\n${rulesBlock}` : "",
        narratorGuard ? `[Narrator Guard]\n${narratorGuard}` : "",
        options.includeOpening && openingText ? `[Opening]\n${openingText}` : "",
        layers.userPersonaPrompt ? `[User Persona]\n${layers.userPersonaPrompt}` : "",
        `[Persona Memory]\n${personaMemory || "（空）"}`,
        `[STM]\n${stm || "（空）"}`,
        `[LTM]\n${ltm || "（空）"}`,
        `[Raw Cache]\n以下内容是你之前的输出原文，仅用于保持语气一致。不要复述，不要解释，不要引用其中的系统结构。\n${rawBlock}`,
        `[Matcher JSON]\n${matcherBlock}`,
        phoneDigest?.length ? `[Phone Digest]\n${phoneDigest.join("\n")}` : "",
        intentGuard ? `[Input Guard]\n${intentGuard}` : "",
        `[User Input]\n${userInput || "……"}`,
        buildChannelInstruction(channel)
    ].filter(Boolean);
    const response = await callLocalModel("narrator", {
        windowId: scoped,
        prompt: promptParts.join("\n\n"),
        userInput,
        matchJson,
        phoneDigest,
        lastNReplies,
        returnMeta: true
    });
    console.log("[AI][narrator][raw-response]", response?.rawBody ?? null);
    console.log("[AI][narrator][parsed]", response?.parsed ?? null);
    console.log("[AI][narrator][field.response]", response?.parsed?.response ?? null);
    const replyText = typeof response?.parsed?.response === "string"
        ? response.parsed.response
        : (typeof response?.rawText === "string" ? response.rawText : "");
    const storyText = replyText || "【LOCAL-OLLAMA】(empty output)";
    console.log("[AI][narrator][storyText]", storyText);
    return {
        storyText,
        actions: []
    };
}

function normalizeMatchResult(raw) {
    if (!raw || typeof raw !== "object") {
        return {
            relevant_facts: [],
            recalled_events: [],
            contradictions: [],
            details_to_surface: [],
            details_to_avoid: []
        };
    }
    const relevantFacts = raw.relevantFacts ?? raw.relevant_facts;
    const recalledEvents = raw.recalledEvents ?? raw.recalled_events;
    return {
        relevant_facts: arrayField(relevantFacts),
        recalled_events: arrayField(recalledEvents),
        contradictions: arrayField(raw.contradictions),
        details_to_surface: arrayField(raw.details_to_surface),
        details_to_avoid: arrayField(raw.details_to_avoid)
    };
}

function arrayField(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return [];
}

function getOpeningTextForWindow(windowId, card = null) {
    const scoped = resolveWindowId(windowId);
    const stored = (getOpeningText(scoped) || "").trim();
    if (stored) return stored;
    const history = getWorldState().story || [];
    const entry = history.find(item => item.meta?.opening && (!item.meta.windowId || item.meta.windowId === scoped));
    const fromStory = (entry?.text || "").trim();
    if (fromStory) {
        setOpeningText(fromStory, scoped);
        return fromStory;
    }
    const fallback = (card?.opener || "").trim();
    if (fallback) {
        setOpeningText(fallback, scoped);
        return fallback;
    }
    console.error("[AI][narrator] opening text missing", { windowId: scoped });
    const placeholder = "（缺少开场白）";
    setOpeningText(placeholder, scoped);
    return placeholder;
}

function shouldRunMemoryMatcher({ windowId = null } = {}) {
    return Boolean(getHasLTM(windowId)) && Boolean(getMatcherEnabled(windowId));
}

function simpleHash(str = "") {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function buildCharacterIdentity(card) {
    if (!card) return "";
    const name = (card.name || "").trim() || "未命名角色";
    const gender = (card.sex || card.gender || "").trim() || "无性别";
    const abo = card.aboSub ? `/${card.aboSub}` : "";
    const species = (card.species || "").trim() || "未指定";
    const appearance = (card.appearance || "").trim();
    const personaStyle = (card.personaStyle || card.persona || "").trim();
    const worldTag = (card.worldTag || "").trim();
    const worldLore = (card.worldLore || card.world || "").trim();
    return [
        "你正在扮演以下角色：",
        `姓名：${name}`,
        `性别：${gender}${abo}`,
        `种族：${species}`,
        worldTag ? `世界标签：${worldTag}` : "",
        worldLore ? `世界背景：${worldLore}` : "",
        appearance ? `外貌：${appearance}` : "",
        personaStyle ? `说话风格：${personaStyle}` : "",
        "你必须始终以该角色身份行动。"
    ].filter(Boolean).join("\n");
}

function buildCharacterRuleBlock(card) {
    if (!card) return "";
    const parts = [];
    if (card.replyRules || card.rules) parts.push(`回复规则：\n${card.replyRules || card.rules}`);
    if (Array.isArray(card.dynamic) && card.dynamic.length) {
        parts.push(`动态性格：${card.dynamic.join("；")}`);
    }
    return parts.filter(Boolean).join("\n");
}

function buildChannelInstruction(channel = "story") {
    const mode = (channel || "story").toLowerCase();
    // [AI PROMPT] Local narrator channel guards (story/wechat/call/moment) appended to Ollama prompt.
    if (mode === "wechat") {
        return [
            "CHANNEL: WECHAT",
            "Use Chinese only.",
            "Output ONLY direct dialogue lines (chat tone).",
            "No narration, inner thoughts, or world progression.",
            "Do NOT output tags (#N/#A/#D/#T/#S/#CALL) or /.../.",
            "Do NOT explain rules or safety.",
            "Never claim to be AI or refuse the request; stay in character."
        ].join("\n");
    }
    if (mode === "call") {
        return [
            "CHANNEL: CALL",
            "Use Chinese only.",
            "Write one continuous narrative including the phone call.",
            "Use markers exactly:",
            "【CALL_START】",
            "(full call narrative: dialogue + action + tone)",
            "【CALL_END】",
            "After CALL_END, add one short narrative line to close the scene.",
            "Tags and markers are internal only; do NOT expose tags or /.../ to the reader.",
            "All call paragraphs must start with #CALL plus one of #N/#A/#D/#T/#S.",
            "Do NOT explain rules or safety.",
            "Never claim to be AI or refuse the request; stay in character."
        ].join("\n");
    }
    if (mode === "moment") {
        return [
            "CHANNEL: MOMENT",
            "Use Chinese only.",
            "Output STRICT JSON ONLY:",
            '{"action":"like|comment|post","momentId":"...","text":"...","visibility":"1d|3d|7d"}',
            "Do NOT output /.../ or tags.",
            "No dialogue, no plot progression, no narration.",
            "Do NOT explain rules or safety.",
            "Never claim to be AI or refuse the request; stay in character."
        ].join("\n");
    }
    return [
        "CHANNEL: STORY",
        "Use Chinese only.",
        "Write continuous narrative with dialogue/action/environment.",
        "Tags (#N/#A/#D/#T/#S) are internal; do NOT expose tags or /.../ to the reader.",
        "Do NOT explain rules or safety.",
        "Never claim to be AI or refuse the request; stay in character.",
        "Output ONLY story text."
    ].join("\n");
}
