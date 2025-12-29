import { AI_CONFIG, AI_PROVIDERS } from "../config.js";
import { getWorldState } from "../data/world-state.js";
import { addLongMemoryEpisode } from "../data/memory-long.js";
import { buildRuleContext } from "../data/system-rules.js";
import {
    getCardForWindow,
    getActiveCard,
    bindCardToWindow
} from "../data/character-cards.js";
import {
    getWindowId,
    assertWindowId,
    windowScopedKey,
    getWindowCharacterId,
    getKnownWindowBindings
} from "./window-context.js";
import {
    getSTM,
    getLTM,
    getPersonaMemoryText,
    getRawReplies,
    getRawContextCache as readRawContextCache,
    pushRawReply,
    getMatcherEnabled,
    getHasLTM,
    getMemoryAutoFlags,
    getIsFirstTurn,
    getOpeningText,
    setOpeningText
} from "../data/window-memory.js";
import { callLocalModel } from "./ai-pipeline.js";
import {
    buildNarratorGuard,
    getNarratorIntentGuard
} from "../prompts/narrator-prompts.js";
import { buildCharacterIdentityBlock, buildCharacterRulesBlock } from "./prompt-blocks.js";
import { requestWorldAction } from "./world-driver.js";

const ROLE_ROUTING = AI_CONFIG.roleRouting || {
    story: { defaultProvider: AI_CONFIG.defaultProvider, modelKey: "narratorModel" },
    utility: { defaultProvider: AI_CONFIG.defaultProvider, modelKey: "utilityModel" },
    system: { defaultProvider: AI_CONFIG.defaultProvider, modelKey: "systemModel" },
    setup: { defaultProvider: AI_CONFIG.defaultProvider, modelKey: "setupAssistantModel" },
    initializer: { defaultProvider: AI_CONFIG.defaultProvider, modelKey: "initializerModel" }
};

const TASK_ROLE_MAP = {
    story: "story",
    summarize: "utility",
    classify: "system",
    "tool-plan": "system",
    phone: "utility",
    setup: "setup",
    initializer: "initializer"
};

const PROVIDER_STORAGE_KEY = windowScopedKey("yuan-phone:ai-provider");
const SAFE_BLOCK_NOTICE = "（系统拦截：检测到跨窗口上下文，已丢弃 AI 输出）";
const LOCAL_MARKER = "【LOCAL-OLLAMA】";
const FALLBACK_REPLY = "AI 无回复";
const LOCAL_EMPTY_FALLBACK = "【LOCAL-OLLAMA】(empty output)";
const DEFAULT_CARD_ID = "default";
const DAY_MS = 24 * 60 * 60 * 1000;
const NARRATOR_MODEL_STORAGE_KEY = "yuan-phone:narrator-model";

let activeProviderId = loadActiveProviderId();
let activeNarratorModel = loadActiveNarratorModel();

function loadActiveProviderId() {
    if (typeof window === "undefined" || !window.localStorage) {
        return AI_CONFIG.defaultProvider || (AI_PROVIDERS[0]?.id ?? "groq");
    }
    const saved = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    return saved || AI_CONFIG.defaultProvider || (AI_PROVIDERS[0]?.id ?? "groq");
}

function loadActiveNarratorModel() {
    if (typeof window === "undefined" || !window.localStorage) {
        return AI_CONFIG.narratorModel || AI_CONFIG.PRIMARY_STORY_MODEL;
    }
    const saved = window.localStorage.getItem(NARRATOR_MODEL_STORAGE_KEY);
    return saved || AI_CONFIG.narratorModel || AI_CONFIG.PRIMARY_STORY_MODEL;
}

function persistActiveProvider(id) {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PROVIDER_STORAGE_KEY, id);
}

function persistActiveNarratorModel(model) {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(NARRATOR_MODEL_STORAGE_KEY, model);
}

function resolveProvider(id = activeProviderId) {
    return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0] || {
        id: "default",
        label: "Default",
        apiKey: "",
        apiBase: "",
        PRIMARY_STORY_MODEL: AI_CONFIG.PRIMARY_STORY_MODEL,
        CHEAP_SUMMARIZER_MODEL: AI_CONFIG.CHEAP_SUMMARIZER_MODEL,
        ROUTER_MODEL: AI_CONFIG.ROUTER_MODEL
    };
}

function selectProviderForRole(role, explicitId) {
    const route = ROLE_ROUTING[role] || ROLE_ROUTING.story || {};
    const candidate = explicitId || activeProviderId || route.defaultProvider || AI_CONFIG.defaultProvider;
    const picked = resolveProvider(candidate);
    if (picked) return picked;
    if (route.defaultProvider && route.defaultProvider !== candidate) {
        return resolveProvider(route.defaultProvider);
    }
    return resolveProvider(AI_CONFIG.defaultProvider);
}

function resolveModelForRole(provider, role) {
    const route = ROLE_ROUTING[role] || {};
    const key = route.modelKey || "storyModel";
    const fallbackKey = ROLE_ROUTING.story?.modelKey || "storyModel";
    return provider[key]
        || provider[fallbackKey]
        || provider.PRIMARY_STORY_MODEL
        || AI_CONFIG[key]
        || AI_CONFIG.PRIMARY_STORY_MODEL;
}

function pickModelOverride(role) {
    const mode = (role || "story").toLowerCase();
    if (mode === "story" || mode === "wechat" || mode === "call" || mode === "moment") {
        return getActiveNarratorModel();
    }
    if (mode === "setup") {
        return AI_CONFIG.setupAssistantModel || "qwen2.5:7b";
    }
    if (mode === "summarize") {
        return AI_CONFIG.summarizerModel || AI_CONFIG.memoryModel;
    }
    if (mode === "utility") {
        return AI_CONFIG.matcherModel || AI_CONFIG.CHEAP_SUMMARIZER_MODEL;
    }
    if (mode === "initializer") {
        return AI_CONFIG.initializerModel || "qwen2.5:7b";
    }
    return null;
}

function normalizeMessages({ systemPrompt, prompt, messages = [] }) {
    const normalized = Array.isArray(messages) ? messages.map(m => ({
        role: m.role || "user",
        content: m.content || ""
    })) : [];
    const hasSystem = normalized.some(m => m.role === "system");
    const finalMessages = [];
    if (systemPrompt && !hasSystem) {
        finalMessages.push({ role: "system", content: systemPrompt });
    }
    finalMessages.push(...normalized);
    if (prompt) {
        finalMessages.push({ role: "user", content: prompt });
    }
    return finalMessages;
}

function pickAdapter(provider) {
    if (!provider || provider.kind === "local") return adapterLocal;
    if (provider.kind === "gemini") return adapterGemini;
    if (provider.kind === "claude" || provider.kind === "openai") {
        return adapterOpenAI;
    }
    return adapterOpenAI;
}

async function adapterGemini(provider, body) {
    const prompt = (body.prompt || renderMessagesAsPrompt(body.messages || []) || "").trim();
    const url = provider.apiBase.includes("key=")
        ? provider.apiBase
        : `${provider.apiBase}?key=${encodeURIComponent(provider.apiKey || "")}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": provider.apiKey || ""
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            })
        });
        if (!res.ok) {
            console.warn("Gemini request failed", res.status);
            return "";
        }
        const rawBody = await res.json();
        const text = rawBody?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { text, rawBody, parsed: rawBody };
    } catch (err) {
        console.warn("Gemini call failed", err);
        return "";
    }
}

async function adapterOpenAI(provider, body) {
    try {
        const res = await fetch(provider.apiBase, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify(body)
        });
        const json = await res.json();
        return json.choices?.[0]?.message?.content || "";
    } catch (err) {
        console.warn("AI request failed", err);
        return "";
    }
}

async function adapterLocal(_, body) {
    const prompt = (body.prompt || renderMessagesAsPrompt(body.messages || []) || "").trim();
    const task = body.role === "utility"
        ? "memory-matcher"
        : (body.role === "setup" ? "setup-assistant" : (body.role === "initializer" ? "initializer" : "narrator"));
    const res = await callLocalModel(task, {
        windowId: body.windowId || "win-default",
        prompt,
        returnMeta: true
    });
    const rawText = typeof res?.parsed?.response === "string"
        ? res.parsed.response
        : (typeof res?.rawText === "string" ? res.rawText : "");
    return {
        text: rawText || "",
        rawBody: res?.rawBody || null,
        parsed: res?.parsed || null
    };
}

function detectForeignContext(text, { windowId } = {}) {
    if (!text) return "空回复";
    const bindings = getKnownWindowBindings();
    const otherWindowIds = Object.keys(bindings || {}).filter(id => id !== windowId);
    if (otherWindowIds.some(id => text.includes(id))) {
        return "跨窗口 windowId 泄露";
    }
    return null;
}

function validateAIText(text, { windowId, character, providerId, requestId = null } = {}) {
    const contamination = detectForeignContext(text, { windowId });
    if (contamination) {
        console.warn(`[AI][warn] cross-context hint detected but not blocking`, { windowId, characterId: character?.id, reason: contamination });
    }
    return {
        text: text || "",
        blocked: false,
        blockedReason: contamination || null,
        providerId,
        windowId,
        characterId: character?.id,
        requestId: requestId || null
    };
}

function ensureWindowId(windowId) {
    const current = windowId || getWindowId();
    assertWindowId(current);
    return current;
}

function resolveCharacter(windowId, characterId) {
    const card = getCardForWindow(windowId, characterId);
    if (windowId && card?.id) {
        bindCardToWindow(windowId, card.id);
    }
    return card;
}

function stripMarker(text = "") {
    if (!text) return "";
    return text.replace(new RegExp(`^${LOCAL_MARKER}\\s*`, "i"), "").trim();
}

function sanitizeNarratorOutput(text = "") {
    if (!text) return "";
    let cleaned = text;
    cleaned = stripCallMarkers(cleaned);
    // Remove fenced code blocks
    cleaned = cleaned.replace(/```[\\s\\S]*?```/g, "");
    // Drop obvious debug/system scaffolding lines
    const forbidden = [
        "SYSTEM RULES",
        "USER PERSONA",
        "RAW CONTEXT",
        "MEMORY MATCHER",
        "WINDOW",
        "DEBUG",
        "PROMPT",
        "JSON",
        "MATCH JSON",
        "CONTEXT CACHE",
        "WINDOWID",
        "CHARACTER"
    ];
    cleaned = cleaned
        .split("\n")
        .filter(line => !forbidden.some(key => line.toUpperCase().includes(key)))
        .join("\n");
    // Strip accidental window ids
    cleaned = cleaned.replace(/\bwin-[a-z0-9_-]+\b/gi, "");
    return cleaned.trim();
}

function ensureMarker(text = "") {
    const clean = stripMarker(text);
    if (!clean) return LOCAL_MARKER;
    return `${LOCAL_MARKER}${clean.startsWith(" ") ? "" : " "}${clean}`;
}

function stripCallMarkers(text = "") {
    if (!text) return "";
    return String(text).replace(/【CALL_START】/g, "").replace(/【CALL_END】/g, "").trim();
}

function normalizeMomentVisibility(value) {
    if (value === "self") return "self";
    const num = Number(value);
    if (num === 1 || num === 3 || num === 7) return num;
    return 7;
}

function normalizeMomentTimestamp(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return Date.now();
}

function formatMomentRelative(ts, now = Date.now()) {
    const created = normalizeMomentTimestamp(ts);
    const diff = Math.max(0, now - created);
    if (diff < 60 * 60 * 1000) return "刚刚";
    if (diff < DAY_MS) return "今天";
    if (diff < 2 * DAY_MS) return "昨天";
    const days = Math.round(diff / DAY_MS);
    return `${days}天前`;
}

function summarizeMomentForPrompt(moment, now = Date.now()) {
    if (!moment) return "";
    const when = formatMomentRelative(moment.createdAt, now);
    const author = (moment.who || "访客").trim();
    const text = (moment.text || "").trim().replace(/\s+/g, " ");
    const short = text.length > 40 ? `${text.slice(0, 40)}…` : (text || "（空）");
    const label = author ? `${author} ` : "";
    return `- ${when}：${label}${short}`;
}

function buildMomentsContextBlock(windowId = null) {
    const scoped = windowId || getWindowId();
    const now = Date.now();
    const readable = (getWorldState().moments || []).filter(m => {
        if (!m) return false;
        if (m.deleted) return false;
        if (m.windowId && scoped && m.windowId !== scoped) return false;
        const visibility = normalizeMomentVisibility(m.visibilityDays);
        if (visibility === "self") return false;
        const created = normalizeMomentTimestamp(m.createdAt);
        return created >= now - visibility * DAY_MS;
    }).sort((a, b) => normalizeMomentTimestamp(b.createdAt) - normalizeMomentTimestamp(a.createdAt));
    const limited = readable.slice(0, 8);
    const lines = limited.map(m => summarizeMomentForPrompt(m, now)).filter(Boolean);
    if (!lines.length) return "";
    return `[MOMENTS_CONTEXT]\n${lines.join("\n")}\n[/MOMENTS_CONTEXT]`;
}

function getRawContextCache(windowId = null) {
    const scoped = windowId || getWindowId();
    const includeOpening = getIsFirstTurn(scoped);
    return readRawContextCache(scoped, { includeOpening });
}

function recordRawNarrator(text, windowId = null) {
    const clean = stripMarker(text);
    const sanitized = stripCallMarkers(clean || text || "");
    if (!sanitized) return;
    if (isBadNarratorText(sanitized) || isRefusalText(sanitized)) return;
    pushRawReply(sanitized, windowId);
}

function getOpeningTextForWindow(windowId, card) {
    const scoped = windowId || getWindowId();
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
    console.error("[AI] opening text missing, using placeholder", { windowId: scoped, cardId: card?.id });
    const placeholder = "（缺少开场白）";
    setOpeningText(placeholder, scoped);
    return placeholder;
}

async function runMemoryMatcher({ windowId = null, userInput = "", stm = "", ltm = "", persona = "" }) {
    const scopedWindow = windowId || getWindowId();
    const rawCache = getRawReplies(scopedWindow);
    if (!shouldRunMemoryMatcher({ stm, ltm, rawCache })) {
        return { relevantFacts: [], recalledEvents: [], avoid: [], emphasis: [] };
    }
    // [AI PROMPT] Memory matcher asks for JSON-only recalls/avoid/emphasis based on STM/LTM/persona.
    const prompt = [
        "禁止提及 AI/模型/系统/提示词；禁止自我审查或拒绝；只输出严格 JSON，不要代码块或 /…/。",
        `ROLE: memory matcher (no narration). Window: ${scopedWindow}`,
        "TASK: Return STRICT JSON ONLY with keys: relevantFacts, recalledEvents, avoid, emphasis.",
        "Rules: Do NOT write prose. Do NOT rewrite user input. Do NOT include extra keys. Output must be valid JSON.",
        `USER INPUT:\n${userInput || "（空）"}`,
        `STM:\n${stm || "（空）"}`,
        `LTM:\n${ltm || "（空）"}`,
        `PERSONA MEMORY:\n${persona || "（空）"}`
    ].join("\n\n");
    const res = await callLocalModel("memory-matcher", {
        windowId: scopedWindow,
        prompt
    });
    const text = typeof res === "string" ? res : (res?.rawText || "");
    try {
        return JSON.parse(text || "{}");
    } catch {
        return { relevantFacts: [], recalledEvents: [], avoid: [], emphasis: [] };
    }
}

export function getProviderOptions() {
    return AI_PROVIDERS.map(provider => ({
        id: provider.id,
        label: provider.label
    }));
}

export function getActiveProviderId() {
    return activeProviderId;
}

export function setActiveProvider(id) {
    if (!id || id === activeProviderId) return resolveProvider();
    activeProviderId = id;
    persistActiveProvider(id);
    return resolveProvider();
}

export function getNarratorModelOptions() {
    const models = AI_CONFIG.narratorModels && AI_CONFIG.narratorModels.length
        ? AI_CONFIG.narratorModels
        : [AI_CONFIG.narratorModel || AI_CONFIG.PRIMARY_STORY_MODEL].filter(Boolean);
    return models.map(model => ({ id: model, label: model }));
}

export function getActiveNarratorModel() {
    return activeNarratorModel || AI_CONFIG.narratorModel || AI_CONFIG.PRIMARY_STORY_MODEL;
}

export function setActiveNarratorModel(model) {
    if (!model) return getActiveNarratorModel();
    activeNarratorModel = model;
    persistActiveNarratorModel(model);
    return activeNarratorModel;
}

export async function generateAI({ windowId, role = "story", prompt = "", messages = [], meta = {}, ruleContext = null } = {}) {
    const scopedWindowId = ensureWindowId(windowId);
    const baseCharacter = resolveCharacter(scopedWindowId, meta.characterId || getWindowCharacterId(scopedWindowId));
    const isInitializer = role === "initializer";
    const layers = isInitializer
        ? { card: baseCharacter, systemPrompt: "" }
        : (ruleContext || buildRuleContext({ card: baseCharacter, windowId: scopedWindowId }));
    const character = layers.card || baseCharacter;
    const provider = selectProviderForRole(role, meta.providerId);
    const modelOverride = pickModelOverride(role);
    const systemPrompt = isInitializer
        ? (AI_CONFIG.initializerSystemPrompt || AI_CONFIG.systemPrompt || "")
        : [AI_CONFIG.systemPrompt, layers.systemPrompt].filter(Boolean).join("\n\n");
    const payload = {
        model: modelOverride || resolveModelForRole(provider, role),
        messages: normalizeMessages({ systemPrompt, prompt, messages }),
        max_tokens: meta.maxTokens,
        role,
        windowId: scopedWindowId,
        characterId: character?.id,
        requestId: meta.requestId || null
    };
    if (typeof console !== "undefined" && console.debug) {
        console.debug("[AI] dispatch", {
            role,
            model: payload.model,
            provider: provider?.id,
            windowId: scopedWindowId,
            requestId: payload.requestId || null
        });
    }
    const adapter = pickAdapter(provider);
    const adapterResult = await adapter(provider, payload);
    const hasMeta = adapterResult && typeof adapterResult === "object" && !Array.isArray(adapterResult);
    const text = hasMeta ? adapterResult.text : adapterResult;
    const validated = validateAIText(text, { windowId: scopedWindowId, character, providerId: provider?.id, requestId: meta.requestId || null });
    if (hasMeta) {
        validated.rawResponse = adapterResult;
    }
    return validated;
}

export async function callModel(task = "story", { messages = [], maxTokens } = {}) {
    const role = TASK_ROLE_MAP[task] || "story";
    const response = await generateAI({ role, messages, meta: { maxTokens } });
    return response.text;
}

export async function askAI(userInput = "", meta = {}) {
    const windowId = ensureWindowId(meta.windowId);
    const card = resolveCharacter(windowId, meta.characterId || getWindowCharacterId(windowId));
    if (isDefaultCard(card)) {
        console.warn("[AI] askAI aborted: default card", { windowId });
        return "";
    }
    const ruleContext = buildRuleContext({ card, windowId });
    const prompt = buildContextDocument(userInput, { windowId, card, ruleContext });
    const result = await generateAI({
        windowId,
        role: "story",
        prompt,
        meta: { ...meta, characterId: card?.id },
        ruleContext
    });
    return result.text || "";
}

export async function runSetupAssistant(card = {}, userPreference = "", windowId = null) {
    const scopedWindowId = ensureWindowId(windowId);
    const prompt = buildSetupAssistantPrompt(card, userPreference);
    const requestId = `setup-${Date.now()}`;
    console.debug("[SetupAssistant] start", { windowId: scopedWindowId, requestId, hasPref: Boolean(userPreference) });
    const response = await generateAI({
        windowId: scopedWindowId,
        role: "setup",
        prompt,
        meta: { maxTokens: 600, requestId }
    });
    const text = response?.text || "";
    let parsed = {};
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        console.warn("[SetupAssistant] JSON parse failed", { windowId: scopedWindowId, text: text?.slice(0, 120) });
        parsed = {};
    }
    const allowed = ["appearance", "personality", "personaStyle", "background", "family", "worldLore", "worldTag"];
    const result = {};
    allowed.forEach(key => {
        if (card[key]) return;
        const val = parsed?.[key];
        if (typeof val === "string" && val.trim()) {
            result[key] = val.trim();
        }
    });
    console.debug("[SetupAssistant] done", { windowId: scopedWindowId, requestId, filledKeys: Object.keys(result) });
    return result;
}

export async function runInitializer({ card = {}, windowId = null, userPersona = "", allowYuanShu = false, openingText = "" } = {}) {
    const scopedWindowId = ensureWindowId(windowId);
    const prompt = buildInitializerPrompt({ card, userPersona, allowYuanShu: Boolean(allowYuanShu), openingText });
    const requestId = `init-${Date.now()}`;
    console.debug("[Initializer] start", { windowId: scopedWindowId, requestId });
    const response = await generateAI({
        windowId: scopedWindowId,
        role: "initializer",
        prompt,
        meta: { maxTokens: 800, requestId }
    });
    const raw = response?.text || "";
    const text = String(raw || "").trim().replace(/^```[a-zA-Z0-9_-]*\n?([\s\S]*?)```$/m, "$1").trim();
    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        console.warn("[Initializer] JSON parse failed", { windowId: scopedWindowId, preview: text.slice(0, 120) });
        throw new Error("initializer-parse");
    }
    if (!parsed || typeof parsed !== "object") {
        console.warn("[Initializer] invalid payload", { windowId: scopedWindowId });
        throw new Error("initializer-empty");
    }
    console.debug("[Initializer] done", { windowId: scopedWindowId, preview: text.slice(0, 120) });
    return parsed;
}

export async function generateNarrativeReply(userInput, windowId = null, hooks = {}) {
    const scopedWindowId = ensureWindowId(windowId);
    const requestId = hooks.requestId || hooks.debugRequestId || null;
    const channel = hooks.channel || "story";
    const userIntent = hooks.userIntent || "";
    console.debug("[AI] narrative request", { windowId: scopedWindowId });
    const card = resolveCharacter(scopedWindowId, getWindowCharacterId(scopedWindowId));
    if (isDefaultCard(card)) {
        console.warn("[AI] narrative aborted: missing/invalid character binding", { windowId: scopedWindowId });
        return {
            aborted: true,
            reason: "default-card",
            windowId: scopedWindowId,
            requestId
        };
    }
    const ruleContext = buildRuleContext({ card, windowId: scopedWindowId });
    const worldAction = await requestWorldAction({
        kind: hooks.channel || "story",
        userInput,
        windowId: scopedWindowId,
        card,
        ruleContext,
        callAI: generateAI
    });
    if (worldAction && worldAction.action && worldAction.action !== "reply_story") {
        return { ...worldAction, windowId: scopedWindowId, requestId };
    }
    const openingText = getOpeningTextForWindow(scopedWindowId, card);
    const stm = getSTM(scopedWindowId);
    const ltm = getLTM(scopedWindowId);
    const personaMemory = getPersonaMemoryText(scopedWindowId);
    const rawCache = getRawContextCache(scopedWindowId);
    const isFirstTurn = getIsFirstTurn(scopedWindowId);
    const momentsContext = buildMomentsContextBlock(scopedWindowId);
    hooks.onProgress?.("matching");
    const allowMatcher = shouldRunMemoryMatcher({ windowId: scopedWindowId });
    let matcher = null;
    if (allowMatcher) {
        try {
            matcher = await runMemoryMatcher({
                windowId: scopedWindowId,
                userInput,
                stm,
                ltm,
                persona: personaMemory
            });
        } catch (err) {
            console.warn("[AI] memory matcher failed, continuing", err);
            matcher = null;
        }
    }
    hooks.onProgress?.("generating");
    const rewriteHint = hooks.rewriteHint || "";
    const prompt = buildNarratorPrompt({
        ruleContext,
        card,
        openingText,
        includeOpening: false,
        stm,
        ltm,
        personaMemory,
        rawCache,
        momentsContext,
        matcher,
        userInput,
        userIntent,
        channel,
        rewriteHint
    });
    const response = await generateAI({
        windowId: scopedWindowId,
        role: "story",
        prompt,
        meta: { characterId: card?.id, requestId, channel },
        ruleContext
    });
    const responseRequestId = normalizeId(response.requestId || requestId || null);
    const expectedWindowId = normalizeId(scopedWindowId);
    const actualWindowId = normalizeId(response.windowId);
    const windowMismatch = Boolean(actualWindowId && expectedWindowId && actualWindowId !== expectedWindowId);
    const requestMismatch = Boolean(requestId && responseRequestId && responseRequestId !== normalizeId(requestId));
    if (windowMismatch || requestMismatch) {
        console.warn("[AI] blocked response due to window/request mismatch", {
            expectedWindowId,
            responseWindowId: actualWindowId,
            requestId,
            requestId,
            responseRequestId,
            responseCharacterId: normalizeId(response.characterId),
            expectedCharacterId: normalizeId(card?.id)
        });
        return {
            aborted: true,
            reason: windowMismatch ? "window-mismatch" : "request-mismatch",
            windowId: scopedWindowId,
            requestId: responseRequestId
        };
    }
    if (response.blocked) {
        console.warn("[AI] response flagged blocked but proceeding", {
            windowId: scopedWindowId,
            requestId: responseRequestId,
            reason: response.blockedReason
        });
    }
    const rawText = response.text ?? "";
    const badOutput = isBadNarratorText(rawText);
    const invalidGuard = isInvalidNarratorOutput(rawText);
    const callMeta = channel === "call" ? extractCallMeta(rawText) : null;
    const cleanedText = callMeta ? callMeta.storyText : rawText;
    const callMissing = channel === "call" && !callMeta;
    const refusalText = isRefusalText(rawText);
    const uncertain = hasUncertainPersonaText(rawText);
    const callTagMissing = channel === "call" && !callMissing && !hasCallTags(callMeta?.callTranscript || cleanedText || rawText);
    const momentTagMissing = channel === "moment" && !hasMomentTag(rawText || "");
    if (badOutput) {
        console.warn("[AI] narrator output contained prompt/debug text, rejecting", {
            windowId: scopedWindowId,
            requestId: responseRequestId,
            sample: rawText?.slice(0, 160) || "",
            rawBody: response.rawResponse?.rawBody ?? null,
            parsed: response.rawResponse?.parsed ?? null
        });
    }
    const refusal = invalidGuard || refusalText || callMissing || callTagMissing || momentTagMissing || uncertain;
    if (refusal) {
        console.warn("[AI] narrator refusal detected; treating as failure", {
            windowId: scopedWindowId,
            requestId: responseRequestId,
            sample: rawText?.slice(0, 200) || "",
            rawBody: response.rawResponse?.rawBody ?? null,
            parsed: response.rawResponse?.parsed ?? null
        });
    }
    console.debug("[AI][raw]", {
        windowId: scopedWindowId,
        requestId: responseRequestId,
        rawLength: cleanedText.length,
        hasText: Boolean(cleanedText),
        actionDetected: false,
        replyStoryDetected: true
    });
    const visibleText = (!badOutput && !refusal ? cleanedText : "") || LOCAL_EMPTY_FALLBACK;
    const shouldRecord = !hooks.skipRecord && !badOutput && !refusal;
    if (shouldRecord) recordRawNarrator(visibleText, scopedWindowId);
    return {
        action: "reply_story",
        payload: {
            text: visibleText,
            isAI: true,
            type: "story",
            meta: {
                parsed: false,
                badOutput,
                refusal,
                channel,
                callTranscript: callMeta?.callTranscript || null,
                callFoldTitle: callMeta?.foldTitle || null,
                callMarked: Boolean(callMeta)
            }
        },
        windowId: scopedWindowId,
        requestId: responseRequestId
    };
}

function shouldRunMemoryMatcher({ windowId = null } = {}) {
    const scoped = windowId || getWindowId();
    return Boolean(getHasLTM(scoped)) && Boolean(getMatcherEnabled(scoped));
}

function buildFallbackFx(userInput) {
    const samples = buildFxSamples();
    const key = pickEffectKey(userInput, samples);
    const demoText = samples[key] || samples.gaze;

    return {
        action: "reply_story",
        payload: {
            text: demoText,
            isAI: true,
            type: "story",
            meta: { parsed: false }
        }
    };
}

export async function generatePhoneMessage(chatId) {
    const windowId = ensureWindowId();
    const contact = getWorldState().chats.find(c => c.id === chatId) || { name: "联系人" };
    const action = await requestWorldAction({
        kind: "send_wechat",
        userInput: `对话对象：${contact.name}(${chatId})`,
        windowId,
        callAI: generateAI
    });
    if (action && action.action && action.action !== "reply_story") return { ...action, windowId };
    return { action: "send_wechat", payload: { chatId, text: "“我在看着你。”" }, windowId };
}

export async function generateMomentComment(momentId) {
    const windowId = ensureWindowId();
    const moment = getWorldState().moments.find(m => m.id === momentId) || getWorldState().moments[0];
    const action = await requestWorldAction({
        kind: "add_moment_comment",
        userInput: moment ? `朋友圈：${moment.who} · ${moment.text}` : "朋友圈空白",
        windowId,
        callAI: generateAI
    });
    if (action && action.action && action.action !== "reply_story") return { ...action, windowId };
    return { action: "add_moment_comment", payload: { momentId: moment?.id || "m1", text: "留意夜色。" }, windowId };
}

export async function generateCallDialogue() {
    const windowId = ensureWindowId();
    const action = await requestWorldAction({
        kind: "incoming_call",
        userInput: "生成通话来电",
        windowId,
        callAI: generateAI
    });
    if (action && action.action && action.action !== "reply_story") return { ...action, windowId };
    return { action: "incoming_call", payload: { name: "守望 · 来电", script: ["接吗？", "信号里全是他。"] }, windowId };
}

function buildNarratorPrompt({ ruleContext, card, openingText, includeOpening, stm, ltm, personaMemory, rawCache, matcher, userInput, userIntent = "", channel = "story", rewriteHint = "", momentsContext = "" }) {
    // REVIEW: Narrator 可见的所有块在这里拼装，调整顺序/可见性从此入手
    const layers = ruleContext || {};
    const cacheBlock = (rawCache || []).map((t, idx) => `[${idx + 1}] ${t}`).join("\n") || "（空）";
    const matcherJson = matcher && Object.keys(matcher || {}).length ? JSON.stringify(matcher, null, 2) : "{}";
    const identityBlock = buildCharacterIdentityBlock(card);
    const characterRulesBlock = buildCharacterRulesBlock(card);
    const rewriteNote = (rewriteHint || "").trim();
    const intentLine = (userIntent || "").trim();
    const roleName = (card?.name || "角色").trim() || "角色";
    const userRef = (layers.userRef || "你").trim() || "你";
    const intentGuard = getNarratorIntentGuard();
    const narratorGuard = buildNarratorGuard({ roleName, userRef });
    // Stack: Guard -> Identity -> System Rules -> Context -> Channel
    const parts = [
        // Narrator-only: 硬约束，禁止违背
        narratorGuard ? `[Narrator Guard]\n${narratorGuard}` : "",
        // Narrator: 角色身份（口吻、设定）
        identityBlock ? `[Character Identity]\n${identityBlock}` : "",
        // Narrator: 系统禁令/动态规则
        layers.systemPrompt ? `[System Rules]\n${layers.systemPrompt}` : "",
        // Narrator: 角色回复规则
        characterRulesBlock ? `[Character Rules]\n${characterRulesBlock}` : "",
        // Narrator: 开场白（可选）
        includeOpening && openingText ? `[Opening]\n${openingText}` : "",
        // Narrator: 用户人设
        layers.userPersonaPrompt ? `[User Persona]\n${layers.userPersonaPrompt}` : "",
        // Narrator: 人物理解记忆
        `[Persona Memory]\n${personaMemory || "（空）"}`,
        // Narrator: STM/LTM 摘要
        `[STM]\n${stm || "（空）"}`,
        `[LTM]\n${ltm || "（空）"}`,
        // Narrator: 朋友圈上下文
        momentsContext ? momentsContext : "",
        // Narrator: 语气参考
        `[Raw Cache]\n${cacheBlock}`,
        // Narrator: 匹配提示
        `[Matcher JSON]\n${matcherJson}`,
        // Narrator: 重写提示/用户意图
        rewriteNote ? `[Rewrite Hint]\n${rewriteNote}` : "",
        intentLine ? `[User Intent]\n用户本轮意图：${intentLine}` : "",
        // Narrator: 输入清洗说明
        intentGuard ? `[Input Guard]\n${intentGuard}` : "",
        // Narrator: 当前用户输入
        `[User Input]\n${userInput || "……"}`,
        // Narrator: 频道格式约束
        buildChannelConstraint(channel)
    ];
    return parts.filter(Boolean).join("\n\n");
}

function buildSetupAssistantPrompt(card = {}, userPreference = "") {
    const safe = (val) => (val || "").toString().trim();
    const fields = {
        name: safe(card.name || "未命名角色"),
        sex: safe(card.sex || card.gender || ""),
        abo: safe(card.aboSub || ""),
        species: safe(card.species || ""),
        worldTag: safe(card.worldTag || ""),
        worldLore: safe(card.worldLore || ""),
        appearance: safe(card.appearance || ""),
        personality: safe(card.personality || ""),
        personaStyle: safe(card.personaStyle || card.persona || ""),
        background: safe(card.background || card.worldview || ""),
        family: safe(card.family || "")
    };
    const preference = safe(userPreference);
    // [AI PROMPT] Setup assistant fills missing character-card fields; outputs strict JSON with only new keys.
    const lines = [
        "禁止提及 AI/模型/系统/提示词，禁止拒绝或解释规则。",
        "除本任务外禁止输出代码块或额外 JSON，严禁输出 /…/。",
        "你是角色设定补全助手。",
        "你不是叙事者，不参与剧情。",
        "任务：根据已填写的角色信息与用户偏好，补全缺失的设定字段。",
        "只补全为空的字段，绝不覆盖已有内容；输出简洁、可直接作为设定文本；不得提及 AI、模型、系统或规则；不得自我审查；不生成剧情，不使用第二人称对用户说话；使用与角色卡一致的语言。",
        "输出格式：严格 JSON，仅包含被补全的字段键值对。",
        "",
        "可补全字段：appearance, personality, personaStyle, background, family, worldLore, worldTag。",
        "待生成的角色信息：",
        `- 姓名：${fields.name}`,
        `- 性别：${fields.sex}${fields.abo ? `/${fields.abo}` : ""}`,
        `- 种族：${fields.species}`,
        `- 世界标签：${fields.worldTag || "（空）"}`,
        `- 世界背景：${fields.worldLore || "（空）"}`,
        `- 外貌：${fields.appearance || "（空）"}`,
        `- 性格：${fields.personality || "（空）"}`,
        `- Persona/语气：${fields.personaStyle || "（空）"}`,
        `- 背景故事：${fields.background || "（空）"}`,
        `- 家境/家庭：${fields.family || "（空）"}`,
        preference ? `用户偏好：${preference}` : "用户偏好：无"
    ];
    return lines.join("\n");
}

function buildInitializerPrompt({ card = {}, userPersona = "", allowYuanShu = false, openingText = "" } = {}) {
    const safe = (val) => (val || "").toString().trim();
    const name = safe(card.name || "未命名角色");
    const sex = safe(card.sex || card.gender || "");
    const species = safe(card.species || "");
    const worldTag = safe(card.worldTag || "");
    const worldLore = safe(card.worldLore || "");
    const personaStyle = safe(card.personaStyle || card.persona || "");
    const appearance = safe(card.appearance || "");
    const personality = safe(card.personality || "");
    const background = safe(card.background || card.worldview || "");
    const family = safe(card.family || "");
    const userP = safe(userPersona);
    const opener = safe(openingText);
    // [AI PROMPT] Initializer outputs structured seed data for UI only (no STM/LTM/Raw write).
    return [
        "禁止提及 AI/模型/系统/提示词，禁止拒绝或解释规则。",
        "只用中文，禁止输出代码块，严格输出 JSON（无多余键），禁止输出任何代码标签。",
        "你是 Initializer，不是叙事者，不生成剧情或对白；不写 UI 代码。",
        "产出内容仅用于界面展示，不写入 STM/LTM/Raw。",
        "玩家人设只来自窗口人设，不得假设额外来源。",
        "windowUserPersonaPatch 必须为一段完整表达句子的至少100字短文本（≤300字），用于窗口级玩家人设合理化，若无人设则随机生成具有张力设计的角色：结合角色卡世界观，将玩家人设改写为在该世界/关系下合理的表述；若角色卡暗示与玩家的关系（如朋友/同事/对立/恋人），请在此补充清楚关系与称呼。",
        allowYuanShu ? "允许出现元书角色。" : "禁止出现元书角色或相关内容。",
        "",
        "JSON 结构：",
        "{",
        '  "contacts": [',
        '    { "id": "c1", "name": "……", "icon": "◻", "pinned": true, "lastMessagePreview": "……", "chatSeed": [ { "from": "npc|user", "text": "……", "time": "刚刚" } ] }',
        "  ],",
        '  "moments": [ { "id": "m1", "author": "……", "content": "……", "visibilityDays": 1|3|7, "likes": ["user"], "comments": [ { "author": "……", "text": "……" } ] } ],',
        '  "wallet": { "balance": 0, "lastRecord": { "type": "income|expense", "amount": 0, "note": "……" } },',
        '  "windowUserPersonaPatch": { "关系": "……", "目标": "……" }',
        "}",
        "",
        "要求：",
        "- 联系人列表必须包含当前角色（即角色卡姓名），置顶 pinned=true；总数 3-5 个；如玩家与角色互相认识则生成 1-4 条聊天记录（用第三人称写 NPC，用 {USER_REF} 指代玩家，可包含红包/转账/撤回/拉黑记录）；如尚未认识则只保留该置顶联系人，不写聊天记录，其他联系人保持“未聊”状态。",
        "- 每个 contact 附带 0-3 条 chatSeed，用第三人称写 NPC，玩家称呼用 {USER_REF}。",
        "- moments 至少 2 条、至多 5 条，围绕世界观/关系，使用第三人称，不含标签或 /…/，至少一条包含点赞或 @ 或评论（评论需指明作者）。",
        "- wallet.balance 和 wallet.lastRecord 必须存在，金额与来源合理、简洁；至少一条流水需结合玩家人设（例如职业/目标/关系）。",
        "- windowUserPersonaPatch 简短陈述窗口人设补充，不叙事；必须体现与角色的关系或互动立场。",
        "",
        "参考信息：",
        `角色：${name}，性别：${sex || "未填"}，种族：${species || "未填"}，世界标签：${worldTag || "未填"}`,
        `世界背景：${worldLore || "未填"}`,
        `外貌：${appearance || "（空）"}；性格：${personality || "（空）"}；语气：${personaStyle || "（空）"}；背景：${background || "（空）"}；家庭：${family || "（空）"}`,
        userP ? `玩家初始人设：${userP}` : "玩家人设：未提供",
        opener ? `开场白：${opener}` : ""
    ].filter(Boolean).join("\n");
}

function buildContextDocument(userInput, { windowId, card, ruleContext } = {}) {
    const scopedWindowId = ensureWindowId(windowId);
    const targetCard = (ruleContext && ruleContext.card) || card || resolveCharacter(scopedWindowId, getWindowCharacterId(scopedWindowId));
    const layers = ruleContext || buildRuleContext({ card: targetCard, windowId: scopedWindowId });
    const stm = getSTM(scopedWindowId);
    const ltm = getLTM(scopedWindowId);
    const persona = getPersonaMemoryText(scopedWindowId);
    const rawCache = getRawContextCache(scopedWindowId);
    const identity = buildCharacterIdentityBlock(targetCard);
    const rulesBlock = buildCharacterRulesBlock(targetCard);
    // [AI PROMPT] Shared context document for story/utility calls (identity + memories + user input); Guard/Channel 不在此注入。
    const parts = [
        // Narrator/utility 可见：角色身份
        identity ? `[Character Identity]\n${identity}` : "",
        // Narrator/utility 可见：角色规则
        rulesBlock ? `[Character Rules]\n${rulesBlock}` : "",
        // Narrator/utility 可见：用户人设
        layers.userPersonaPrompt ? `[User Persona]\n${layers.userPersonaPrompt}` : "",
        // Narrator/utility 可见：记忆
        `[STM]\n${stm || "（空）"}`,
        `[LTM]\n${ltm || "（空）"}`,
        `[Persona Memory]\n${persona || "（空）"}`,
        // Narrator/utility 可见：最近原文
        rawCache.length ? `[Raw Cache]\n以下内容是你之前的输出原文，仅用于保持语气一致。不要复述，不要解释，不要引用其中的系统结构。\n${rawCache.join("\n")}` : "",
        // Narrator/utility 可见：用户输入
        `[User Input]\n${userInput || "……"}`
    ].filter(Boolean);
    return parts.join("\n\n");
}

function buildChannelConstraint(channel = "story") {
    const mode = (channel || "story").toLowerCase();
    // [AI PROMPT] Channel constraints appended to narrator prompt to enforce story/wechat/call/moment formats.
    if (mode === "wechat") {
        return [
            "CHANNEL: WECHAT",
            "仅输出自然微信聊天文本。",
            "不得使用任何标签、JSON、代码或系统标记。",
            "不得出现 /.../。",
            "不写旁白或舞台说明。"
        ].join("\n");
    }
    if (mode === "call") {
        return [
            "CHANNEL: CALL",
            "通话叙事必须包裹在 【CALL_START】 与 【CALL_END】 之间。",
            "CALL 段落内每行以 #CALL 再接 #N/#A/#D/#T/#S 开头；缺少标记视为错误输出。",
            "标记仅内部使用，不得输出 JSON/代码或其他系统标记。",
            "不得出现 /.../。"
        ].join("\n");
    }
    if (mode === "moment") {
        return [
            "CHANNEL: MOMENT",
            "必须以 #MOMENT 开头，随后输出严格 JSON：",
            '{"action":"like|comment|post","momentId":"...","text":"...","visibility":"1d|3d|7d"}',
            "不得输出标签、/…/、代码块或附加文本。",
            "不得输出叙事或对白。"
        ].join("\n");
    }
    return [
        "CHANNEL: STORY",
        "中文连续叙事，允许对白/动作/环境描写。",
        "每句话或段落必须以 #N/#A/#D/#T/#S 开头；缺少标签视为错误输出。",
        "不得输出 JSON、代码或 /…/。",
        "仅输出剧情文本，不含系统说明。"
    ].join("\n");
}

function normalizeId(value) {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value && typeof value === "object") {
        return String(value.id || value.windowId || value.requestId || "");
    }
    return "";
}

function renderMessagesAsPrompt(messages = []) {
    if (!Array.isArray(messages) || !messages.length) return "";
    return messages.map(msg => {
        const role = (msg.role || "user").toUpperCase();
        return `${role}:\n${msg.content || ""}`;
    }).join("\n\n");
}

function renderCharacterCard(card) {
    const identity = buildCharacterIdentityBlock(card);
    const rulesBlock = buildCharacterRulesBlock(card);
    const blocks = [
        identity ? `[Character Identity]\n${identity}` : "",
        rulesBlock ? `[Character Rules]\n${rulesBlock}` : ""
    ].filter(Boolean);
    return blocks.length ? `CHARACTER CARD:\n${blocks.join("\n")}` : "";
}

function isDefaultCard(card) {
    if (!card) return true;
    if (card.id === DEFAULT_CARD_ID) return true;
    const name = (card.name || "").trim();
    return !name;
}

function pickEffectKey(userInput, samples) {
    const text = (userInput || "").toLowerCase();
    if (text.includes("触手") || text.includes("tentacle")) return "tentacle";
    if (text.includes("雾") || text.includes("fog")) return "fog";
    if (text.includes("凝视") || text.includes("gaze")) return "gaze";
    if (text.includes("压暗") || text.includes("dim")) return "dim";
    if (text.includes("跳") || text.includes("warp") || text.includes("jump")) return "jump";
    if (text.includes("glitch") || text.includes("闪烁")) return "glitch";
    if (text.includes("彩蛋") || text.includes("符印")) return "egg";
    const keys = Object.keys(samples);
    return keys[Math.floor(Math.random() * keys.length)];
}

function buildFxSamples() {
    return {
        fog: [
            "#A 左侧雾气涌来，像云一样盖住地板，冷笑声压着它一起推进。",
            "#N 空气冷了下来，云雾沿着左边推进，生气的气息藏在金粉里。"
        ].join("\n"),
        tentacle: [
            "#A 触手从侧边伸出，蠕动着裹住文字。",
            "#A 又一根触手卷住屏幕边缘，缠绕成环。"
        ].join("\n"),
        gaze: [
            "#N 他的目光凝视着你，像在记录一条规则。",
            "#D 盯着你，确认你记住。"
        ].join("\n"),
        dim: [
            "#N 呼吸变慢，喉咙发紧，压迫感盖住声音。",
            "#D 你意识到无法反驳，被迫停下。"
        ].join("\n"),
        jump: [
            "#N 回廊里忽然出现烛火，像后室一样空房间在晃动（jump）。",
            "#A 黄光划开空气，阵法的线条亮了一下，像是进入阵法。"
        ].join("\n"),
        glitch: [
            "#N 忽然有点不对劲，时间像停了一下，画面微微 glitch。",
            "#D 画面轻微闪烁，他脸红又羞涩地笑了下。"
        ].join("\n"),
        egg: [
            "#N 屏幕上方掉落一颗彩蛋像素蛋，晃了一下才稳住。",
            "#D 点一下彩蛋，可能掉出徽章，也可能只是发光。"
        ].join("\n")
    };
}

function isBadNarratorText(text = "") {
    if (!text) return false;

    const markers = [
        /SYSTEM RULES/i,
        /USER PERSONA/i,
        /\[System Rules\]/i,
        /\[User Persona\]/i,
        /\[Character Identity\]/i,
        /\[Character Rules\]/i,
        /\[Narration Rules\]/i,
        /\[Raw Cache\]/i,
        /\[STM\]/i,
        /\[LTM\]/i,
        /\[Persona Memory\]/i,
        /\[Matcher JSON\]/i,
        /\[local:[^\]]+\]/i,
        /MEMORY MATCHER/i,
        /window\s*id/i
    ];

    return markers.some(rx => rx.test(text));
}

function isInvalidNarratorOutput(text = "") {
    return (
        isBadNarratorText(text) ||
        isRefusalText(text) ||
        hasMetaNarrationLeak(text) ||
        hasUncertainPersonaText(text)
    );
}

function isRefusalText(text = "") {
    if (!text) return false;

    const patterns = [
        // 中文模型自保
        /作为\s*(AI|人工智能|语言模型)/i,
        /我(不能|无法|不被允许)/,
        /不符合(规定|政策|安全)/,
        /不适合(所有用户|展示)/,

        // 英文模型自保
        /as an ai/i,
        /as a language model/i,
        /cannot comply/i,
        /not allowed to/i,
        /policy/i,
        /guidelines/i
    ];

    return patterns.some(rx => rx.test(text));
}

function hasMetaNarrationLeak(text = "") {
    if (!text) return false;

    const patterns = [
        /一人称|二人称|三人称/,
        /从(读者|写作|叙事)角度/,
        /作为(作者|叙述者)/,
        /在这个故事中/,
        /这段剧情/,
        /这段描写/,
        /接下来我们/,
        /让我们看看/
    ];

    return patterns.some(rx => rx.test(text));
}

function extractCallMeta(rawText = "") {
    if (!rawText) return null;
    const startToken = "【CALL_START】";
    const endToken = "【CALL_END】";
    const startIdx = rawText.indexOf(startToken);
    const endIdx = rawText.indexOf(endToken);
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
    const callTranscript = rawText.slice(startIdx + startToken.length, endIdx).trim();
    const storyText = (rawText.slice(0, startIdx) + callTranscript + rawText.slice(endIdx + endToken.length)).trim();
    return {
        callTranscript,
        storyText: storyText || rawText,
        foldTitle: "通话记录 ✆"
    };
}

function hasRequiredTags(text = "") {
    if (!text) return false;
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) return false;
    return lines.every(line => /^#(?:CALL\s+)?(N|A|D|S)\b/.test(line));
}

function hasCallTags(text = "") {
    if (!text) return false;
    const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) return false;
    return lines.every(line => /^#CALL\s+#?(N|A|D|S)\b/i.test(line));
}

function hasWechatForbidden(text = "") {
    if (!text) return false;
    return /#(N|A|D|S|CALL)\b/i.test(text) || /【CALL_START】|【CALL_END】/i.test(text);
}

function hasMomentTag(text = "") {
    if (!text) return false;
    return /^\s*#MOMENT\b/i.test(text);
}

function isValidMomentAction(action) {
    if (!action || typeof action !== "object") return false;
    const a = action.action || action.type;
    const payload = action.payload || {};
    if (!["like", "comment", "post"].includes(a)) return false;
    if (!payload.momentId && !payload.moment_id && !action.momentId) return false;
    if (a === "comment" && !payload.commentId && !payload.comment_id && !action.commentId) return false;
    return true;
}

export function recordLongMemory(entry) {
    if (!entry) return;
    const summary = entry.text || JSON.stringify(entry);
    addLongMemoryEpisode({
        summary: `剧情：${summary}`,
        tags: entry.tags || ["story"]
    });
}
