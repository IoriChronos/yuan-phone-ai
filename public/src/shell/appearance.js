const THEME_KEY = "yuan-shell:theme";
const ACCENT_KEY = "yuan-shell:accent";
const DEFAULT_BASE = "#0d080f";
const DEFAULT_GLOW_1 = "#f6c36a";
const DEFAULT_GLOW_2 = "#5a6eb4";
const DEFAULT_ACCENT = "#f6c36a";

export function applyStoredAppearance() {
    applyTheme(loadTheme());
    applyAccent(loadAccent());
}

export function applyTheme(theme = "night") {
    const mode = theme === "day" ? "day" : "night";
    const body = document?.body;
    if (!body) return;
    body.dataset.theme = mode;
    body.classList.toggle("theme-day", mode === "day");
}

export function saveTheme(theme = "night") {
    try {
        window.localStorage?.setItem(THEME_KEY, theme);
    } catch {
        /* ignore */
    }
}

export function loadTheme() {
    try {
        return window.localStorage?.getItem(THEME_KEY) || "night";
    } catch {
        return "night";
    }
}

export function applyAccent(color = DEFAULT_BASE) {
    const root = document?.documentElement;
    if (!root) return;
    const safe = normalizeHex(color);
    const glow1 = lightenHex(safe, 0.22);
    const glow2 = lightenHex(safe, 0.32);
    root.style.setProperty("--bg-base", safe || DEFAULT_BASE);
    root.style.setProperty("--bg-glow-1", glow1 || DEFAULT_GLOW_1);
    root.style.setProperty("--bg-glow-2", glow2 || DEFAULT_GLOW_2);
    // Keep UI chrome accent stable
    root.style.setProperty("--accent", DEFAULT_ACCENT);
    root.style.setProperty("--accent-strong", DEFAULT_ACCENT);
    root.style.setProperty("--accent-ghost", hexToRgba(DEFAULT_ACCENT, 0.16));
}

export function saveAccent(color = DEFAULT_BASE) {
    try {
        window.localStorage?.setItem(ACCENT_KEY, color);
    } catch {
        /* ignore */
    }
}

export function loadAccent() {
    try {
        const stored = window.localStorage?.getItem(ACCENT_KEY);
        if (stored) {
            const norm = normalizeHex(stored);
            // If old stored accent was the gold hue, fall back to the default dark base.
            if (norm.toLowerCase() === "#f6c36a") return DEFAULT_BASE;
            return norm;
        }
    } catch {
        /* ignore */
    }
    return DEFAULT_BASE;
}

function normalizeHex(value = "") {
    const hex = String(value).trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
        return hex.length === 4
            ? "#" + hex.slice(1).split("").map(c => c + c).join("")
            : hex;
    }
    return "#f6c36a";
}

function lightenHex(hex, amount = 0.2) {
    const safe = normalizeHex(hex).replace("#", "");
    const num = parseInt(safe, 16);
    const r = Math.min(255, Math.round(((num >> 16) & 255) * (1 + amount)));
    const g = Math.min(255, Math.round(((num >> 8) & 255) * (1 + amount)));
    const b = Math.min(255, Math.round((num & 255) * (1 + amount)));
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(n) {
    return n.toString(16).padStart(2, "0");
}

function hexToRgba(hex = "", alpha = 1) {
    const safe = normalizeHex(hex).replace("#", "");
    const bigint = parseInt(safe, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
