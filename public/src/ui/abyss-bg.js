import { buildCloudSpriteSet, buildEggSpriteSet } from "./pixel.js";

const LAYER1_COLORS = ["#12070f", "#1f0a1b", "#2e0c26", "#3c1231", "#160812"];
const LAYER2_COLORS = ["#f6c36a", "#d86a8a", "#b08cff"];
const LAYER3_COLORS = ["#ffb46e", "#ff7fa5", "#c38fff"];

const LAYER1_COUNT = 100;
const LAYER2_COUNT = 70;
const LAYER3_COUNT = 24;
const TENTACLE_ART_RED = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='176' shape-rendering='crispEdges'><rect width='96' height='176' fill='none'/><path fill='%230a060d' d='M18 152h18v24H18z'/><path fill='%2313071a' d='M24 118h16v60H24z'/><path fill='%23230d29' d='M32 84h14v80H32z'/><path fill='%232e0f33' d='M40 58h14v90H40z'/><path fill='%23380f3a' d='M50 40h12v90H50z'/><path fill='%2355133f' d='M56 30h10v78H56z'/><path fill='%2374183f' d='M60 22h10v64H60z'/><path fill='%23a3273c' d='M64 16h8v50H64z'/><path fill='%23d8485c' d='M68 12h6v32H68z'/></svg>\")";
const TENTACLE_ART_BLUE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='176' shape-rendering='crispEdges'><rect width='96' height='176' fill='none'/><path fill='%23060a14' d='M18 152h18v24H18z'/><path fill='%230c1124' d='M24 118h16v60H24z'/><path fill='%2314253f' d='M32 84h14v80H32z'/><path fill='%2320365a' d='M40 58h14v90H40z'/><path fill='%23314b78' d='M50 40h12v90H50z'/><path fill='%2343629b' d='M56 30h10v78H56z'/><path fill='%235c7cc0' d='M60 22h10v64H60z'/><path fill='%2382a5e8' d='M64 16h8v50H64z'/><path fill='%23b7d2ff' d='M68 12h6v32H68z'/></svg>\")";

export function initAbyssBackground(panel = document.getElementById("story-panel")) {
    if (!panel) return null;
    if (panel.__abyssBg) return panel.__abyssBg;

    const baseLayer = panel.querySelector("#story-fx-base") || panel;
    const upperLayer = panel.querySelector("#story-fx-upper") || panel;

    const root = document.createElement("div");
    root.id = "abyss-bg";
    const layer1 = document.createElement("canvas");
    layer1.id = "abyss-layer-1";
    const layer2 = document.createElement("canvas");
    layer2.id = "abyss-layer-2";
    const layer3 = document.createElement("canvas");
    layer3.id = "abyss-layer-3";
    const ambientFog = document.createElement("div");
    ambientFog.className = "panel-fog ambient-fog";
    const ambientFogGhost = document.createElement("div");
    ambientFogGhost.className = "panel-fog ambient-fog ghost";
    const fogBack = document.createElement("div");
    fogBack.className = "abyss-fog fog-back";
    const tentacleLayer = document.createElement("div");
    tentacleLayer.className = "abyss-tentacles";
    const fogFront = document.createElement("div");
    fogFront.className = "abyss-fog fog-front";
    const wave = document.createElement("div");
    wave.className = "abyss-pressure-wave";
    const gaze = document.createElement("div");
    gaze.className = "abyss-gaze";
    const dim = document.createElement("div");
    dim.className = "abyss-dim";
    const glitch = document.createElement("div");
    glitch.className = "abyss-glitch";
    const warp = document.createElement("div");
    warp.className = "abyss-warp";
    const jump = document.createElement("div");
    jump.className = "abyss-jump";
    const eggFx = document.createElement("div");
    eggFx.className = "abyss-egg";
    const permit = document.createElement("div");
    permit.className = "abyss-permission";
    const tentacleGuide = document.createElement("div");
    tentacleGuide.className = "tentacle-guide hidden";
    root.append(ambientFog, ambientFogGhost, layer1, layer2, layer3, fogBack, tentacleLayer, fogFront, wave, gaze, dim, glitch, warp, jump, permit);

    const baseFogLayer = document.createElement("div");
    baseFogLayer.className = "panel-fog-layer base";
    const upperFogLayer = document.createElement("div");
    upperFogLayer.className = "panel-fog-layer upper";
    const upperTentacleLayer = document.createElement("div");
    upperTentacleLayer.className = "abyss-tentacles upper";

    baseLayer.appendChild(root);
    baseLayer.appendChild(baseFogLayer);
    upperLayer.appendChild(upperFogLayer);
    upperLayer.appendChild(upperTentacleLayer);
    upperLayer.appendChild(tentacleGuide);
    upperLayer.appendChild(eggFx);

    const engine = createAbyssEngine(panel, root, [layer1, layer2, layer3], {
        baseLayer,
        upperLayer,
        baseFogLayer,
        upperFogLayer,
        upperTentacleLayer,
        tentacleGuide
    });
    panel.__abyssBg = engine;
    return engine;
}

function createAbyssEngine(panel, root, canvases, layers = {}) {
    const {
        baseLayer = panel,
        upperLayer = panel,
        baseFogLayer = baseLayer,
        upperFogLayer = upperLayer,
        upperTentacleLayer = null,
        tentacleGuide = null
    } = layers;
    const [fogCanvas, sparkCanvas, pulseCanvas] = canvases;
    const fogCtx = fogCanvas.getContext("2d");
    const sparkCtx = sparkCanvas.getContext("2d");
    const pulseCtx = pulseCanvas.getContext("2d");
    const fogBack = root.querySelector(".fog-back");
    const fogFront = root.querySelector(".fog-front");
    const tentacleLayer = root.querySelector(".abyss-tentacles");
    const wave = root.querySelector(".abyss-pressure-wave");
    const gaze = root.querySelector(".abyss-gaze");
    const dim = root.querySelector(".abyss-dim");
    const glitch = root.querySelector(".abyss-glitch");
    const warp = root.querySelector(".abyss-warp");
    const jump = root.querySelector(".abyss-jump");
    const eggFx = upperLayer.querySelector(".abyss-egg") || root.querySelector(".abyss-egg");
    const permit = root.querySelector(".abyss-permission");
    const guide = upperLayer.querySelector(".tentacle-guide") || tentacleGuide;
    let width = 0;
    let height = 0;

    let fogDust = [];
    let coldSparks = [];
    let heartMotes = [];
    let rafId = null;
    let fogTimer = null;
    let waveTimer = null;
    let gazeTimer = null;
    let dimTimer = null;
    let glitchTimer = null;
    let warpTimer = null;
    let jumpTimer = null;
    let permitTimer = null;
    const cloudSprites = buildCloudSpriteSet();
    const eggSprites = buildEggSpriteSet();

    function resize() {
        const rect = panel.getBoundingClientRect();
        width = Math.floor(rect.width);
        height = Math.floor(rect.height);
        [fogCanvas, sparkCanvas, pulseCanvas].forEach(canvas => {
            canvas.width = width;
            canvas.height = height;
        });
        seedParticles();
    }

    function seedParticles() {
        fogDust = createFogDust(LAYER1_COUNT, width, height);
        coldSparks = createColdSparks(LAYER2_COUNT, width, height);
        heartMotes = createHeartMotes(LAYER3_COUNT, width, height);
    }

    function loop(timestamp = 0) {
        drawFogLayer(fogCtx, fogDust, width, height);
        drawSparkLayer(sparkCtx, coldSparks, width, height, timestamp);
        drawPulseLayer(pulseCtx, heartMotes, width, height, timestamp);
        rafId = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    rafId = requestAnimationFrame(loop);

    return {
        refresh: seedParticles,
        fog(mode = "soft", power = 1) {
            root.classList.remove("fog-breathe", "fog-surged", "fog-soft", "fog-shift");
            const cls = mode === "shift" ? "fog-shift" : mode === "surge" ? "fog-surged" : "fog-soft";
            root.classList.add(cls);
            if (fogBack && fogFront) {
                const depth = Math.min(1.6, Math.max(0.6, power));
                fogBack.style.opacity = String(0.6 * depth);
                fogFront.style.opacity = String(0.9 * depth);
            }
            clearTimeout(fogTimer);
            fogTimer = setTimeout(() => root.classList.remove(cls), mode === "surge" ? 9000 : 7000);
            spawnFogSweep(mode === "high" || mode === "upper" ? "upper" : "base", power);
        },
        fogBase(power = 1) {
            spawnFogSweep("base", power);
        },
        fogUpper(power = 1) {
            spawnFogSweep("upper", power);
        },
        summonTentacle(options = {}) {
            const {
                count = 1,
                speed = 1,
                thickness = 1,
                layer = "auto",
                debug = false
            } = options;
            if (!tentacleLayer) return;

            const paletteSelections = [];
            if (Math.random() < 0.8) paletteSelections.push("red");
            if (Math.random() < 0.4) paletteSelections.push("blue");
            if (paletteSelections.length === 0) paletteSelections.push("red");

            const spawnCount = Math.max(1, Math.max(count, paletteSelections.length));
            for (let i = 0; i < spawnCount; i++) {
                const palette = paletteSelections[i % paletteSelections.length];
                const targetLayer = layer === "upper" ? (upperTentacleLayer || tentacleLayer) : tentacleLayer;
                if (!targetLayer) continue;

                const spawn = pickSpawnPoint(width, height);
                const angle = computeTentacleAngle(spawn, width, height);

                const t = document.createElement("div");
                t.className = "abyss-tentacle";
                if (debug) t.classList.add("debug");
                if (palette === "blue") t.classList.add("overlay");
                t.dataset.edge = spawn.edge || "inner";
                const base = document.createElement("div");
                base.className = "tentacle-base";
                const core = document.createElement("div");
                core.className = "tentacle-core";
                const body = document.createElement("div");
                body.className = "tentacle-body";
                const head = document.createElement("div");
                head.className = "tentacle-head";

                const art = palette === "blue" ? TENTACLE_ART_BLUE : TENTACLE_ART_RED;
                body.style.setProperty("--tentacle-art", art);
                core.append(body, head);
                t.append(base, core);

                // 动画池：摇晃 + 多级蜷曲 + 触碰
                const animPool = [
                    "anim-sway",
                    "anim-sway-wide",
                    "anim-curl-soft",
                    "anim-curl-medium",
                    "anim-curl-deep",
                    "anim-curl-tight",
                    "anim-touch",
                    "anim-wobble"
                ];
                core.classList.add(pick(animPool));

                t.style.setProperty("--tentacle-x", `${spawn.x.toFixed(1)}px`);
                t.style.setProperty("--tentacle-y", `${spawn.y.toFixed(1)}px`);
                t.style.setProperty("--tentacle-angle", `${angle}deg`);

                const scale = 0.95 + Math.random() * 0.2;             // 尺寸轻微浮动
                const wiggle = (0.85 + Math.random() * 0.9) * speed;  // 摆幅幅度
                const delay = Math.random() * 0.25;                   // 起始延迟
                const thicknessScale = (0.9 + Math.random() * 1.1) * thickness; // 粗细
                const enterDur = 1 + Math.random() * 0.35;            // 入场时长 1.0~1.35s
                const idleDur = 2.8 + Math.random() * 1.8;            // 停留时长 2.8~4.6s
                const retreatDur = 1 + Math.random() * 0.7;           // 退场时长 1.0~1.7s

                t.style.setProperty("--tentacle-scale", scale.toFixed(2));
                t.style.setProperty("--tentacle-wiggle", wiggle.toFixed(2));
                t.style.setProperty("--tentacle-delay", `${delay.toFixed(2)}s`);
                t.style.setProperty("--tentacle-thickness", thicknessScale.toFixed(2));
                t.style.setProperty("--tentacle-enter-dur", `${enterDur.toFixed(2)}s`);
                t.style.setProperty("--tentacle-idle-dur", `${idleDur.toFixed(2)}s`);
                t.style.setProperty("--tentacle-retreat-dur", `${retreatDur.toFixed(2)}s`);

                targetLayer.appendChild(t);

                const totalLife = (delay + enterDur + idleDur + retreatDur + 0.2) * 1000;
                let cleaned = false;

                const cleanup = () => {
                    if (cleaned) return;
                    cleaned = true;
                    t.remove();
                };

                setTimeout(cleanup, totalLife);
            }
        },
        pressureWave(mode = "pulse", intensity = 1) {
            root.classList.remove("wave-pulse", "wave-strike");
            const cls = mode === "strike" ? "wave-strike" : "wave-pulse";
            const power = Math.min(1.4, Math.max(0.8, intensity));
            if (wave) {
                wave.style.setProperty("--wave-scale", power.toFixed(2));
            }
            root.classList.add(cls);
            clearTimeout(waveTimer);
            waveTimer = setTimeout(() => root.classList.remove(cls), 2200);
        },
        predatorGaze(tilt = 0) {
            root.classList.add("gaze-on");
            if (gaze) {
                const palette = pick([
                    { ring: "rgba(246,195,106,0.4)", core: "rgba(124,16,37,0.35)", glow: "rgba(246,195,106,0.45)", pixel: "#f6c36a" },
                    { ring: "rgba(220,120,120,0.5)", core: "rgba(160,20,30,0.4)", glow: "rgba(255,120,120,0.5)", pixel: "#ff4a4a" },
                    { ring: "rgba(246,195,106,0.5)", core: "rgba(200,60,40,0.35)", glow: "rgba(255,140,90,0.5)", pixel: "linear-gradient(90deg, #ffb84d 0%, #ff6a4d 100%)" }
                ]);
                gaze.style.setProperty("--gaze-ring", palette.ring);
                gaze.style.setProperty("--gaze-core", palette.core);
                gaze.style.setProperty("--gaze-glow", palette.glow);
                gaze.style.setProperty("--gaze-pixel", palette.pixel);
                gaze.style.setProperty("--gaze-tilt", `${tilt}deg`);
            }
            clearTimeout(gazeTimer);
            gazeTimer = setTimeout(() => root.classList.remove("gaze-on"), 3600);
        },
        dimSurround(level = 0.5) {
            if (!dim) return;
            dim.style.setProperty("--dim-level", `${Math.min(0.7, Math.max(0.2, level))}`);
            dim.classList.add("dim-on");
            clearTimeout(dimTimer);
            dimTimer = setTimeout(() => dim.classList.remove("dim-on"), 2400);
        },
        glitchFlash() {
            if (!glitch) return;
            glitch.classList.add("glitch-on");
            clearTimeout(glitchTimer);
            glitchTimer = setTimeout(() => glitch.classList.remove("glitch-on"), 1000);
        },
        spaceWarp() {
            if (!warp) return;
            warp.classList.add("warp-on");
            clearTimeout(warpTimer);
            warpTimer = setTimeout(() => warp.classList.remove("warp-on"), 1400);
        },
        jumpBurst() {
            if (!jump) return;
            const spin = (-6 + Math.random() * 12).toFixed(1);
            jump.style.setProperty("--jump-rot", `${spin}deg`);
            jump.classList.add("jump-on");
            spawnJumpPixels();
            clearTimeout(jumpTimer);
            jumpTimer = setTimeout(() => jump.classList.remove("jump-on"), 1200);
        },
        eggBurst() {
            if (!eggFx) return;
            spawnEggPixels();
            setTimeout(() => {
                if (eggFx) eggFx.innerHTML = "";
            }, 1800);
        },
        allowGlow() {
            if (!permit) return;
            permit.classList.add("permit-on");
            clearTimeout(permitTimer);
            permitTimer = setTimeout(() => permit.classList.remove("permit-on"), 1800);
        },
        summonHighTentacleBall({ x = null, y = null } = {}) {
            if (!upperTentacleLayer) return;
            const rect = panel.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const node = document.createElement("div");
            node.className = "high-tentacle-ball";
            node.style.left = `${x ?? cx}px`;
            node.style.top = `${y ?? cy}px`;
            upperTentacleLayer.appendChild(node);
            setTimeout(() => node.remove(), 4200);
        },
        showTentacleGuide(show = true) {
            if (!guide) return;
            guide.classList.toggle("hidden", !show);
            if (show) renderTentacleGuide();
        },
        showSigil() {},
        destroy() {
            if (rafId) cancelAnimationFrame(rafId);
            clearTimeout(fogTimer);
            clearTimeout(waveTimer);
            clearTimeout(gazeTimer);
            clearTimeout(dimTimer);
            clearTimeout(glitchTimer);
            clearTimeout(warpTimer);
            clearTimeout(permitTimer);
            clearTimeout(jumpTimer);
        }
    };

    function spawnFogSweep(which = "base", power = 1) {
        const node = document.createElement("div");
        node.className = `panel-fog sweep ${which === "upper" ? "fog-high" : "fog-low"}`;
        const depth = Math.min(1.6, Math.max(0.7, power));
        node.style.setProperty("--fog-power", depth.toFixed(2));
        const host = which === "upper" ? upperFogLayer : baseFogLayer;

        const cloudPack = document.createElement("div");
        cloudPack.className = `fog-sprite-pack ${which === "upper" ? "pack-high" : "pack-low"}`;
        const palette = which === "upper" ? "dark" : "light";
        const total = which === "upper" ? Math.max(1, Math.floor(Math.random() * 4)) : (1 + Math.floor(Math.random() * 4));
        if (total <= 0) return;
        const used = [0, 0, 0];
        const cloudPositions = [];
        let avgScale = 1;
        const anchor = palette === "dark"
            ? { x: 84 + Math.random() * 8, y: 28 + Math.random() * 32 }
            : { x: 8 + Math.random() * 10, y: 32 + Math.random() * 28 };
        for (let i = 0; i < total; i++) {
            let variant = i % 3;
            used[variant] += 1;
            const cloud = document.createElement("div");
            cloud.className = `fog-cloud ${palette === "dark" ? "dark" : "light"} variant-${["a", "b", "c"][variant]}`;
            const bias = Math.pow(Math.random(), 0.35); // 倾向更大
            const minScale = palette === "dark" ? 0.95 : 1.6;
            const maxScale = palette === "dark" ? 2.0 : 2.8;
            const scale = minScale + (maxScale - minScale) * bias;
            cloud.style.setProperty("--scale", scale.toFixed(2));
            if (palette === "dark") {
                cloud.style.setProperty("--cloud-fill", "#5a6aa3");
                cloud.style.setProperty("--cloud-stroke", "#92a3e0");
                cloud.style.setProperty("--cloud-glow", "rgba(130,158,240,0.55)");
            } else {
                cloud.style.setProperty("--cloud-fill", "#ffe7c8");
                cloud.style.setProperty("--cloud-stroke", "#ffd6a2");
                cloud.style.setProperty("--cloud-glow", "rgba(255,216,172,0.6)");
            }

            const offsetX = (Math.random() - 0.5) * 10;
            const offsetY = (Math.random() - 0.5) * 8;
            const pos = { x: anchor.x + offsetX, y: anchor.y + offsetY };
            cloud.style.left = `${pos.x}%`;
            cloud.style.top = `${pos.y}%`;
            const spriteUrl = cloudSprites[palette === "dark" ? "dark" : "light"][variant];
            cloud.style.backgroundImage = `url(${spriteUrl})`;
            const baseW = 220;
            const baseH = 140;
            cloud.style.width = `${baseW * 0.6}px`;
            cloud.style.height = `${baseH * 0.6}px`;
            cloud.style.transform = `scale(${scale.toFixed(2)})`;
            cloud.style.transformOrigin = "center";
            const alphaMax = palette === "dark" ? 0.95 : 0.96;
            const alphaMin = alphaMax - 0.12;
            const alpha = alphaMax - ((scale - minScale) / (maxScale - minScale)) * 0.12;
            cloud.style.opacity = Math.max(alphaMin, Math.min(alphaMax, alpha)).toFixed(2);
            cloudPack.appendChild(cloud);
            cloudPositions.push(pos);
            avgScale += (scale - avgScale) / (i + 1);
        }

        // pack-level drift so云束整体移动，内部相对关系锁定
        const drift = computeDrift(anchor.x, anchor.y, avgScale, palette === "dark" ? "right" : "left");
        cloudPack.style.setProperty("--pack-dx", `${drift.dx}px`);
        cloudPack.style.setProperty("--pack-dy", `${drift.dy}px`);
        cloudPack.style.setProperty("--pack-dur", `${drift.dur}s`);
        node.appendChild(cloudPack);
        (host || baseLayer).appendChild(node);
        const ttl = Math.max(6, drift.dur + 2.2);
        setTimeout(() => node.remove(), ttl * 1000);
    }

    function pickSpawnPoint(w, h) {
        const bandX = { min: w * 0.3, max: w * 0.7 }; // 调整：中段范围（左右）
        const bandY = { min: h * 0.3, max: h * 0.7 }; // 调整：中段范围（上下）

        const slots = [
            { edge: "left", type: "mid" },
            { edge: "right", type: "mid" },
            { edge: "top", type: "mid" },
            { edge: "bottom", type: "mid" },
            { corner: "lt" },
            { corner: "rt" },
            { corner: "lb" },
            { corner: "rb" }
        ];
        const slot = pick(slots);

        const jitter = {
            leftX: randRange(-40, 20),    // 调整：左侧水平偏移
            rightX: randRange(-20, 40),   // 调整：右侧水平偏移
            topY: randRange(-40, 20),     // 调整：顶部垂直偏移
            bottomY: randRange(-20, 40)   // 调整：底部垂直偏移（基准 h+120 见下）
        };

        if (slot.type === "mid") {
            if (slot.edge === "left") {
                const y = clamp(bandY.min + Math.random() * (bandY.max - bandY.min), 0, h);
                const x = jitter.leftX;
                return { edge: "left", x, y };
            }
            if (slot.edge === "right") {
                const y = clamp(bandY.min + Math.random() * (bandY.max - bandY.min), 0, h);
                const x = w + jitter.rightX;
                return { edge: "right", x, y };
            }
            if (slot.edge === "top") {
                const x = clamp(bandX.min + Math.random() * (bandX.max - bandX.min), 0, w);
                const y = jitter.topY;
                return { edge: "top", x, y };
            }
            const x = clamp(bandX.min + Math.random() * (bandX.max - bandX.min), 0, w);
            const y = h + jitter.bottomY;
            return { edge: "bottom", x, y };
        }

        // 角落：落在边角区域，同时加入对应方向的偏移
        if (slot.corner === "lt") {
            const x = jitter.leftX;
            const y = jitter.topY;
            return { edge: "corner", corner: "lt", x, y };
        }
        if (slot.corner === "rt") {
            const x = w + jitter.rightX;
            const y = jitter.topY;
            return { edge: "corner", corner: "rt", x, y };
        }
        if (slot.corner === "lb") {
            const x = jitter.leftX;
            const y = h + 120 + jitter.bottomY;
            return { edge: "corner", corner: "lb", x, y };
        }
        const x = w + jitter.rightX;
        const y = h + 120 + jitter.bottomY;
        return { edge: "corner", corner: "rb", x, y };
    }

    function computeTentacleAngle(spawn, w, h) {
        if (!spawn.edge) return 0;
        if (spawn.edge === "corner") {
            const cornerJitter = randRange(-10, 10);
            if (spawn.corner === "lt") return 135 + cornerJitter;
            if (spawn.corner === "rt") return -135 + cornerJitter;
            if (spawn.corner === "lb") return 45 + cornerJitter;
            return -45 + cornerJitter; // rb
        }
        const jitter = randRange(-30, 30); // 调整：中段角度随机幅度
        if (spawn.edge === "left") return 90 + jitter;
        if (spawn.edge === "right") return -90 + jitter;
        if (spawn.edge === "top") return 180 + jitter;
        return 0 + jitter; // bottom
    }

    function renderTentacleGuide() {
        if (!guide) return;
        guide.innerHTML = "";
        const inner = document.createElement("div");
        inner.className = "guide-inner";
        const sprite = document.createElement("div");
        sprite.className = "guide-sprite";
        const base = document.createElement("div");
        base.className = "guide-base";
        const head = document.createElement("div");
        head.className = "guide-head";
        const skeleton = document.createElement("div");
        skeleton.className = "guide-skeleton";
        const jointTop = document.createElement("div");
        jointTop.className = "guide-joint top";
        const jointBottom = document.createElement("div");
        jointBottom.className = "guide-joint bottom";
        skeleton.append(jointTop, jointBottom);
        inner.append(sprite, base, head, skeleton);
        guide.appendChild(inner);
    }

    function spawnJumpPixels() {
        if (!jump) return;
        jump.innerHTML = "";
        const pack = document.createElement("div");
        pack.className = "jump-pack";
        const shards = 8;
        for (let i = 0; i < shards; i++) {
            const s = document.createElement("div");
            s.className = "jump-shard";
            const angle = (360 / shards) * i + Math.random() * 10;
            const dist = 22 + Math.random() * 12;
            s.style.setProperty("--angle", `${angle}deg`);
            s.style.setProperty("--dist", `${dist}px`);
            s.style.animationDelay = `${(i * 0.02).toFixed(2)}s`;
            pack.appendChild(s);
        }
        const core = document.createElement("div");
        core.className = "jump-core";
        pack.appendChild(core);
        jump.appendChild(pack);
        setTimeout(() => jump.innerHTML = "", 1200);
    }

    function spawnEggPixels() {
        if (!eggFx) return;
        eggFx.innerHTML = "";
        const variant = Math.floor(Math.random() * 3);
        const spriteUrl = eggSprites[variant];
        const img = document.createElement("img");
        img.className = `egg-pack variant-${variant}`;
        img.src = spriteUrl;
        const size = 180;
        img.width = size;
        img.height = size;
        img.style.width = `${size}px`;
        img.style.height = `${size}px`;
        img.style.marginLeft = `${-size / 2}px`;
        img.style.marginTop = `${-size / 2}px`;
        const xZone = 44 + Math.random() * 12;
        const yZone = 34 + Math.random() * 28;
        img.style.left = `${xZone}%`;
        img.style.top = `${yZone}%`;
        img.title = "彩蛋";
        img.addEventListener("click", () => {
            img.classList.add("egg-pop");
            setTimeout(() => img.classList.remove("egg-pop"), 600);
            if (variant === 1) {
                window.dispatchEvent(new CustomEvent("abyss:egg:moment", { detail: { variant: "blue" } }));
            }
        });
        eggFx.appendChild(img);
        setTimeout(() => eggFx.innerHTML = "", 2400);
    }

    function computeDrift(xPerc, yPerc, scale, side) {
        const targetX = side === "right" ? 60 : 40;
        const targetY = 40 + (Math.random() - 0.5) * 20;
        const dx = (targetX - xPerc) * 0.62;
        const dy = (targetY - yPerc) * 0.46;
        // 大云慢，小云快，范围 3s ~ 5.6s
        const dur = Math.max(3, Math.min(5.6, 5.6 - (scale * 0.32)));
        return { dx, dy, dur };
    }

    function addCloudLumps() {
        // 已用预渲染像素云，保持空实现以防旧调用
    }

    function buildCloudSpriteCache() {
        const palettes = {
            dark: { fill: "#5a6aa3" },
            light: { fill: "#ffe7c8" }
        };
        const variants = {
            a: [
                { x: 42, y: 52, rx: 42, ry: 26 },
                { x: 88, y: 50, rx: 46, ry: 28 },
                { x: 66, y: 26, rx: 30, ry: 18 },
                { x: 18, y: 60, rx: 20, ry: 14 },
                { x: 146, y: 64, rx: 20, ry: 14 },
                { x: 96, y: 22, rx: 18, ry: 12 }
            ],
            b: [
                { x: 34, y: 50, rx: 32, ry: 20 },
                { x: 82, y: 48, rx: 30, ry: 18 },
                { x: 60, y: 32, rx: 20, ry: 12 }
            ],
            c: [
                { x: 52, y: 52, rx: 40, ry: 22 },
                { x: 10, y: 58, rx: 16, ry: 10 },
                { x: 118, y: 62, rx: 16, ry: 10 },
                { x: 2, y: 46, rx: 12, ry: 8 },
                { x: 140, y: 66, rx: 12, ry: 8 }
            ]
        };
        const cache = { dark: {}, light: {} };
        Object.keys(palettes).forEach(pKey => {
            Object.keys(variants).forEach((vKey, idx) => {
                cache[pKey][idx] = createEllipseSprite(palettes[pKey], variants[vKey], 200, 120);
            });
        });
        return cache;
    }

    function buildEggSpriteCache() {
        const palettes = [
            { fill: "#ffe6b8", accent: "#ff9ac0", badge: "#4a1e1e" },
            { fill: "#b0e9ff", accent: "#6ac8ff", badge: "#0f2d46" },
            { fill: "#d6c2ff", accent: "#ff9ad6", badge: "#2e1846" }
        ];
        return palettes.map(p => createEggSprite(p));
    }

    function createEllipseSprite(palette, lumps, width = 200, height = 120) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.fillStyle = palette.fill;
        lumps.forEach(l => {
            ctx.beginPath();
            ctx.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        return canvas.toDataURL("image/png");
    }

    function createEggSprite(palette) {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext("2d");
        if (!ctx) return "";
        ctx.fillStyle = palette.fill;
        ctx.beginPath();
        ctx.ellipse(80, 80, 52, 64, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.accent;
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 / 12) * i;
            const r = 40 + Math.sin(i) * 6;
            const x = 80 + Math.cos(angle) * r;
            const y = 80 + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.ellipse(x, y, 6 + (i % 3), 6 + ((i + 1) % 3), 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = palette.badge;
        ctx.font = "bold 20px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✶", 80, 80);
        return canvas.toDataURL("image/png");
    }
}

function createFogDust(count, width, height) {
    return Array.from({ length: count }).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        alpha: 0.04 + Math.random() * 0.04,
        color: pick(LAYER1_COLORS),
        vx: (Math.random() - 0.5) * 0.05,
        vy: (Math.random() - 0.5) * 0.05,
        size: 0.6 + Math.random() * 1.2
    }));
}

function createColdSparks(count, width, height) {
    return Array.from({ length: count }).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.2),
        vy: (Math.random() - 0.5) * 0.2,
        tail: 3 + Math.random() * 3,
        alpha: 0.12 + Math.random() * 0.08,
        color: pick(LAYER2_COLORS),
        phase: Math.random() * Math.PI * 2
    }));
}

function createHeartMotes(count, width, height) {
    return Array.from({ length: count }).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        baseRadius: 1.2 + Math.random() * 1.2,
        pulseStrength: 1.6 + Math.random() * 0.8,
        freq: (0.6 + Math.random() * 0.6) * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.1,
        color: pick(LAYER3_COLORS)
    }));
}

function drawFogLayer(ctx, particles, width, height) {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        wrapParticle(p, width, height);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawSparkLayer(ctx, particles, width, height, timestamp) {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        wrapParticle(p, width, height);
        const flicker = 0.8 + Math.sin((timestamp / 500) + p.phase) * 0.2;
        ctx.globalAlpha = p.alpha * flicker;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * p.tail, p.y - p.vy * p.tail);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.6, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
    });
}

function drawPulseLayer(ctx, particles, width, height, timestamp) {
    ctx.clearRect(0, 0, width, height);
    const time = timestamp / 1000;
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        wrapParticle(p, width, height);
        const radius = Math.max(0.4, p.baseRadius + Math.sin(time * p.freq + p.phase) * p.pulseStrength);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function wrapParticle(p, width, height) {
    if (p.x < -10) p.x = width + 10;
    if (p.x > width + 10) p.x = -10;
    if (p.y < -10) p.y = height + 10;
    if (p.y > height + 10) p.y = -10;
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function randRange(min, max) {
    return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
