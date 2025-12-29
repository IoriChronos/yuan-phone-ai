const ACTION_TRIGGER = /(抓住|攥住|用力拉住|壁咚|推向门板|捏住|按住|扣住|拉扯|锁住|拦住|控制|按紧|牵着|扶住|压在)/;
const THOUGHT_TRIGGER = /(心|胸口|发热|颤|渴望|靠近|靠着|贴着|呼吸|热牛奶|牛奶|泡芙|甜品|冷气|便利店|霓虹|地铁|雨伞|口袋)/;
const FOG_WORDS = /(黑雾|深渊|压迫|冰冷|靠近|霓虹|噪点|雨声|雨|电流|便利店|广播|灯光|后室|走廊|监控|空房)/;
const FX_MATCHERS = [
    { regex: /(靠近|贴着你|贴近你)/, actions: ["warm", "heartbeat"] },
    { regex: /(别动|站好|听着)/, actions: ["pressure", "shake"] },
    { regex: /(凝视|盯着|盯住)/, actions: ["focus"] },
    { regex: /(黑雾|影子)/, actions: ["fog", "glitch"] },
    { regex: /(脉搏|心跳)/, actions: ["heartbeat"] },
    { regex: /(危险|低语)/, actions: ["dim"] },
    { regex: /(记录你的)/, actions: ["static"] }
];

let actionCooldown = 0;
let thoughtCooldown = 0;
let fogCooldown = 0;
let lastHeartbeatStamp = 0;

export function initSceneEffects() {
    injectFxStyles();
    return {
        attachToBubble: attachBubbleFx,
        applyAutomatic: applyAutomaticFx,
        triggerInstruction: triggerInstruction
    };
}

function attachBubbleFx(bubble, meta = {}) {
    if (!bubble) return null;
    let layer = bubble.querySelector(":scope > .bubble-fx-layer");
    if (layer) {
        layer.innerHTML = "";
    } else {
        layer = document.createElement("div");
        layer.className = "bubble-fx-layer";
        bubble.insertBefore(layer, bubble.firstChild);
    }
    return createHandle(bubble, layer, meta);
}

function applyAutomaticFx(handle, meta = {}, role = "system") {
    tickCooldowns();
    if (!handle) return;
    if (shouldSeedParticles(meta)) {
        seedParticles(handle, meta);
    }
    if (shouldShake(meta) && actionCooldown === 0) {
        handle.shake();
        actionCooldown = 2;
    }
    if (shouldHeartbeat(meta) && thoughtCooldown === 0) {
        if (Date.now() - lastHeartbeatStamp >= 120000) {
            handle.heartbeat();
            lastHeartbeatStamp = Date.now();
        } else {
            handle.softGlow();
        }
        thoughtCooldown = 3;
    } else if (meta.type === "thought") {
        handle.softGlow();
    }
    if (shouldFog(meta) && fogCooldown === 0) {
        handle.fog();
        fogCooldown = 4;
    }
    if (meta.type === "dialogue") {
        switch (meta.dialogueVariant) {
            case "command":
                handle.pressure();
                handle.shake();
                break;
            case "intim":
                handle.warm();
                handle.heartbeat();
                break;
            case "threat":
                handle.dim();
                handle.fog();
                break;
            case "whisper-dark":
                handle.glitch();
                handle.fog();
                break;
            case "low":
                handle.softGlow();
                break;
            default:
                break;
        }
    }
    if (meta.cleanText) {
        FX_MATCHERS.forEach(matcher => {
            matcher.regex.lastIndex = 0;
            if (matcher.regex.test(meta.cleanText)) {
                matcher.actions.forEach(action => handle[action]?.());
            }
        });
    }
}

function triggerInstruction(handle, fxType) {
    if (!handle || !fxType) return;
    const name = fxType.toLowerCase();
    const map = {
        fog: () => handle.fog(),
        heartbeat: () => handle.heartbeat(),
        gold: () => handle.gold(),
        glow: () => handle.softGlow(),
        shake: () => handle.shake(),
        flash: () => handle.flash()
    };
    map[name]?.();
}

function shouldSeedParticles(meta = {}) {
    return meta.type === "thought" || meta.type === "dialogue";
}

function shouldShake(meta = {}) {
    if (meta.type !== "action") return false;
    if ((meta.textLength || 0) >= 25) return false;
    return meta.actionShake || ACTION_TRIGGER.test(meta.cleanText || "");
}

function shouldHeartbeat(meta = {}) {
    if (meta.type !== "thought") return false;
    return THOUGHT_TRIGGER.test(meta.cleanText || "");
}

function shouldFog(meta = {}) {
    if (meta.type !== "narration") return false;
    if (meta.fogLine) return true;
    return FOG_WORDS.test(meta.cleanText || "");
}

function seedParticles(handle, meta = {}) {
    if (handle.hasParticles) return;
    handle.hasParticles = true;
    const baseCount = Math.max(2, Math.ceil((meta.textLength || 12) / 18));
    const maxCount = meta.type === "thought" ? 10 : 6;
    const count = Math.min(maxCount, baseCount * 2);
    for (let i = 0; i < count; i++) {
        const dot = document.createElement("span");
        dot.className = "bubble-particle";
        dot.style.setProperty("--left", `${6 + Math.random() * 88}%`);
        dot.style.setProperty("--delay", `${Math.random() * 0.8}s`);
        dot.style.setProperty("--duration", `${2.2 + Math.random() * 1.8}s`);
        dot.style.setProperty("--size", `${0.8 + Math.random() * 1.5}px`);
        handle.layer.appendChild(dot);
    }
}

function createHandle(bubble, layer, meta) {
    return {
        bubble,
        layer,
        meta,
        hasParticles: false,
        fog() {
            attachOverlay(layer, "bubble-fog", 4200);
        },
        heartbeat() {
            attachOverlay(layer, "bubble-heartbeat", 2000);
        },
        softGlow() {
            attachOverlay(layer, "bubble-softglow", 2600);
        },
        gold() {
            attachOverlay(layer, "bubble-gold", 2600);
        },
        warm() {
            attachOverlay(layer, "bubble-warm", 3200);
        },
        flash() {
            attachOverlay(layer, "bubble-flash", 300);
        },
        shake() {
            if (!bubble) return;
            bubble.classList.add("fx-shake");
            setTimeout(() => bubble.classList.remove("fx-shake"), 520);
        },
        pressure() {
            attachOverlay(layer, "bubble-pressure", 1800);
        },
        focus() {
            attachOverlay(layer, "bubble-focus", 2400);
        },
        dim() {
            attachOverlay(layer, "bubble-dim", 2400);
        },
        glitch() {
            attachOverlay(layer, "bubble-glitch", 2000);
        },
        static() {
            attachOverlay(layer, "bubble-static", 2200);
        },
        trigger(type) {
            triggerInstruction(this, type);
        }
    };
}

function attachOverlay(layer, className, duration = 2000) {
    if (!layer) return null;
    const node = document.createElement("div");
    node.className = className;
    layer.appendChild(node);
    if (duration > 0) {
        setTimeout(() => node.remove(), duration);
    }
    return node;
}

function tickCooldowns() {
    if (actionCooldown > 0) actionCooldown -= 1;
    if (thoughtCooldown > 0) thoughtCooldown -= 1;
    if (fogCooldown > 0) fogCooldown -= 1;
}

let stylesInjected = false;
function injectFxStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement("style");
    style.innerHTML = `
    .bubble-fx-layer {
        position: absolute;
        inset: 0;
        overflow: hidden;
        border-radius: inherit;
        pointer-events: none;
        z-index: 1;
        mix-blend-mode: screen;
    }
    .bubble-particle {
        position: absolute;
        left: var(--left);
        bottom: -6px;
        width: var(--size);
        height: var(--size);
        background: radial-gradient(circle, rgba(255,210,190,0.35), transparent 70%);
        border-radius: 50%;
        animation: bubbleParticleRise var(--duration) linear var(--delay) infinite;
    }
    .bubble-fog {
        position: absolute;
        inset: -6px;
        border-radius: inherit;
        background:
            radial-gradient(circle at 20% 80%, rgba(12,0,10,0.55), transparent 60%),
            radial-gradient(circle at 70% 30%, rgba(30,5,18,0.35), transparent 55%);
        animation: bubbleFogDrift 6s ease forwards;
        mix-blend-mode: multiply;
    }
    .bubble-heartbeat {
        position: absolute;
        inset: 10%;
        border-radius: inherit;
        border: 1px solid rgba(255,120,160,0.45);
        animation: bubbleHeartbeatPulse 1.4s ease-in-out forwards;
    }
    .bubble-softglow {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle, rgba(255,120,190,0.18), transparent 70%);
        animation: bubbleSoftGlow 2.4s ease-in-out forwards;
    }
    .bubble-gold {
        position: absolute;
        inset: 0;
        background:
            radial-gradient(circle at 40% 0%, rgba(255,210,170,0.2), transparent 60%),
            radial-gradient(circle at 80% 60%, rgba(255,160,200,0.15), transparent 65%);
        border-radius: inherit;
        animation: bubbleGoldRain 2.6s ease forwards;
    }
    .bubble-warm {
        position: absolute;
        inset: 6%;
        border-radius: inherit;
        background: radial-gradient(circle, rgba(255,190,150,0.25), transparent 80%);
        animation: bubbleWarm 3s ease forwards;
    }
    .bubble-flash {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle, rgba(255,255,255,0.55), transparent 60%);
        animation: bubbleFlash 0.18s ease;
    }
    .bubble-pressure {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1px solid rgba(255,120,140,0.3);
        animation: bubblePressure 1.1s ease forwards;
    }
    .bubble-focus {
        position: absolute;
        inset: 10%;
        border-radius: inherit;
        border: 1px solid rgba(255,255,255,0.25);
        animation: bubbleFocus 2.4s ease forwards;
    }
    .bubble-dim {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(0,0,0,0.4);
        animation: bubbleDim 1.8s ease forwards;
    }
    .bubble-glitch {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: repeating-linear-gradient(90deg, rgba(140,110,200,0.3), rgba(140,110,200,0.3) 2px, transparent 2px, transparent 4px);
        mix-blend-mode: screen;
        animation: bubbleGlitch 1.6s steps(4) forwards;
    }
    .bubble-static {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%);
        animation: bubbleStatic 2.2s ease forwards;
    }
    .story-bubble.fx-shake {
        animation: fxShakeBubble 0.45s ease;
    }
    @keyframes bubbleParticleRise {
        0% { transform: translateY(0) scale(0.8); opacity: 0.5; }
        60% { opacity: 1; }
        100% { transform: translateY(-110%) scale(1.2); opacity: 0; }
    }
    @keyframes bubbleFogDrift {
        0% { opacity: 0.7; transform: translate3d(-4px,4px,0) scale(1.02); }
        40% { opacity: 0.5; }
        100% { opacity: 0; transform: translate3d(6px,-6px,0) scale(1.06); }
    }
    @keyframes bubbleHeartbeatPulse {
        0% { transform: scale(0.9); opacity: 0.5; }
        60% { transform: scale(1.05); opacity: 0.2; }
        100% { transform: scale(1.1); opacity: 0; }
    }
    @keyframes bubbleSoftGlow {
        0% { opacity: 0; }
        30% { opacity: 0.45; }
        100% { opacity: 0; }
    }
    @keyframes bubbleGoldRain {
        0% { opacity: 0.4; transform: translateY(10px); }
        100% { opacity: 0; transform: translateY(-10px); }
    }
    @keyframes bubbleWarm {
        0% { opacity: 0.6; transform: scale(0.95); }
        100% { opacity: 0; transform: scale(1.2); }
    }
    @keyframes bubbleFlash {
        from { opacity: 0.7; }
        to { opacity: 0; }
    }
    @keyframes bubblePressure {
        0% { opacity: 0.6; transform: scale(0.92); }
        100% { opacity: 0; transform: scale(1.08); }
    }
    @keyframes bubbleFocus {
        0% { opacity: 0.5; transform: scale(0.95); }
        100% { opacity: 0; transform: scale(1.2); }
    }
    @keyframes bubbleDim {
        0% { opacity: 0; }
        40% { opacity: 0.35; }
        100% { opacity: 0; }
    }
    @keyframes bubbleGlitch {
        0% { opacity: 0.4; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(6px); }
    }
    @keyframes bubbleStatic {
        0% { opacity: 0.3; }
        50% { opacity: 0.6; }
        100% { opacity: 0; }
    }
    @keyframes fxShakeBubble {
        0% { transform: translate3d(0,0,0); }
        25% { transform: translate3d(3px,-3px,0); }
        50% { transform: translate3d(-3px,3px,0); }
        75% { transform: translate3d(2px,-2px,0); }
        100% { transform: translate3d(0,0,0); }
    }
    `;
    document.head.appendChild(style);
}
