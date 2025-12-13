// Pixel asset hub: icons, bubble decos, and cloud sprites for fog.

const ICON_SIZE = 22;
const CLOUD_WIDTH = 44;
const CLOUD_HEIGHT = 28;

const ICON_DRAWERS = {
    eye: drawEyeIcon,
    pulse: drawPulseIcon,
    envelope: drawEnvelopeIcon
};

const CLOUD_VARIANTS = [
    drawCloudPuff,
    drawCloudStack,
    drawCloudLong
];

const CLOUD_PALETTES = {
    dark: {
        fill: ["#0f0f22", "#1a1e39", "#252d5b", "#3b4a7f"],
        edge: "rgba(104, 128, 180, 0.65)",
        highlight: "rgba(164, 188, 255, 0.4)"
    },
    light: {
        fill: ["#412018", "#b9675f", "#f6cba0", "#ffe3c0"],
        edge: "rgba(255, 220, 180, 0.7)",
        highlight: "rgba(255, 242, 210, 0.5)"
    }
};

export function createPixelIconCanvas(kind = "random") {
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;
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

// ===== Cloud pixel art for fog =====
function drawCloudPuff(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 12, y: 18, rx: 11, ry: 7 },
        { x: 22, y: 16, rx: 9, ry: 6 },
        { x: 32, y: 18, rx: 10, ry: 7 },
        { x: 18, y: 12, rx: 8, ry: 6 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 18, y: 14, rx: 4, ry: 2 },
        { x: 28, y: 18, rx: 3, ry: 2 }
    ]);
}

function drawCloudStack(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors, 0.35, 0.9);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 10, y: 16, rx: 10, ry: 6 },
        { x: 21, y: 18, rx: 12, ry: 7 },
        { x: 32, y: 16, rx: 8, ry: 5 },
        { x: 24, y: 12, rx: 7, ry: 5 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 14, y: 15, rx: 3, ry: 2 },
        { x: 27, y: 16, rx: 3, ry: 2 }
    ]);
}

function drawCloudLong(ctx, colors) {
    const grad = buildCloudGradient(ctx, colors, 0.2, 0.8);
    ctx.fillStyle = grad;
    const lumps = [
        { x: 12, y: 18, rx: 10, ry: 6 },
        { x: 22, y: 17, rx: 11, ry: 6 },
        { x: 32, y: 16, rx: 10, ry: 5 },
        { x: 18, y: 13, rx: 7, ry: 4 }
    ];
    fillLumps(ctx, lumps);
    strokeCloud(ctx, lumps, colors.edge);
    addHighlights(ctx, colors.highlight, [
        { x: 19, y: 14, rx: 3, ry: 2 },
        { x: 30, y: 15, rx: 3, ry: 2 }
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
