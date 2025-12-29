// Pixel asset hub: icons, bubble decos, and cloud sprites for fog.

const ICON_SIZE = 22;
const LEAF_SIZE = 16;
const CLOUD_WIDTH = 64;
const CLOUD_HEIGHT = 36;

const ICON_DRAWERS = {
    eye: drawEyeIcon,
    pulse: drawPulseIcon,
    envelope: drawEnvelopeIcon,
    jade: drawJadeCoin,
    bamboo: drawBambooTile
};

const CLOUD_VARIANTS = [
    drawCloudPuff,
    drawCloudStack,
    drawCloudLong
];

const CLOUD_PALETTES = {
    dark: {
        fill: ["#0c0d22", "#151a3a", "#23315e", "#394a82"],
        edge: "rgba(104, 128, 180, 0.72)",
        highlight: "rgba(174, 198, 255, 0.45)"
    },
    light: {
        fill: ["#4a1f12", "#c66e34", "#f4c772", "#ffe7ba"],
        edge: "rgba(255, 214, 170, 0.92)",
        highlight: "rgba(255, 240, 210, 0.75)"
    }
};

export function createPixelIconCanvas(kind = "random") {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(0.5, 0.5);
    const drawer = resolveIconDrawer(kind);
    drawer(ctx);
    return canvas;
}

export function createBubbleDecoCanvas(kind = "random") {
    return createPixelIconCanvas(kind);
}

export function createCloudSprite({ palette = "dark", variant = null } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = CLOUD_WIDTH;
    canvas.height = CLOUD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;
    const paletteKey = palette === "light" ? "light" : "dark";
    const colors = CLOUD_PALETTES[paletteKey];
    const drawer = resolveCloudDrawer(variant);
    drawer(ctx, colors);
    return canvas;
}

export function createBambooLeafSprite(variant = "solid", palette = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = LEAF_SIZE;
    canvas.height = LEAF_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = true;
    const colors = {
        edge: palette.edge || "#0f3723",
        fill: palette.fill || "#2bc06f",
        hollow: palette.hollow || "#66eaa3"
    };
    const w = LEAF_SIZE;
    const h = LEAF_SIZE;
    ctx.clearRect(0, 0, w, h);

    // Outer diamond
    ctx.beginPath();
    ctx.moveTo(w / 2, 1);
    ctx.lineTo(w - 2, h / 2);
    ctx.lineTo(w / 2, h - 1);
    ctx.lineTo(2, h / 2);
    ctx.closePath();
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1;
    if (variant === "hollow") {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w / 2, 3);
        ctx.lineTo(w - 4, h / 2);
        ctx.lineTo(w / 2, h - 3);
        ctx.lineTo(4, h / 2);
        ctx.closePath();
        ctx.strokeStyle = colors.hollow;
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        ctx.fillStyle = colors.fill;
        ctx.fill();
        ctx.stroke();
    }

    // Straight vein
    ctx.beginPath();
    ctx.moveTo(w / 2, 3);
    ctx.lineTo(w / 2, h - 3);
    ctx.strokeStyle = variant === "hollow" ? colors.hollow : "#e7ffe5";
    ctx.lineWidth = 1;
    ctx.stroke();
    return canvas;
}

function resolveIconDrawer(kind) {
    if (kind && ICON_DRAWERS[kind]) return ICON_DRAWERS[kind];
    const keys = Object.keys(ICON_DRAWERS);
    return ICON_DRAWERS[keys[Math.floor(Math.random() * keys.length)]];
}

function resolveCloudDrawer(variant) {
    if (Number.isInteger(variant) && CLOUD_VARIANTS[variant]) return CLOUD_VARIANTS[variant];
    return CLOUD_VARIANTS[Math.floor(Math.random() * CLOUD_VARIANTS.length)];
}

// ===== Icon pixel art =====
function drawEyeIcon(ctx) {
    ctx.fillStyle = "#050207";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = "#2f0f2a";
    ctx.fillRect(4, 9, 14, 4);
    ctx.fillStyle = "#d7c1ff";
    ctx.fillRect(6, 8, 10, 6);
    ctx.fillStyle = "#1a072d";
    ctx.fillRect(9, 9, 4, 4);
    ctx.fillStyle = "#fff";
    ctx.fillRect(10, 10, 1, 1);
}

function drawPulseIcon(ctx) {
    ctx.fillStyle = "#060209";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = "#3e0f2c";
    ctx.fillRect(2, 10, 18, 2);
    ctx.fillStyle = "#ff9cc2";
    ctx.fillRect(4, 10, 3, 2);
    ctx.fillRect(7, 7, 2, 5);
    ctx.fillRect(9, 7, 3, 2);
    ctx.fillRect(12, 7, 2, 7);
    ctx.fillRect(14, 10, 4, 2);
}

function drawEnvelopeIcon(ctx) {
    ctx.fillStyle = "#040209";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
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

function drawJadeCoin(ctx) {
    ctx.fillStyle = "#05100b";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = "#6ef2c1";
    ctx.fillRect(4, 4, 14, 14);
    ctx.fillStyle = "#1a3028";
    ctx.fillRect(5, 5, 12, 12);
    ctx.fillStyle = "#5ce3ae";
    ctx.fillRect(6, 6, 10, 10);
    ctx.fillStyle = "#0b2018";
    ctx.fillRect(10, 6, 2, 10);
    ctx.fillRect(6, 10, 10, 2);
    ctx.fillStyle = "#b7ffe1";
    ctx.fillRect(7, 7, 2, 2);
}

function drawBambooTile(ctx) {
    ctx.fillStyle = "#0b0f12";
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);
    ctx.fillStyle = "#113322";
    ctx.fillRect(2, 2, 18, 18);
    ctx.fillStyle = "#3ba374";
    for (let i = 0; i < 4; i++) {
        const x = 3 + i * 5;
        ctx.fillRect(x, 4, 2, 14);
        ctx.fillRect(x - 1, 8, 4, 2);
        ctx.fillRect(x - 1, 14, 4, 2);
    }
    ctx.fillStyle = "#6ef2c1";
    ctx.fillRect(6, 6, 2, 2);
    ctx.fillRect(14, 10, 2, 2);
}

// ===== Cloud pixel art for fog =====
function drawCloudPuff(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 16, y: 22, rx: 14, ry: 9 },
        { x: 30, y: 20, rx: 13, ry: 8 },
        { x: 46, y: 22, rx: 14, ry: 9 },
        { x: 24, y: 15, rx: 10, ry: 7 },
        { x: 38, y: 14, rx: 9, ry: 6 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 24, y: 17, rx: 5, ry: 3 },
        { x: 40, y: 20, rx: 4, ry: 2.5 }
    ]);
}

function drawCloudStack(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors, 0.3, 0.92);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 18, y: 22, rx: 14, ry: 8 },
        { x: 32, y: 24, rx: 15, ry: 9 },
        { x: 46, y: 22, rx: 13, ry: 8 },
        { x: 28, y: 16, rx: 9, ry: 6 },
        { x: 40, y: 14, rx: 8, ry: 5 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 22, y: 18, rx: 4, ry: 2.5 },
        { x: 36, y: 19, rx: 4, ry: 2.5 }
    ]);
}

function drawCloudLong(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors, 0.2, 0.86);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 18, y: 22, rx: 13, ry: 7 },
        { x: 30, y: 21, rx: 14, ry: 7 },
        { x: 44, y: 20, rx: 13, ry: 7 },
        { x: 26, y: 15, rx: 9, ry: 5 },
        { x: 38, y: 14, rx: 8, ry: 5 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 24, y: 17, rx: 4, ry: 2 },
        { x: 36, y: 18, rx: 4, ry: 2 }
    ]);
}

function buildCloudGradient(ctx, colors, start = 0.25, end = 0.85) {
    const grad = ctx.createLinearGradient(0, 0, CLOUD_WIDTH, CLOUD_HEIGHT);
    grad.addColorStop(start, colors.fill[1]);
    grad.addColorStop((start + end) / 2, colors.fill[2]);
    grad.addColorStop(end, colors.fill[3]);
    return grad;
}

function fillLumps(ctx, lumps) {
    lumps.forEach(({ x, y, rx, ry }) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    });
}

function strokeCloud(ctx, lumps, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    lumps.forEach(({ x, y, rx, ry }) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function addHighlights(ctx, color, highlights) {
    ctx.fillStyle = color;
    highlights.forEach(({ x, y, rx, ry }) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ---------- Prebaked pixel sprites for performance ----------
// Build cloud sprite sheets (higher resolution to reduce pixelation when scaled)
export function buildCloudSpriteSet() {
    const paletteDark = { fill: "#5a6aa3" };
    const paletteLight = { fill: "#ffe7c8" };
    const variants = {
        a: [
            { x: 160, y: 198, rx: 114, ry: 71 },
            { x: 316, y: 191, rx: 124, ry: 71 },
            { x: 235, y: 101, rx: 77, ry: 47 },
            { x: 74, y: 222, rx: 54, ry: 34 },
            { x: 454, y: 235, rx: 54, ry: 34 },
            { x: 336, y: 84, rx: 40, ry: 27 }
        ],
        b: [
            { x: 132, y: 185, rx: 81, ry: 47 },
            { x: 269, y: 178, rx: 74, ry: 44 },
            { x: 198, y: 118, rx: 51, ry: 30 }
        ],
        c: [
            { x: 185, y: 198, rx: 101, ry: 54 },
            { x: 50, y: 211, rx: 40, ry: 24 },
            { x: 378, y: 226, rx: 40, ry: 24 },
            { x: 27, y: 171, rx: 26, ry: 16 },
            { x: 415, y: 235, rx: 26, ry: 16 }
        ]
    };
    return {
        dark: bakeCloudSprites(paletteDark, variants),
        light: bakeCloudSprites(paletteLight, variants)
    };
}

function bakeCloudSprites(palette, variants) {
    const cache = {};
    ["a", "b", "c"].forEach((key, idx) => {
        cache[idx] = createCloudSpriteCanvas(palette, variants[key]);
    });
    return cache;
}

function createCloudSpriteCanvas(palette, lumps) {
    // Offscreen bake: draw once at base size, scale via canvas to reduce pixelation.
    const SCALE = 6;
    const baseW = 100;
    const baseH = 70;
    const canvas = document.createElement("canvas");
    canvas.width = baseW * SCALE;
    canvas.height = baseH * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.imageSmoothingEnabled = true;
    ctx.scale(SCALE, SCALE); // only scale here; never resize canvas later
    ctx.fillStyle = palette.fill;
    lumps.forEach(l => {
        const x = l.x / SCALE;
        const y = l.y / SCALE;
        const rx = l.rx / SCALE;
        const ry = l.ry / SCALE;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    return canvas.toDataURL("image/png");
}

// Pixel egg sprites (3 variants) for richer Easter effects
export function buildEggSpriteSet() {
    const palettes = [
        { fill: "#ffe6b8", accent: "#ff9ac0", badge: "#4a1e1e", shine: "#fff1d8" },
        { fill: "#b7e6ff", accent: "#6ac8ff", badge: "#0f2d46", shine: "#e4f6ff" },
        { fill: "#d6c2ff", accent: "#ff9ad6", badge: "#2e1846", shine: "#f1e6ff" }
    ];
    return palettes.map(p => createEggSprite(p));
}

function createEggSprite(palette) {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Egg body
    ctx.fillStyle = palette.fill;
    ctx.beginPath();
    ctx.ellipse(120, 120, 78, 92, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shine
    ctx.fillStyle = palette.shine;
    ctx.beginPath();
    ctx.ellipse(84, 92, 28, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Accent dots
    ctx.fillStyle = palette.accent;
    for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 / 16) * i;
        const r = 60 + Math.sin(i) * 8;
        const x = 120 + Math.cos(angle) * r;
        const y = 120 + Math.sin(angle) * r;
        const rx = 7 + (i % 3);
        const ry = 7 + ((i + 1) % 3);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Badge glyph
    ctx.fillStyle = palette.badge;
    ctx.font = "bold 30px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✶", 120, 132);

    return canvas.toDataURL("image/png");
}
