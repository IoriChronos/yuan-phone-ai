import { initSceneEffects } from "./scene-effects.js";

const TAG_TYPE = {
    N: "narration",
    A: "action",
    T: "thought",
    S: "system",
    D: "dialogue"
};

const BARE_NARRATION_LINE_LIMIT = 5;
const BARE_NARRATION_CHAR_LIMIT = 160;

const SOUND_WORDS = /(嗒|咚|咔噗|砰|滴答|嗡|噗嗤|嘶|咔)/;
const FOG_WORDS = /(黑雾|深渊|压迫|冰冷|呼吸靠近)/;
const ACTION_SHAKE_WORDS = /(抓住|攥住|用力拉住|壁咚|推向门板|扣在门上|压在墙上)/;

const KEYWORD_RULES = [
    {
        className: "kw-violence",
        priority: 6,
        terms: ["杀掉", "撕开", "扯断", "折断", "砸碎", "血", "撕", "杀"]
    },
    {
        className: "kw-control",
        priority: 5,
        terms: ["捏住", "按住", "抓住", "拦住", "钉住", "困住", "控制", "掐住", "锁住", "跟着你", "别躲", "不许", "不想听"]
    },
    {
        className: "kw-gaze",
        priority: 4,
        terms: ["目光", "眼睛", "瞳", "视线", "盯", "打量", "审视", "俯视"]
    },
    {
        className: "kw-close",
        priority: 3,
        terms: ["走近", "靠近", "靠得很近", "贴着", "俯在", "靠在", "贴住", "靠得太近", "贴着你的呼吸"]
    },
    {
        className: "kw-rule",
        priority: 3,
        terms: ["提前告诉我", "下次", "规则", "不浪费时间", "宣告", "选择", "划线", "别提", "别说"]
    },
    {
        className: "kw-env",
        priority: 2,
        terms: ["灯光", "霓虹", "广播", "噪点", "冷气", "雨声", "电流", "卡顿"]
    },
    {
        className: "kw-soft",
        priority: 1,
        terms: ["牛奶", "热牛奶", "甜品", "泡芙", "糖", "咬一口", "奶油", "甜味", "甜品柜"]
    },
    {
        className: "kw-dread",
        priority: 2,
        terms: ["后室", "走廊", "空房", "发霉", "封闭", "逃生口", "无窗", "监控室"]
    },
    {
        className: "kw-tech",
        priority: 2,
        terms: ["摄像头", "监控", "像素", "信号", "蓝屏", "数据", "系统", "终端"]
    },
    {
        className: "kw-sense",
        priority: 1,
        terms: ["雨滴", "湿气", "香味", "甜味", "薄荷味", "铁锈味", "粉糖", "电味"]
    },
    {
        className: "kw-promise",
        priority: 3,
        terms: ["听话", "答应我", "承诺", "遵守", "别走", "别动", "等我", "等等我"]
    }
];

const PARAGRAPH_STYLE_RULES = [
    { className: "paragraph-ambient", regex: /(霓虹|噪点|广播|雨声|电流|静电|后室|便利店)/g, minMatches: 2 },
    { className: "paragraph-soft", regex: /(牛奶|热牛奶|泡芙|甜品|糖|奶油|香味)/g, minMatches: 2 }
];

const DIALOGUE_VARIANT_MATCHERS = [
    { id: "whisper-dark", regex: /(黑雾|影子|噪点|频率|别回头|我一直在|我在你后面|听见我|记录你的脉搏)/ },
    { id: "threat", regex: /(我会|别逼我|逃不掉|不要挑战|别试探|你知道后果|后果会|别惹我)/ },
    { id: "command", regex: /(别动|靠近|过来|说话|听着|站好|抬头|看我|回答|靠这边)/ },
    { id: "intim", regex: /(抬眼|看我|离我近点|别躲|贴紧|靠着|抬头|摸|碰|手指沿|贴近)/ },
    { id: "low", regex: /(低声|靠近|贴着|耳边|靠耳|贴近你|靠得更近|温热的呼吸|耳畔)/ }
];

export function renderStoryBubble(entry, options = {}) {
    const { sceneFX, lastFxHandle } = options;
    const fxInstruction = detectFxInstruction(entry.text);
    if (fxInstruction) {
        sceneFX?.triggerInstruction?.(lastFxHandle, fxInstruction);
        return { handledFx: fxInstruction };
    }

    const meta = parseMeta(entry);
    const isBubbleType = ["dialog", "dialogue", "thought", "system", "narration", "action"].includes(meta.type);
    const bareNarration = meta.type === "narration" && shouldRenderBareNarration(meta);
    const renderAsBubble = isBubbleType && !bareNarration;
    const node = document.createElement("div");

    if (renderAsBubble) {
        applyBubbleClasses(node, entry, meta);
        if (entry.meta?.systemInput) {
            node.classList.add("bubble-system-input");
        }
        const content = document.createElement("div");
        content.className = "bubble-content";
        content.innerHTML = buildParagraphHtml(meta);
        if (entry.meta?.systemInput) {
            const chip = document.createElement("span");
            chip.className = "bubble-system-chip";
            chip.textContent = "SYSTEM";
            node.appendChild(chip);
        }
        node.appendChild(content);

        if (meta.type === "system") {
            const icon = createPixelCanvas();
            if (icon) {
                icon.classList.add("system-icon");
                const side = Math.random() > 0.5 ? "right" : "left";
                icon.dataset.side = side;
                const offsetY = (-10 + Math.random() * 16).toFixed(1);
                icon.style.setProperty("--icon-offset-y", `${offsetY}px`);
                node.insertBefore(icon, content);
            }
        }
    } else {
        node.className = `story-block block-${meta.type || "text"}${bareNarration ? " block-bare" : ""}`;
        if (meta.textLength > 120) {
            node.classList.add("block-reading");
        }
        if (meta.shortLine) {
            node.classList.add("block-key");
        }
        node.innerHTML = buildParagraphHtml(meta);
    }

    let fxHandle = null;
    if (renderAsBubble && sceneFX) {
        fxHandle = sceneFX.attachToBubble?.(node, meta);
        sceneFX.applyAutomatic?.(fxHandle, meta, entry.role);
        decorateBubble(node, meta);
    } else if (renderAsBubble) {
        decorateBubble(node, meta);
    }

    node.dataset.storyType = meta.type || "text";
    if (meta.dialogueVariant) {
        node.dataset.dialogueVariant = meta.dialogueVariant;
    } else {
        delete node.dataset.dialogueVariant;
    }

    return { bubble: node, meta, fxHandle };
}

export function initRendererFx(panel) {
    return initSceneEffects(panel);
}

function detectFxInstruction(text = "") {
    const match = text.trim().match(/^#FX\s+([A-Z]+)\b/i);
    if (!match) return null;
    return match[1];
}

function parseMeta(entry) {
    let raw = entry.text || "";
    const tagMatch = raw.match(/^#([A-Z]+)\s*/);
    let tag = null;
    if (tagMatch) {
        tag = tagMatch[1];
        raw = raw.slice(tagMatch[0].length);
    }
    let type = TAG_TYPE[tag] || entry.meta?.storyType || null;
    if (!type) {
        if (entry.role === "user") type = "dialog";
        else if (entry.role === "system") type = tag === "S" ? "system" : "narration";
        else type = "dialog";
    }
    const cleanText = raw.trim();
    const strippedLength = cleanText.replace(/\s+/g, "").length;
    let paragraphs = cleanText ? cleanText.split(/\n{2,}/).filter(Boolean) : [];
    if (!paragraphs.length) {
        paragraphs = [cleanText];
    }
    const singleLine = paragraphs.length === 1;
    const shortLine = strippedLength > 0 && strippedLength <= 16 && singleLine;
    const fogLine = FOG_WORDS.test(cleanText) && strippedLength > 10;
    const actionShake = ACTION_SHAKE_WORDS.test(cleanText);
    const lineCount = cleanText ? cleanText.split(/\n/).filter(Boolean).length : 0;
    const dialogueVariant = type === "dialogue"
        ? classifyDialogueVariant(cleanText)
        : null;

    return {
        ...entry,
        type,
        cleanText,
        paragraphs,
        textLength: strippedLength,
        shortLine,
        lineCount,
        fogLine,
        actionShake,
        dialogueVariant
    };
}

function applyBubbleClasses(bubble, entry, meta) {
    bubble.classList.add("story-bubble");
    if (meta.type === "system") {
        bubble.classList.add("bubble-system");
        return;
    }
    if (meta.type === "thought") {
        bubble.classList.add("bubble-thought", "bubble-center");
    } else if (meta.type === "narration") {
        bubble.classList.add("bubble-narration");
    } else if (meta.type === "action") {
        bubble.classList.add("bubble-action");
    } else if (meta.type === "dialogue") {
        bubble.classList.add("dialogue", "bubble-assistant");
        const variation = meta.dialogueVariant || "normal";
        bubble.classList.add(`dialogue-${variation}`);
        if ((meta.textLength || 0) < 22) {
            bubble.classList.add("dialogue-tight");
        }
        return;
    } else {
        bubble.classList.add("bubble-dialog");
        bubble.classList.add(entry.role === "user" ? "bubble-user" : "bubble-assistant");
        const len = meta.textLength || 0;
        if (len < 25) bubble.classList.add("dialog-short");
        else if (len > 120) bubble.classList.add("dialog-long");
        else bubble.classList.add("dialog-medium");
    }
}

function buildParagraphHtml(meta) {
    if (!meta.paragraphs.length) {
        meta.paragraphs = [meta.cleanText];
    }
    return meta.paragraphs
        .map((text, index) => formatParagraph(text, meta, index === 0))
        .join("");
}

function formatParagraph(text, meta, isFirst) {
    const trimmed = text.trim();
    const shortLine = trimmed.length > 0 && trimmed.length <= 16;
    const soundLine = SOUND_WORDS.test(trimmed);
    let html = applyKeywordHighlighting(text);
    html = applyInlineFormatting(html);
    html = html.replace(/\n/g, "<br>");
    const classes = [];
    if (meta.type === "narration" || meta.type === "action") {
        classes.push("narration-paragraph");
        if (shortLine) classes.push("key-sentence");
    }
    if (soundLine) classes.push("sound-line");
    if (isFirst && meta.type === "narration" && !shortLine) {
        classes.push("narration-lead");
    }
    if (meta.type === "thought") {
        classes.push("thought-line");
    }
    applyParagraphStyles(trimmed, classes);
    return `<p${classes.length ? ` class="${classes.join(" ")}"` : ""}>${html}</p>`;
}

function createPixelCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 22;
    canvas.height = 22;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.clearRect(0, 0, 22, 22);
    const drawers = [drawEye, drawPulse, drawEnvelope];
    const picked = drawers[Math.floor(Math.random() * drawers.length)];
    picked(ctx);
    return canvas;
}

function drawEye(ctx) {
    ctx.fillStyle = "#050207";
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = "#2f0f2a";
    ctx.fillRect(4, 9, 14, 4);
    ctx.fillStyle = "#d7c1ff";
    ctx.fillRect(6, 8, 10, 6);
    ctx.fillStyle = "#1a072d";
    ctx.fillRect(9, 9, 4, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(10, 10, 1, 1);
}

function drawPulse(ctx) {
    ctx.fillStyle = "#060209";
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = "#3e0f2c";
    ctx.fillRect(2, 10, 18, 2);
    ctx.fillStyle = "#ff9cc2";
    ctx.fillRect(4, 10, 3, 2);
    ctx.fillRect(7, 7, 2, 5);
    ctx.fillRect(9, 7, 3, 2);
    ctx.fillRect(12, 7, 2, 7);
    ctx.fillRect(14, 10, 4, 2);
}

function drawEnvelope(ctx) {
    ctx.fillStyle = "#040209";
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = "#a0ffc6";
    ctx.fillRect(3, 6, 16, 10);
    ctx.fillStyle = "#07130d";
    ctx.fillRect(4, 7, 14, 8);
    ctx.fillStyle = "#a0ffc6";
    ctx.fillRect(4, 8, 14, 6);
    ctx.fillStyle = "#0a1810";
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(11, 13);
    ctx.lineTo(18, 8);
    ctx.closePath();
    ctx.fill();
}

function applyKeywordHighlighting(text = "") {
    if (!text) return "";
    const ranges = [];
    KEYWORD_RULES.forEach(rule => {
        const regex = buildKeywordRegex(rule);
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            pushKeywordRange(ranges, start, end, rule);
        }
    });
    if (!ranges.length) {
        return escapeHtml(text);
    }
    ranges.sort((a, b) => a.start - b.start);
    let cursor = 0;
    let html = "";
    ranges.forEach(range => {
        if (cursor < range.start) {
            html += escapeHtml(text.slice(cursor, range.start));
        }
        html += `<span class="${range.className}">${escapeHtml(text.slice(range.start, range.end))}</span>`;
        cursor = range.end;
    });
    if (cursor < text.length) {
        html += escapeHtml(text.slice(cursor));
    }
    return html;
}

function applyInlineFormatting(html = "") {
    return html
        .replace(/\*\*(.+?)\*\*/gs, (_, inner) => `<span class="em-strong">${inner}</span>`)
        .replace(/_(.+?)_/gs, (_, inner) => `<span class="italic-soft">${inner}</span>`)
        .replace(/~~(.+?)~~/gs, (_, inner) => `<span class="strike-veil">${inner}</span>`)
        .replace(/`([^`]+)`/g, (_, inner) => `<code class="inline-code">${inner}</code>`)
        .replace(/“([^”]+)”/g, (_, inner) => `“<span class="quote-highlight">${inner}</span>”`);
}

function buildKeywordRegex(rule) {
    if (rule.regex) return rule.regex;
    const escaped = rule.terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    rule.regex = new RegExp(escaped.join("|"), "g");
    return rule.regex;
}

function pushKeywordRange(ranges, start, end, rule) {
    for (let i = ranges.length - 1; i >= 0; i--) {
        const range = ranges[i];
        const overlaps = !(end <= range.start || start >= range.end);
        if (!overlaps) continue;
        if ((rule.priority || 0) <= (range.priority || 0)) {
            return;
        }
        ranges.splice(i, 1);
    }
    ranges.push({ start, end, className: rule.className, priority: rule.priority || 0 });
}

function escapeHtml(str = "") {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function applyParagraphStyles(text = "", classes = []) {
    PARAGRAPH_STYLE_RULES.forEach(rule => {
        rule.regex.lastIndex = 0;
        const matches = text.match(rule.regex);
        if (matches && matches.length >= (rule.minMatches || 1)) {
            classes.push(rule.className);
        }
    });
}

function decorateBubble(bubble, meta) {
    if (!bubble || (meta?.type !== "narration" && meta?.type !== "dialogue")) return;
    bubble.querySelectorAll(":scope > .bubble-cutout").forEach(node => node.remove());
    const count = meta.type === "dialogue"
        ? (Math.random() > 0.7 ? 1 : 0)
        : (Math.random() > 0.4 ? 1 : 2);
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
        const cut = document.createElement("span");
        cut.className = "bubble-cutout";
        if (Math.random() > 0.6) {
            cut.classList.add("ring");
        }
        const size = 32 + Math.random() * 48;
        const left = 10 + Math.random() * 70;
        const top = 5 + Math.random() * 50;
        cut.style.setProperty("--cut-size", `${size}px`);
        cut.style.setProperty("--cut-left", `${left}%`);
        cut.style.setProperty("--cut-top", `${top}%`);
        bubble.appendChild(cut);
    }
}

function shouldRenderBareNarration(meta = {}) {
    if (!meta.cleanText) return false;
    const totalLines = meta.lineCount || meta.cleanText.split(/\n/).length;
    return totalLines < BARE_NARRATION_LINE_LIMIT && (meta.textLength || 0) < BARE_NARRATION_CHAR_LIMIT;
}

function classifyDialogueVariant(text = "") {
    if (!text) return "normal";
    for (const matcher of DIALOGUE_VARIANT_MATCHERS) {
        matcher.regex.lastIndex = 0;
        if (matcher.regex.test(text)) {
            return matcher.id;
        }
    }
    return "normal";
}

function normalizeSpacingType(type) {
    if (!type) return null;
    if (type === "dialog" || type === "dialogue") return "dialogue";
    if (type === "narration" || type === "block") return "narration";
    if (type === "action") return "action";
    if (type === "thought") return "thought";
    if (type === "system") return "system";
    return "other";
}

const SPACING_MATRIX = {
    narration: {
        narration: 6,
        action: 14,
        thought: 18,
        dialogue: 16,
        system: 16,
        other: 14
    },
    action: {
        action: 8,
        narration: 12,
        thought: 20,
        dialogue: 14,
        system: 16,
        other: 14
    },
    dialogue: {
        dialogue: 10,
        action: 16,
        narration: 14,
        thought: 18,
        system: 16,
        other: 14
    }
};

function baseSpacing(prevType, currentType) {
    const normalizedPrev = normalizeSpacingType(prevType);
    const normalizedCurrent = normalizeSpacingType(currentType);
    if (!normalizedPrev) return normalizedCurrent === "thought" ? 26 : 18;
    if (normalizedPrev === "thought") return 30;
    if (normalizedCurrent === "thought") return 26;
    const table = SPACING_MATRIX[normalizedPrev];
    if (table) {
        const key = table[normalizedCurrent] != null ? normalizedCurrent : "other";
        if (table[key] != null) return table[key];
    }
    return 14;
}

export function computeBubbleSpacing(prevType, currentType, variant) {
    let marginTop = baseSpacing(prevType, currentType);
    const normalizedCurrent = normalizeSpacingType(currentType);
    if (normalizedCurrent === "thought") {
        marginTop = Math.max(marginTop, 26);
    }
    const marginBottom = normalizedCurrent === "thought" ? 12 : 6;
    return { marginTop, marginBottom };
}
