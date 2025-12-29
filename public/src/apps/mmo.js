import { getGlobalUserName } from "../data/system-rules.js";
import { getState, updateState } from "../core/state.js";
import { showPhoneFloatingAlert } from "../ui/phone.js";
import { createPixelIconCanvas } from "../ui/pixel.js";
import { getWindowId, resolveWindowId } from "../core/window-context.js";

const STORAGE_KEY_BASE = "martial-mmo-state";
const CURRENCY_NAME = "灵玉";
const HONOR_NAME = "风华值";
const PHOENIX_ITEM = {
    id: "mount-phoenix",
    name: "朱雀·风焰霄行（限定）",
    price: 3000000,
    score: 50000,
    rarity: "mount",
    isLegend: true,
    effectClass: "phoenix-effect",
    note: "包含限定坐骑与主题时装，共计加赠 30000 坐骑风华 + 20000 时装风华。",
    bonus: { mount: 30000, outfit: 20000 }
};
const HORSE_ITEM = {
    id: "mount-horse",
    name: "疾风速（骏马，可升阶）",
    price: 20000,
    score: 2500,
    rarity: "mount",
    tier: 2580
};
const GOOSE_ITEM = {
    id: "mount-goose",
    name: "鹅（可升阶）",
    price: 1280,
    score: 300,
    rarity: "mount",
    tier: 1280
};
const TREASURE_ITEMS = [
    { id: "tshop-1", name: "天赏·鸣风金裳", cost: 2, rarity: "gold", category: "cloth" },
    { id: "tshop-2", name: "天赏·苍云华冕", cost: 2, rarity: "gold", category: "cloth" },
    { id: "tshop-3", name: "天赏·墨星夜鹭", cost: 2, rarity: "gold", category: "cloth" },
    { id: "tshop-4", name: "天赏·流光雪羽", cost: 2, rarity: "gold", category: "cloth" },
    { id: "tshop-5", name: "天赏·霁月青霜", cost: 2, rarity: "gold", category: "cloth" },
    { id: "tshop-6", name: "天赏·赤霄炎纹", cost: 2, rarity: "gold", category: "cloth" }
];
const MAX_PHOENIX_OWNERS = 25;
const PHOENIX_ROLL_PROB = 0.00025; // 0.025%
const ALLOW_NPC_NEW_MOUNT = true; // 首次打开不触发，后续允许 NPC 获取，最多 25 人
const SHOP_ITEMS = buildShopItems();
const RECHARGE_TIERS = [6, 30, 68, 98, 128, 298, 598, 1200];
const GACHA_COST = 160;
const GOOSE_MAX_LEVEL = 5;

let state = loadState();

function storage() {
    if (typeof window === "undefined") return null;
    return window.sessionStorage || window.localStorage || null;
}

function getStorageKey() {
    try {
        const scoped = resolveWindowId(getWindowId?.());
        return `${STORAGE_KEY_BASE}:${scoped}`;
    } catch {
        return STORAGE_KEY_BASE;
    }
}

function loadState() {
    if (typeof window === "undefined") return defaultState();
    try {
        const raw = storage()?.getItem(getStorageKey());
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return normalizeState({ ...defaultState(), ...parsed });
    } catch {
        return defaultState();
    }
}

function defaultState() {
    return {
        coins: 0,
        pity: 0,
        score: 0,
        bag: [],
        ownedSetIds: [],
        hasPhoenixMount: false,
        phoenixUpgradeLevel: 0,
        hasGooseMount: false,
        gooseUpgradeLevel: 0,
        treasureStones: 0,
        totalRechargeRMB: 0,
        hasAutumnReward: false,
        leaderboard: seedLeaderboardV2(),
        leaderboardRolledOnce: false,
        login: false
    };
}

function normalizeState(next) {
    const normalized = { ...next };
    normalized.hasPhoenixMount = !!normalized.hasPhoenixMount;
    normalized.phoenixUpgradeLevel = Number.isFinite(normalized.phoenixUpgradeLevel) ? normalized.phoenixUpgradeLevel : 0;
    if (normalized.hasPhoenixMount && normalized.phoenixUpgradeLevel < 1) {
        normalized.phoenixUpgradeLevel = 1;
    }
    normalized.hasGooseMount = !!normalized.hasGooseMount;
    normalized.gooseUpgradeLevel = Number.isFinite(normalized.gooseUpgradeLevel) ? Math.min(Math.max(normalized.gooseUpgradeLevel, 0), GOOSE_MAX_LEVEL) : 0;
    if (normalized.hasGooseMount && normalized.gooseUpgradeLevel < 1) {
        normalized.gooseUpgradeLevel = 1;
    }
    normalized.treasureStones = Number.isFinite(normalized.treasureStones) ? normalized.treasureStones : 0;
    normalized.totalRechargeRMB = Number.isFinite(normalized.totalRechargeRMB) ? normalized.totalRechargeRMB : 0;
    normalized.hasAutumnReward = !!normalized.hasAutumnReward;
    normalized.leaderboard = normalizeLeaderboard(normalized.leaderboard);
    normalized.leaderboardRolledOnce = !!normalized.leaderboardRolledOnce;
    return normalized;
}

function normalizeLeaderboard(list) {
    const source = Array.isArray(list) && list.length ? list : seedLeaderboardV2();
    return source.map(entry => ({
        ...entry,
        hasPhoenixMount: !!entry.hasPhoenixMount
    }));
}

function saveState() {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(getStorageKey(), JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

// listen for global reset signals (triggered by reset.js)
if (typeof window !== "undefined") {
    window.addEventListener("mmo-reset", () => {
        state = defaultState();
        saveState();
        const page = document.getElementById("mmo-page");
        if (page) {
            renderCurrency();
            renderShop();
            renderLeaderboard();
            renderBag();
        }
    });
}

function addCoins(delta) {
    state.coins = Math.max(0, Math.round((state.coins || 0) + delta));
    saveState();
    renderCurrency();
}

function addScore(delta) {
    state.score = Math.max(0, Math.round((state.score || 0) + delta));
    saveState();
}

function mapTierToRarity(item) {
    if (item?.id === GOOSE_ITEM.id) return "blue";
    if (item.rarity === "mount") {
        if (item.tier >= 2580 || item.price >= 20000) return "gold";
        if (item.tier >= 1280) return "purple";
        if (item.tier >= 680) return "blue";
        return "common";
    }
    if (item.tier >= 2580 || item.price >= 2580) return "purple"; // 服装最高档为紫色
    if (item.tier >= 1280 || item.price >= 1280) return "blue";
    if (item.tier >= 680 || item.price >= 680) return "silver";
    return item.rarity || "common";
}

function updateLeaderboard() {
    if (!state.leaderboardRolledOnce) {
        state.leaderboardRolledOnce = true;
        saveState();
        return;
    }
    const entries = [...(state.leaderboard || [])];
    let owners = entries.filter(e => e.hasPhoenixMount).length + (state.hasPhoenixMount ? 1 : 0);
    const hasRoomForMount = () => owners < MAX_PHOENIX_OWNERS;
    const updated = entries.map(e => {
        const baseScore = Number.isFinite(e.score) ? e.score : 0;
        const roll = Math.random();
        if (ALLOW_NPC_NEW_MOUNT && roll < PHOENIX_ROLL_PROB && !e.hasPhoenixMount && hasRoomForMount()) {
            owners += 1;
            return {
                ...e,
                hasPhoenixMount: true,
                score: baseScore + 50000 + Math.floor(Math.random() * 5000)
            };
        }
        const normal = Math.random();
        const highProb = 0.035;
        const midProb = 0.066;
        const smallProb = 0.568; // 剩余大部分划给小幅
        if (normal < smallProb) {
            const delta = Math.floor(Math.random() * 101);
            return { ...e, score: baseScore + delta };
        }
        if (normal < smallProb + midProb) {
            return { ...e, score: baseScore + 100 + Math.floor(Math.random() * 901) };
        }
        if (normal < smallProb + midProb + highProb) {
            return { ...e, score: baseScore + 1000 + Math.floor(Math.random() * 1001) };
        }
        return e; // 剩余概率（约 33%）为无变化
    });
    state.leaderboard = updated;
    saveState();
}

function seedLeaderboard() {
    return seedLeaderboardV2();
}

function seedLeaderboardV2() {
    const fixed = [
        { name: "椿", score: 180670, hasPhoenixMount: true },
        { name: "谢无咎", score: 162095, hasPhoenixMount: true },
        { name: "睡了", score: 145068, hasPhoenixMount: true },
        { name: "顾白", score: 140955 },
        { name: "灬控制欲", score: 136092 },
        { name: "顾里灬长安", score: 133002 },
        { name: "闻书白", score: 131025, hasPhoenixMount: true },
        { name: "陆知返", score: 128880, hasPhoenixMount: true },
        { name: "楚留香", score: 125740 },
        { name: "这号借来的", score: 124220 },
        { name: "我爹真牛", score: 123610 },
        { name: "人机别追", score: 122455 },
        { name: "国服第一钟离", score: 121330 },
        { name: "今天不做人", score: 120515 },
        { name: "被策划追杀中", score: 119880 },
        { name: "丶热干面", score: 119220, hasPhoenixMount: true },
        { name: "键盘在冒烟", score: 118405 },
        { name: "灬情绪稳定", score: 117780 },
        { name: "晚", score: 117010 },
        { name: "被自己帅醒", score: 116330 },
        { name: "小乖", score: 115705 },
        { name: "训狗师", score: 115090 },
        { name: "跪好别动", score: 114360 },
        { name: "丨听话点", score: 113740 },
        { name: "偏爱疼", score: 113055 },
        { name: "灬哦", score: 112480 },
        { name: "起名七个字个字", score: 111865 },
        { name: "女王", score: 111090 },
        { name: "浅", score: 110430 },
        { name: "随便", score: 109780 },
        { name: "绵绵睡不醒", score: 109205 },
        { name: "柠檬奶", score: 108590 },
        { name: "睡了的朋友A", score: 107940 },
        { name: "喝汽水的猫", score: 107210 },
        { name: "小熊软糖没了", score: 106640 },
        { name: "沈霁", score: 105980 },
        { name: "顾白·次位", score: 105365 },
        { name: "陆丨沉", score: 104730 },
        { name: "裴灬行", score: 104050 },
        { name: "闻砚", score: 103410 },
        { name: "谢阑", score: 102795 },
        { name: "周隐", score: 102140 },
        { name: "宋迟丶", score: 101525 },
        { name: "沈听澜", score: 100860 },
        { name: "顾行舟", score: 100210 },
        { name: "陆知返·次位", score: 99580 },
        { name: "谢无咎·次位", score: 98890 },
        { name: "裴照野", score: 98230 },
        { name: "闻书白·次位", score: 97590 },
        { name: "周临川", score: 96980 }
    ];
    return fixed.map(entry => ({ ...entry }));
}

function buildShopItems() {
    const names258 = ["龙吟寒曜", "寒光夜烬", "云海归墟", "青锋暮雪", "墨羽流金", "紫电星痕", "沧浪浮梦", "玄鳞破界", "锦鲤映曜", "孤影长明"];
    const names128 = ["竹雾微澜", "霜痕碎影", "夜鹭残星", "星芒引路", "烟雨长歌"];
    const names68 = ["溟光镜界", "魇火幽铃", "缈境斩光", "空城梦阙"];
    const names6 = ["星坠环中"];
    const items = [
        { ...PHOENIX_ITEM, category: "mount" },
        { ...HORSE_ITEM, category: "mount" },
        { ...GOOSE_ITEM, category: "mount" }
    ];
    names258.forEach((name, idx) => {
        const bonus = Math.floor(Math.random() * 81); // +0~80 风华
        items.push({
            id: `set-258-${idx}`,
            name,
            price: 2580,
            score: 500 + bonus,
            tier: 2580,
            category: "cloth",
            isSale: idx < 2,
            originalPrice: idx < 2 ? 3280 : undefined
        });
    });
    names128.forEach((name, idx) => {
        const bonus = Math.floor(Math.random() * 81);
        items.push({ id: `set-128-${idx}`, name, price: 1280, score: 300 + bonus, tier: 1280, category: "cloth" });
    });
    names68.forEach((name, idx) => items.push({ id: `set-68-${idx}`, name, price: 680, score: 220, tier: 680, category: "cloth" }));
    names6.forEach((name, idx) => items.push({ id: `set-6-${idx}`, name, price: 60, score: 120, category: "cloth" }));
    return items;
}

function ensureLoginAvatar() {
    const user = getGlobalUserName?.() || "侠客";
    const first = (user || "").trim().charAt(0);
    return first || "侠";
}

function syncPhoenixAvatar() {
    const has = !!state.hasPhoenixMount;
    document.querySelectorAll(".mmo-avatar").forEach(el => el.classList.toggle("has-phoenix", has));
}

export function initMMOApp() {
    const page = document.getElementById("mmo-page");
    if (!page) return;
    bindLogin(page);
    renderCurrency();
    renderShop();
    renderLeaderboard();
    renderBag();
    renderRecharge();
    bindMenu(page);
    bindGacha(page);
    updateLeaderboard();
    renderLeaderboard();
    syncPhoenixAvatar();
    bindVisibilityRefresh(page);
    paintParticles();
    page.dataset.ready = "true";
}

function bindVisibilityRefresh(page) {
    const refresh = () => {
        updateLeaderboard();
        renderLeaderboard();
        renderCurrency();
    };
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && page?.dataset?.ready === "true") {
            refresh();
        }
    });
    window.addEventListener("focus", () => {
        if (page?.dataset?.ready === "true") {
            refresh();
        }
    });
}

function bindLogin(page) {
    const shell = page.querySelector(".mmo-shell");
    const login = page.querySelector(".mmo-login");
    const main = page.querySelector(".mmo-main");
    const enterBtn = page.querySelector("[data-act='mmo-enter']");
    const avatar = page.querySelector("#mmo-avatar-initial");
    const closeBtn = page.querySelector("[data-act='mmo-close']");
    if (avatar) avatar.textContent = ensureLoginAvatar();
    const hideMenu = () => {
        const menu = page.querySelector(".mmo-menu");
        if (!menu) return;
        menu.hidden = true;
        menu.classList.remove("open");
        menu.setAttribute("aria-hidden", "true");
    };
    const showCloseIfLoggedIn = () => {
        if (closeBtn) closeBtn.hidden = !state.login;
    };
    if (closeBtn) {
        showCloseIfLoggedIn();
        closeBtn.addEventListener("click", () => {
            switchView("home", page);
            hideMenu();
            const scroll = page.querySelector(".mmo-content");
            if (scroll) scroll.scrollTop = 0;
        });
    }
    syncPhoenixAvatar();
    const enterGame = () => {
        state.login = true;
        saveState();
        shell?.setAttribute("data-state", "game");
        if (login) login.hidden = true;
        if (main) main.hidden = false;
        switchView("home", page);
        updateLeaderboard();
        renderLeaderboard();
        renderCurrency();
        showCloseIfLoggedIn();
    };
    if (state.login) {
        enterGame();
    }
    enterBtn?.addEventListener("click", () => enterGame());
}

function bindMenu(page) {
    const menuBtn = page.querySelector("[data-act='toggle-menu']");
    const menu = page.querySelector(".mmo-menu");
    const content = page.querySelector(".mmo-content");
    const avatar = page.querySelector(".mmo-avatar");
    if (menu && !menu.querySelector("[data-view='tshop']")) {
        const btn = document.createElement("button");
        btn.dataset.view = "tshop";
        btn.textContent = "天赏";
        menu.appendChild(btn);
    }
    page.querySelectorAll("[data-act='mmo-back']").forEach(btn => {
        btn.addEventListener("click", () => switchView("home", page));
    });
    if (menu) {
        menu.hidden = true;
        menu.setAttribute("aria-hidden", "true");
    }
    menuBtn?.addEventListener("click", () => {
        if (!menu) return;
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        menu.classList.toggle("open", willOpen);
        menu.setAttribute("aria-hidden", String(!willOpen));
    });
    menu?.querySelectorAll("button[data-view]").forEach(btn => {
        btn.addEventListener("click", () => {
            switchView(btn.dataset.view, page);
            menu.hidden = true;
            menu.classList.remove("open");
            menu.setAttribute("aria-hidden", "true");
        });
    });
    content?.querySelectorAll("[data-view-target]").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.viewTarget, page));
    });
    avatar?.addEventListener("click", () => switchView("bag", page));
}

function switchView(view, page) {
    const views = page.querySelectorAll(".mmo-view");
    views.forEach(v => {
        const show = v.dataset.view === view;
        v.hidden = !show;
        v.classList.toggle("active", show);
    });
    page.dataset.activeView = view;
    renderCurrency();
    renderBag();
    // 每次切换视图都滚动一次排行榜，以便 NPC 风华有随机增幅
    updateLeaderboard();
    renderLeaderboard();
    if (view === "shop") renderShop();
    if (view === "gacha") renderGachaHeader();
    if (view === "recharge") renderRecharge();
    if (view === "tshop") renderTreasureShop();
}

function renderCurrency() {
    const coins = state.coins || 0;
    document.querySelectorAll("#mmo-currency-main,#mmo-currency-shop,#mmo-currency-gacha,#mmo-currency-recharge,#mmo-currency-leader,#mmo-currency-bag,#mmo-currency-pixel").forEach(el => {
        if (!el) return;
        el.innerHTML = "";
        const icon = createPixelIconCanvas("jade");
        icon.classList.add("mmo-coin-icon");
        icon.width = 18;
        icon.height = 18;
        const text = document.createElement("span");
        text.className = "mmo-coin-text";
        text.textContent = `${CURRENCY_NAME}：${coins}`;
        el.appendChild(icon);
        el.appendChild(text);
    });
    renderTreasureBalance();
    syncPhoenixAvatar();
}

function renderTreasureBalance() {
    const stones = state.treasureStones || 0;
    document.querySelectorAll("#mmo-currency-treasure,#mmo-tshop-balance").forEach(el => {
        if (!el) return;
        el.innerHTML = "";
        const icon = createPixelIconCanvas("jade");
        icon.classList.add("mmo-coin-icon");
        icon.width = 18;
        icon.height = 18;
        const text = document.createElement("span");
        text.className = "mmo-coin-text";
        text.textContent = `天赏石：${stones}`;
        el.appendChild(icon);
        el.appendChild(text);
    });
}

function renderShop() {
    const list = document.getElementById("mmo-shop-list");
    const detail = document.getElementById("mmo-shop-detail");
    const scoreEl = document.getElementById("mmo-score-shop");
    if (!list || !detail) return;
    list.innerHTML = "";
    SHOP_ITEMS.forEach(item => {
        const card = document.createElement("button");
        card.className = "mmo-shop-card";
        const rarityClass = mapTierToRarity(item);
        if (item.isLegend || rarityClass === "gold") card.classList.add("is-legend");
        if (item.isSale) card.classList.add("is-sale");
        if (item.tier && item.category !== "mount") card.classList.add(`tier-${item.tier}`);
        if (item.effectClass) card.classList.add(item.effectClass);
        const owned = state.ownedSetIds.includes(item.id) || (item.id === PHOENIX_ITEM.id && state.hasPhoenixMount);
        card.innerHTML = `
            <div class="shop-name">${item.name}${item.isSale ? '<span class="shop-tag">限时</span>' : ""}</div>
            ${owned ? '<div class="shop-owned-inline">已拥有</div>' : ""}
        `;
        card.dataset.id = item.id;
        card.addEventListener("click", () => showShopDetail(item, detail));
        list.appendChild(card);
    });
    if (scoreEl) scoreEl.textContent = `${HONOR_NAME}：${state.score || 0}`;
}

function showShopDetail(item, detail) {
    const owned = state.ownedSetIds.includes(item.id) || (item.id === PHOENIX_ITEM.id && state.hasPhoenixMount);
    detail.innerHTML = `
        <div class="mmo-shop-title">${item.name}</div>
        <div class="mmo-shop-price">${item.price} ${CURRENCY_NAME} ${item.originalPrice ? `<span class="shop-original">(原价 ${item.originalPrice})</span>` : ""}</div>
        <button class="ui-btn ui-primary" data-buy="${item.id}" ${owned ? "disabled" : ""}>${owned ? "已拥有" : "购买"}</button>
        <div class="mmo-shop-note">购买计入${HONOR_NAME}：+${item.score}</div>
        ${item.note ? `<div class="mmo-shop-note">${item.note}</div>` : ""}
        ${item.id === PHOENIX_ITEM.id ? `<div class="mmo-shop-note">升级材料固定为 20 个「金·龙鳞佩」</div>` : ""}
        ${item.id === GOOSE_ITEM.id ? `<div class="mmo-shop-note">可升阶 4 次，每次 680 灵玉，名称叠字</div>` : ""}
        ${item.id === HORSE_ITEM.id ? `<div class="mmo-shop-note">可升阶坐骑，直购即可使用</div>` : ""}
        ${item.id.startsWith("tshop-") ? `<div class="mmo-shop-note">需在天赏商店兑换（2 天赏）</div>` : ""}
    `;
    const btn = detail.querySelector("[data-buy]");
    btn?.addEventListener("click", () => handlePurchase(item));
}

function handlePurchase(item) {
    if (item.id === PHOENIX_ITEM.id && state.hasPhoenixMount) {
        toast("已拥有限定坐骑，无需重复购买。");
        return;
    }
    if (item.id === GOOSE_ITEM.id && state.hasGooseMount) {
        toast("已拥有该坐骑，可在背包升阶。");
        return;
    }
    if ((state.coins || 0) < item.price) {
        toast("灵玉不足，需充值或抽卡补充。");
        return;
    }
    state.coins -= item.price;
    addScore(item.score);
    if (!state.ownedSetIds.includes(item.id)) {
        state.ownedSetIds.push(item.id);
    }
    const rarity = item.id === GOOSE_ITEM.id ? "blue" : mapTierToRarity(item);
    const category = item.category || (item.rarity === "mount" ? "mount" : "cloth");
    if (item.id === GOOSE_ITEM.id) {
        state.hasGooseMount = true;
        state.gooseUpgradeLevel = Math.min(GOOSE_MAX_LEVEL, Math.max(state.gooseUpgradeLevel || 0, 1));
        const gooseName = "鹅".repeat(state.gooseUpgradeLevel || 1);
        state.bag.push({ name: gooseName, rarity, source: "shop", category: "mount" });
    } else {
        state.bag.push({ name: item.name, rarity, source: "shop", category });
    }
    if (item.id === PHOENIX_ITEM.id) {
        state.hasPhoenixMount = true;
        state.phoenixUpgradeLevel = Math.max(state.phoenixUpgradeLevel || 0, 1);
        const bonus = item.bonus || { mount: 0, outfit: 0 };
        addScore((bonus.mount || 0) + (bonus.outfit || 0));
        state.bag.push({ name: "朱雀凌霄坐骑", rarity: "mount" });
        state.bag.push({ name: "朱雀·附赠时装", rarity: "mount" });
    } else if (item.id === HORSE_ITEM.id) {
        state.bag.push({ name: "疾风速（坐骑）", rarity: "mount" });
    } else if (item.id.startsWith("tshop-")) {
        // 购买天赏商品在专属商店处理
    }
    saveState();
    renderCurrency();
    renderShop();
    renderBag();
    renderLeaderboard();
    syncPhoenixAvatar();
    toast("购买成功，已加入背包。");
}

function setupGachaTriangles(page) {
    const bg = page.querySelector(".mmo-gacha-bg");
    if (!bg || bg.querySelector(".mmo-gacha-triangles")) return;
    const layer = document.createElement("div");
    layer.className = "mmo-gacha-triangles";
    const count = 14;
    for (let i = 0; i < count; i++) {
        const tri = document.createElement("span");
        tri.className = "gacha-triangle";
        const size = 10 + Math.random() * 4;
        const drift = (Math.random() * 16 - 8).toFixed(1);
        tri.style.setProperty("--size", `${size}px`);
        tri.style.setProperty("--x", `${Math.random() * 100}%`);
        tri.style.setProperty("--delay", `${Math.random() * 8}s`);
        tri.style.setProperty("--duration", `${9 + Math.random() * 6}s`);
        tri.style.setProperty("--drift", `${drift}px`);
        layer.appendChild(tri);
    }
    bg.prepend(layer);
}

function bindGacha(page) {
    setupGachaTriangles(page);
    const actions = page.querySelector(".mmo-gacha-actions");
    actions?.querySelectorAll("button[data-pulls]").forEach(btn => {
        btn.addEventListener("click", () => {
            const pulls = Number(btn.dataset.pulls || "1");
            runGacha(pulls);
        });
    });
    renderGachaHeader();
}

function renderGachaHeader() {
    const pityEl = document.getElementById("mmo-pity");
    if (pityEl) pityEl.textContent = `距保底：${Math.max(0, 150 - (state.pity || 0))} 抽`;
    renderCurrency();
}

function runGacha(pulls) {
    if (pulls === 50 && (state.totalRechargeRMB || 0) < 10000) {
        toast("累计充值满 10000 元后解锁 50 抽。");
        return;
    }
    const totalCost = pulls * GACHA_COST;
    if ((state.coins || 0) < totalCost) {
        toast("灵玉不足，先去充值或购买。");
        return;
    }
    state.coins -= totalCost;
    const results = [];
    for (let i = 0; i < pulls; i++) {
        const rarity = rollRarity();
        const roll = rollItemName(rarity);
        results.push({ rarity, name: roll.name });
        if (rarity === "gold") {
            state.pity = 0;
            if (roll.shouldAddScore) addScore(2000);
        } else {
            state.pity += 1;
        }
    }
    saveState();
    renderCurrency();
    renderGachaHeader();
    renderBag();
    renderLeaderboard();
    renderGachaResults(results);
}

function rollRarity() {
    const pity = state.pity || 0;
    if (pity >= 150) return "gold";
    let goldProb = 0.0085;
    if (pity >= 140) goldProb = 0.015;
    else if (pity >= 130) goldProb = 0.01;
    const rand = Math.random();
    if (rand < goldProb) return "gold";
    if (rand < goldProb + 0.16) return "purple";
    return "blue";
}

function rollItemName(rarity) {
    const gold = ["龙鳞佩", "天赏石", "九霄琴匣", "落霞金铃"];
    const purple = ["青冥碎片", "紫烟羽", "寒溪竹叶", "暮雨琴弦", "秋水春色"];
    const blue = ["竹叶青晶", "微光羽片", "松间石", "云雾砂"];
    const pool = rarity === "gold" ? gold : rarity === "purple" ? purple : blue;
    const name = pool[Math.floor(Math.random() * pool.length)];
    const entryName = `${rarityLabel(rarity)}·${name}`;
    let shouldAddScore = rarity === "gold";
    if (name === "天赏石") {
        state.treasureStones = (state.treasureStones || 0) + 1;
        state.bag.push({ name: entryName, rarity: "gold", source: "gacha" });
        shouldAddScore = false;
    } else if (name === "秋水春色") {
        if (!state.hasAutumnReward) {
            state.hasAutumnReward = true;
            addScore(500);
            state.bag.push({ name: entryName, rarity: "purple", source: "gacha" });
        }
    } else if (rarity === "gold") {
        state.bag.push({ name: entryName, rarity, source: "gacha" });
    }
    saveState();
    return { name: entryName, shouldAddScore };
}

function rarityLabel(rarity) {
    if (rarity === "gold") return "金";
    if (rarity === "purple") return "紫";
    return "蓝";
}

function renderGachaResults(results) {
    const wrap = document.getElementById("mmo-gacha-results");
    if (!wrap) return;
    wrap.innerHTML = "";
    wrap.classList.remove("single-grid", "small-grid", "compact-grid");
    const isBulk = results.length > 20;
    if (results.length === 1) {
        wrap.classList.add("single-grid");
    } else if (results.length <= 10) {
        wrap.classList.add("small-grid");
    } else {
        wrap.classList.add("compact-grid");
    }
    const abbreviate = (name, rarity) => {
        if (!isBulk) return name;
        if (name.includes("龙鳞佩")) return "龙";
        if (name.includes("天赏石")) return "天";
        if (name.includes("秋水春色")) return "秋";
        if (name.includes("烟花") || name.includes("爆竹")) return "爆";
        return rarityLabel(rarity);
    };
    results.forEach(r => {
        const cell = document.createElement("div");
        cell.className = `mmo-crystal ${r.rarity}`;
        cell.textContent = abbreviate(r.name, r.rarity);
        wrap.appendChild(cell);
    });
}

function renderBag() {
    const list = document.getElementById("mmo-bag-list");
    if (!list) return;
    list.innerHTML = "";
    const filtered = state.bag || [];
    if (!filtered.length) {
        list.innerHTML = `<div class="mmo-placeholder">背包空空，如风过竹林。</div>`;
        return;
    }
    const dragonCount = (state.bag || []).filter(item => (item.name || "").includes("龙鳞佩") && (item.name || "").includes("金")).length;
    if (state.hasPhoenixMount && (state.phoenixUpgradeLevel || 0) < 2) {
        const upgrade = document.createElement("div");
        upgrade.className = "mmo-bag-row mount";
        upgrade.innerHTML = `<span>朱雀坐骑${dragonCount >= 20 ? "可升级" : "需20个金·龙鳞佩"}（当前 ${dragonCount}/20）</span><em>${dragonCount >= 20 ? "点击升级" : "收集龙鳞佩"}</em>`;
        if (dragonCount >= 20) {
            upgrade.addEventListener("click", () => upgradePhoenixMount());
        }
        list.appendChild(upgrade);
    }
    if (state.hasGooseMount && (state.gooseUpgradeLevel || 0) < GOOSE_MAX_LEVEL) {
        const canAfford = (state.coins || 0) >= 680;
        const upgrade = document.createElement("div");
        upgrade.className = "mmo-bag-row mount";
        upgrade.innerHTML = `<span>鹅坐骑升级（${state.gooseUpgradeLevel || 1}/${GOOSE_MAX_LEVEL}）</span><em>${canAfford ? "消耗 680 灵玉 · 名称加鹅" : "灵玉不足"}</em>`;
        if (canAfford) {
            upgrade.addEventListener("click", () => upgradeGooseMount());
        }
        list.appendChild(upgrade);
    }
    filtered.slice(-100).reverse().forEach(item => {
        const row = document.createElement("div");
        row.className = `mmo-bag-row ${item.rarity || "common"}`;
        if ((item.name || "").includes("朱雀凌霄·进阶")) {
            row.classList.add("phoenix-upgraded");
        }
        const tag = item.source === "gacha" ? (item.rarity || "") : (item.category || item.rarity || "");
        row.innerHTML = `<span>${item.name}</span><em>${tag}</em>`;
        list.appendChild(row);
    });
}

function renderTreasureShop() {
    const listEl = document.getElementById("mmo-tshop-list");
    const detailEl = document.getElementById("mmo-tshop-detail");
    const scoreEl = document.getElementById("mmo-tshop-score");
    renderTreasureBalance();
    if (scoreEl) scoreEl.textContent = `${HONOR_NAME}：${state.score || 0}`;
    if (!listEl || !detailEl) return;
    const selected = detailEl.dataset?.selectedId;
    listEl.innerHTML = "";
    TREASURE_ITEMS.forEach(item => {
        const card = document.createElement("button");
        card.className = "mmo-shop-card is-legend";
        card.innerHTML = `<div class="shop-name">${item.name}</div>`;
        card.addEventListener("click", () => showTreasureDetail(item, detailEl));
        listEl.appendChild(card);
    });
    const current = TREASURE_ITEMS.find(i => i.id === selected);
    if (current) {
        showTreasureDetail(current, detailEl);
    } else {
        detailEl.innerHTML = `<div class="mmo-shop-placeholder">请选择天赏兑换物</div>`;
        detailEl.dataset.selectedId = "";
    }
}

function showTreasureDetail(item, detail) {
    const canAfford = (state.treasureStones || 0) >= item.cost;
    detail.dataset.selectedId = item.id;
    detail.innerHTML = `
        <div class="mmo-shop-title">${item.name}</div>
        <div class="mmo-shop-price">${item.cost} 天赏石</div>
        <button class="ui-btn ui-primary" data-tshop-buy="${item.id}" ${canAfford ? "" : "disabled"}>${canAfford ? "兑换" : "天赏不足"}</button>
        <div class="mmo-shop-note">兑换随机获得 +4500~5500 ${HONOR_NAME}</div>
        <div class="mmo-shop-note">消耗后立即加入背包并结算风华</div>
    `;
    const btn = detail.querySelector("[data-tshop-buy]");
    btn?.addEventListener("click", () => redeemTreasureItem(item));
}

function redeemTreasureItem(item) {
    if ((state.treasureStones || 0) < item.cost) {
        toast("天赏不足，无法兑换。");
        return;
    }
    state.treasureStones -= item.cost;
    const gain = 4500 + Math.floor(Math.random() * 1001);
    addScore(gain);
    state.bag.push({ name: item.name, rarity: item.rarity || "gold", category: item.category || "cloth", source: "tshop" });
    saveState();
    renderTreasureBalance();
    renderTreasureShop();
    renderBag();
    renderCurrency();
    toast(`兑换成功，${HONOR_NAME}+${gain}`);
}

function upgradePhoenixMount() {
    if (!state.hasPhoenixMount || (state.phoenixUpgradeLevel || 0) >= 2) return;
    const required = 20;
    const dragons = (state.bag || []).filter(item => (item.name || "").includes("龙鳞佩") && (item.name || "").includes("金"));
    if (dragons.length < required) {
        toast("需要 20 个「金·龙鳞佩」才能升级朱雀。");
        return;
    }
    let remaining = required;
    state.bag = (state.bag || []).filter(item => {
        if (remaining > 0 && (item.name || "").includes("龙鳞佩") && (item.name || "").includes("金")) {
            remaining -= 1;
            return false;
        }
        return true;
    });
    state.phoenixUpgradeLevel = 2;
    addScore(10000);
    state.bag.push({ name: "朱雀凌霄·进阶", rarity: "mount" });
    state.bag.push({ name: "朱雀·龙鳞匣", rarity: "gold" });
    saveState();
    renderCurrency();
    renderBag();
    renderLeaderboard();
    syncPhoenixAvatar();
    toast("朱雀已升级，风华值+10000。");
}

function upgradeGooseMount() {
    if (!state.hasGooseMount || (state.gooseUpgradeLevel || 0) >= GOOSE_MAX_LEVEL) return;
    const cost = 680;
    if ((state.coins || 0) < cost) {
        toast("灵玉不足，无法升级坐骑。");
        return;
    }
    state.coins -= cost;
    state.gooseUpgradeLevel = Math.min(GOOSE_MAX_LEVEL, (state.gooseUpgradeLevel || 1) + 1);
    const level = state.gooseUpgradeLevel;
    const rarity = level >= GOOSE_MAX_LEVEL ? "purple" : "mount";
    const idx = (state.bag || []).findIndex(item => (item.name || "").startsWith("鹅"));
    const name = "鹅".repeat(level);
    if (idx >= 0) {
        state.bag[idx] = { ...state.bag[idx], name, rarity, category: "mount" };
    } else {
        state.bag.push({ name, rarity, category: "mount" });
    }
    saveState();
    renderCurrency();
    renderBag();
    renderLeaderboard();
    toast("坐骑已升级。");
}

function renderRecharge() {
    const wrap = document.getElementById("mmo-recharge-cards");
    if (!wrap) return;
    wrap.innerHTML = "";
    RECHARGE_TIERS.forEach(price => {
        const card = document.createElement("div");
        card.className = "mmo-recharge-card";
        card.innerHTML = `
            <div class="recharge-amount">${price * 10} ${CURRENCY_NAME}</div>
            <div class="recharge-price">¥${price}</div>
        `;
        card.addEventListener("click", () => handleRecharge(price));
        wrap.appendChild(card);
    });
}

function handleRecharge(price) {
    const wallet = getState("phone.wallet") || { balance: 0, events: [] };
    const balance = wallet.balance ?? 0;
    if (balance < price) {
        toast("微信余额不足。");
        return;
    }
    const nextBalance = balance - price;
    const events = [{ type: "expense", amount: price, source: "充值武侠游戏", time: Date.now() }, ...(wallet.events || [])].slice(0, 20);
    updateState("phone.wallet", { ...wallet, balance: nextBalance, events, lastSource: "充值武侠游戏" });
    addCoins(price * 10);
    state.totalRechargeRMB = Math.max(0, (state.totalRechargeRMB || 0) + price);
    saveState();
    toast(`充值成功，获得 ${price * 10} ${CURRENCY_NAME}`);
    showPhoneFloatingAlert?.("充值武侠游戏");
}

function renderLeaderboard() {
    const list = document.getElementById("mmo-leader-list");
    const playerRank = document.getElementById("mmo-player-rank");
    const scoreEl = document.getElementById("mmo-score-rank");
    if (!list || !playerRank) return;
    const entries = [...(state.leaderboard || [])];
    entries.sort((a, b) => b.score - a.score);
    const player = { name: ensureLoginAvatar(), score: state.score || 0, hasPhoenixMount: state.hasPhoenixMount };
    let playerPosition = entries.findIndex(e => player.score >= e.score) + 1;
    list.innerHTML = "";
    entries.slice(0, 50).forEach((e, idx) => {
        const row = document.createElement("div");
        row.className = "mmo-rank-row";
        const gold = e.hasPhoenixMount;
        row.innerHTML = `<span class="rank-no">${idx + 1}</span><span class="rank-name ${gold ? "gold" : ""}">${e.name}${gold ? '<span class="rank-badge gold">◎</span>' : ""}</span><span class="rank-score">${e.score}</span>`;
        list.appendChild(row);
    });
    if (playerPosition === 0 || playerPosition > 50) {
        playerRank.textContent = `你的${HONOR_NAME}：${player.score}（未进入排名）`;
    } else {
        const badge = state.hasPhoenixMount ? " ◎" : "";
        playerRank.textContent = `你的排名：${playerPosition} 名 · ${HONOR_NAME} ${player.score}${badge}`;
    }
    if (scoreEl) scoreEl.textContent = `${HONOR_NAME}：${state.score || 0}`;
}

function toast(text) {
    const host = document.getElementById("mmo-page") || document.body;
    const useAbsolute = host !== document.body;
    const existing = host.querySelector("#mmo-toast");
    const container = existing || document.createElement("div");
    container.id = "mmo-toast";
    container.className = "mmo-toast";
    container.textContent = text;
    if (useAbsolute && host.style.position === "") {
        host.style.position = "relative";
    }
    container.style.position = useAbsolute ? "absolute" : "fixed";
    container.style.left = "50%";
    container.style.bottom = "20px";
    container.style.transform = "translate(-50%, 20px)";
    if (!existing) host.appendChild(container);
    container.classList.add("show");
    setTimeout(() => container.classList.remove("show"), 1600);
}

function paintParticles() {
    const canvas = document.getElementById("mmo-particles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const particles = Array.from({ length: 32 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 1 + Math.random() * 2,
        s: 0.0006 + Math.random() * 0.001
    }));
    const resize = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const tick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.y += p.s * canvas.height;
            if (p.y > 1) {
                p.y = 0;
                p.x = Math.random();
            }
            ctx.fillStyle = "rgba(200,255,200,0.6)";
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        requestAnimationFrame(tick);
    };
    tick();
}
