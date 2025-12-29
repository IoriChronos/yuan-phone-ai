import { getWorldState } from "../data/world-state.js";
import { getSTM, getLTM, getPersonaMemoryText } from "../data/window-memory.js";
import { buildRuleContext } from "../data/system-rules.js";
import { getCardForWindow, bindCardToWindow } from "../data/character-cards.js";
import { getWindowId, assertWindowId, getWindowCharacterId } from "./window-context.js";
import { buildCharacterIdentityBlock, buildCharacterRulesBlock } from "./prompt-blocks.js";
import { buildWorldDriverPrompt } from "../prompts/world-driver-prompt.js";

// World Driver 只做决策，不生成剧情文本
export async function requestWorldAction({
    kind = "auto",
    userInput = "",
    windowId = null,
    card = null,
    ruleContext = null,
    callAI
} = {}) {
    if (typeof callAI !== "function") {
        throw new Error("requestWorldAction missing callAI");
    }
    const scopedWindowId = ensureWindowId(windowId);
    const character = card || resolveCharacter(scopedWindowId, getWindowCharacterId(scopedWindowId));
    const scopedRuleContext = ruleContext || buildRuleContext({ card: character, windowId: scopedWindowId });
    const context = buildWorldDriverContext({
        card: character,
        ruleContext: scopedRuleContext,
        windowId: scopedWindowId,
        userInput
    });
    const prompt = buildWorldDriverPrompt({ kind, context });
    const response = await callAI({
        windowId: scopedWindowId,
        role: "utility",
        prompt,
        meta: { characterId: character?.id, kind },
        ruleContext: scopedRuleContext
    });
    const action = validateWorldAction(parseWorldAction(response?.text || ""), scopedWindowId);
    return action || { action: "reply_story", payload: {}, windowId: scopedWindowId };
}

function resolveCharacter(windowId, characterId) {
    const card = getCardForWindow(windowId, characterId);
    if (windowId && card?.id) {
        bindCardToWindow(windowId, card.id);
    }
    return card;
}

function buildWorldDriverContext({ card, ruleContext, windowId, userInput }) {
    // REVIEW: 决策可见的上下文块在此拼装，若需增减字段/顺序请改这里
    const stm = getSTM(windowId);
    const ltm = getLTM(windowId);
    const persona = getPersonaMemoryText(windowId);
    const identity = buildCharacterIdentityBlock(card);
    const rulesBlock = buildCharacterRulesBlock(card);
    const userPersona = ruleContext?.userPersonaPrompt || "";
    const parts = [
        identity ? `[Character Identity]\n${identity}` : "",
        rulesBlock ? `[Character Rules]\n${rulesBlock}` : "",
        userPersona ? `[User Persona]\n${userPersona}` : "",
        `[STM]\n${stm || "（空）"}`,
        `[LTM]\n${ltm || "（空）"}`,
        `[Persona Memory]\n${persona || "（空）"}`,
        `[User Input]\n${userInput || "……"}`
    ].filter(Boolean);
    return parts.join("\n\n");
}

function ensureWindowId(windowId) {
    const current = windowId || getWindowId();
    assertWindowId(current);
    return current;
}

function parseWorldAction(text) {
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

function validateWorldAction(action, windowId) {
    if (!action || !action.action) return null;
    const safeAction = action.action;
    if (!["reply_story", "send_wechat", "add_moment_comment", "incoming_call"].includes(safeAction)) {
        return null;
    }
    const world = getWorldState();
    const payload = action.payload || {};
    if (safeAction === "send_wechat") {
        if (!payload.text) return null;
        if (!payload.chatId) return null;
        const exists = world.chats.some(c => c.id === payload.chatId);
        if (!exists) return null;
    }
    if (safeAction === "add_moment_comment") {
        if (!payload.text) return null;
        if (!payload.momentId) return null;
        const exists = world.moments.some(m => m.id === payload.momentId && !m.deleted);
        if (!exists) return null;
    }
    if (safeAction === "incoming_call") {
        if (!payload.name) return null;
        if (payload.script && !Array.isArray(payload.script)) return null;
    }
    return { action: safeAction, payload, windowId };
}
