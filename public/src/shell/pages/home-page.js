import { getState, updateState } from "../state.js";
import { navigateTo } from "./nav.js";
import { saveToast } from "../../core/save-feedback.js";

const GENDER_OPTIONS = ["男", "女", "双性", "无性别", "ABO"];

export function renderHome(root) {
    root.innerHTML = "";
    root.className = "home-page";
    const state = getState();
    const coverCache = loadCoverCache();
    const topbar = document.createElement("div");
    topbar.className = "home-topbar";
    const playerName = state.user.name || "玩家";
    topbar.innerHTML = `
        <div class="home-topbar-left">
            <p class="home-kicker">首页</p>
            <h2>${playerName}</h2>
            <p class="home-topbar-status">${renderGlobalStatus(state.user)}</p>
        </div>
    `;
    const hero = document.createElement("section");
    hero.className = "home-hero";
    hero.innerHTML = `
        <div>
            <p class="home-kicker">欢迎回来</p>
            <div class="home-title-row">
                <h1>开启今天的对话</h1>
            </div>
            <p class="home-sub">瀑布流画廊已就绪，直接为角色上传封面并扫一眼简介。</p>
        </div>
    `;
    const globalBar = document.createElement("div");
    globalBar.className = "home-global-bar";
    globalBar.innerHTML = `
        <div class="home-global-text">${renderGlobalStatus(state.user)}</div>
        <div class="home-global-actions">
            <button class="ghost ghost-compact" data-act="user-profile">人设</button>
            <button class="ghost ghost-compact" data-act="user-rules">规则</button>
        </div>
    `;
    const gallery = document.createElement("section");
    gallery.className = "home-gallery";
    gallery.innerHTML = `
        <div class="home-gallery-head">
            <div>
                <p class="home-kicker">角色画廊</p>
                <h2>瀑布流卡片</h2>
            </div>
            <button class="ghost" data-act="roles">管理</button>
        </div>
        <div class="home-masonry">
            ${buildGalleryItems(state.roles).map((role, idx) => renderGalleryCard(role, idx, coverCache)).join("")}
        </div>
    `;
    const stars = document.createElement("div");
    stars.className = "home-stars pixel-stars";
    addPixelStars(stars, 8);
    root.appendChild(stars);
    const editor = buildRuleDrawer(state.user);
    root.appendChild(topbar);
    root.appendChild(hero);
    root.appendChild(globalBar);
    root.appendChild(editor);
    root.appendChild(gallery);
    addHoverFeedback(root);

    let drawerOpen = false;
    const openEditor = (field) => {
        if (!editor) return;
        drawerOpen = true;
        editor.classList.add("show");
        const target = field ? editor.querySelector(`[data-field='${field}']`) : null;
        if (target) target.focus({ preventScroll: false });
        const y = editor.getBoundingClientRect().top + window.scrollY - 40;
        window.scrollTo({ top: y, behavior: "smooth" });
    };
    const toggleEditor = (field) => {
        if (drawerOpen) {
            editor.classList.remove("show");
            drawerOpen = false;
            return;
        }
        openEditor(field);
    };
    const bindRuleBtns = (scope) => {
        scope.querySelector("[data-act='user-rules']")?.addEventListener("click", (e) => {
            e.preventDefault();
            toggleEditor("rules");
        });
        scope.querySelector("[data-act='user-profile']")?.addEventListener("click", (e) => {
            e.preventDefault();
            toggleEditor("profile");
        });
    };
    bindRuleBtns(hero);
    bindRuleBtns(globalBar);
    gallery.querySelector("[data-act='roles']")?.addEventListener("click", () => navigateTo("#/roles"));
    bindCoverUploads(gallery, coverCache);
    return { unmount() {} };
}

function renderGlobalStatus(user) {
    const rule = user.globalRules;
    const profile = user.globalProfile;
    if (rule && profile) return "已设置全局规则和人设";
    if (rule) return "全局规则已设置";
    if (profile) return "全局人设已设置";
    return "点规则 / 人设 补充全局设定";
}

function buildRuleDrawer(user = {}) {
    const genderValue = (user.gender || "男").toLowerCase();
    const height = user.height || "";
    const wrap = document.createElement("div");
    wrap.className = "home-rule-drawer";
    wrap.innerHTML = `
        <div class="home-rule-inner">
            <div class="home-rule-head">
                <div>
                    <p class="home-kicker">全局设定</p>
                    <h3>规则</h3>
                </div>
                <div class="home-rule-actions">
                    <button class="primary" data-act="save">保存</button>
                </div>
            </div>
            <p class="home-dialog-note">这里的玩家人设与规则会在新窗口内默认载入，保持与角色卡一致的性别选项与身高。</p>
            <label class="home-dialog-label">玩家名称 <span class="required">*</span>
                <input type="text" data-field="name" placeholder="玩家名称" value="${user.name || ""}">
            </label>
            <label class="home-dialog-label">玩家性别
                <select data-field="gender" class="pill-select">
                    ${GENDER_OPTIONS.map(option => {
                        const val = option.toLowerCase();
                        const label = option === "ABO" ? "ABO" : option;
                        const selected = genderValue === val ? "selected" : "";
                        return `<option value="${label}" ${selected}>${label}</option>`;
                    }).join("")}
                </select>
            </label>
            <label class="home-dialog-label">身高
                <input type="text" data-field="height" placeholder="180 cm / 5'11\\\"（可留空）" value="${height}">
            </label>
            <label class="home-dialog-label">玩家人设
                <textarea rows="4" data-field="profile" placeholder="为自己写一个人设">${user.globalProfile || ""}</textarea>
            </label>
            <label class="home-dialog-label">全局规则
                <textarea rows="5" data-field="rules" placeholder="为所有聊天写一组基准规则">${user.globalRules || ""}</textarea>
            </label>
        </div>
    `;
    const close = () => {
        wrap.classList.remove("show");
    };
    wrap.querySelector("[data-act='save']")?.addEventListener("click", () => {
        const rules = wrap.querySelector("[data-field='rules']")?.value || "";
        const profile = wrap.querySelector("[data-field='profile']")?.value || "";
        const name = (wrap.querySelector("[data-field='name']")?.value || "").trim() || "玩家";
        const gender = (wrap.querySelector("[data-field='gender']")?.value || "男").trim();
        const playerHeight = wrap.querySelector("[data-field='height']")?.value || "";
        const current = getState();
        updateState({ user: { ...current.user, name, gender, height: playerHeight, globalRules: rules, globalProfile: profile } });
        const status = document.querySelector(".home-topbar-status");
        if (status) status.textContent = renderGlobalStatus({ globalRules: rules, globalProfile: profile });
        const title = document.querySelector(".home-topbar h2");
        if (title) title.textContent = name || current.user.name || "玩家";
        if (typeof console !== "undefined" && console.debug) {
            console.debug("[Shell] saved global user profile", { name, gender, height: playerHeight, hasRules: Boolean(rules), hasProfile: Boolean(profile) });
        }
        saveToast(true, "全局设定已保存");
        close();
    });
    return wrap;
}

const COVER_CACHE_KEY = "yuan-shell:gallery-covers";

function buildGalleryItems(roles = []) {
    const items = Array.isArray(roles) ? [...roles] : [];
    const placeholderNotes = [
        "上传一张图片并写一段简介，替换这个占位卡。",
        "用本地封面和一句介绍，记录一个新的角色。",
        "空位留给灵感：封面 + 人设片段即可。",
        "放入一个临时 NPC 或备用人格，封面随手选就行。"
    ];
    const placeholdersNeeded = Math.max(8 - items.length, 0);
    for (let i = 0; i < placeholdersNeeded; i++) {
        items.push({
            id: `placeholder-${i}`,
            name: `占位卡 ${i + 1}`,
            bio: placeholderNotes[i % placeholderNotes.length],
            placeholder: true
        });
    }
    return items;
}

function renderGalleryCard(role, index, coverCache = {}) {
    const cover = role?.id ? coverCache[role.id] : "";
    const hasImage = !!cover;
    const preview = (role?.personaStyle || role?.publicProfile || role?.background || role?.persona || role?.bio || role?.worldview || role?.storyline || "点击上传封面，写下这个角色的气质。").slice(0, 80);
    const label = role?.placeholder ? `上传第 ${index + 1} 个占位卡封面` : `为 ${role?.name || "角色"} 上传封面`;
    const safeLabel = escapeAttr(label);
    return `
        <div class="home-card ui-panel" data-role-card="${role?.id || `placeholder-${index}`}">
            <header class="home-card-head ui-panel-header">
                <label class="home-card-upload" aria-label="${safeLabel}">
                    <input type="file" accept="image/*" data-upload="${role?.id || `placeholder-${index}`}">
                    <div class="upload-frame" data-cover-frame="${role?.id || `placeholder-${index}`}" data-has-image="${hasImage ? "1" : "0"}" ${hasImage ? `style="background-image:url('${cover}')"` : ""}>
                        <span class="upload-hint">${hasImage ? "更换封面" : "上传封面"}</span>
                    </div>
                </label>
            </header>
            <section class="home-card-body ui-panel-body">
                <div class="home-card-name-row">
                    <span class="home-card-name">${role?.name || `占位角色 ${index + 1}`}</span>
                    <span class="home-card-tag ${role?.placeholder ? "is-placeholder" : ""}">${role?.placeholder ? "占位" : "角色"}</span>
                </div>
                <p class="home-card-preview">${preview}</p>
            </section>
        </div>
    `;
}

function bindCoverUploads(root, coverCache) {
    root.querySelectorAll("input[data-upload]").forEach(input => {
        input.addEventListener("change", (e) => {
            const file = e.target?.files?.[0];
            const targetId = input.dataset.upload;
            if (!file || !targetId) return;
            const reader = new FileReader();
            reader.onload = () => {
                const src = typeof reader.result === "string" ? reader.result : "";
                if (!src) return;
                coverCache[targetId] = src;
                saveCoverCache(coverCache);
                const frame = root.querySelector(`[data-cover-frame='${targetId}']`);
                applyCoverToFrame(frame, src);
            };
            reader.readAsDataURL(file);
            input.value = "";
        });
    });
}

function applyCoverToFrame(frame, src) {
    if (!frame) return;
    if (src) {
        frame.style.backgroundImage = `url('${src}')`;
        frame.dataset.hasImage = "1";
    } else {
        frame.style.backgroundImage = "";
        frame.dataset.hasImage = "0";
    }
    const hint = frame.querySelector(".upload-hint");
    if (hint) hint.textContent = src ? "更换封面" : "上传封面";
}

function loadCoverCache() {
    try {
        const raw = window.localStorage?.getItem(COVER_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch {
        return {};
    }
}

function saveCoverCache(cache = {}) {
    try {
        window.localStorage?.setItem(COVER_CACHE_KEY, JSON.stringify(cache));
    } catch {
        /* ignore */
    }
}

function escapeAttr(str = "") {
    return String(str).replace(/"/g, "&quot;");
}

function addHoverFeedback(root) {
    const selector = ".home-card, .home-card .upload-frame, .role-card, .msg-card, .settings-card";
    root.querySelectorAll(selector).forEach(el => {
        el.addEventListener("pointerdown", () => el.classList.add("pressed"));
        const clear = () => el.classList.remove("pressed");
        el.addEventListener("pointerup", clear);
        el.addEventListener("pointerleave", clear);
    });
}

function addPixelStars(container, count = 5) {
    if (!container) return;
    container.innerHTML = "";
    container.setAttribute("aria-hidden", "true");
    for (let i = 0; i < count; i++) {
        const star = document.createElement("span");
        randomizeStar(star, true);
        container.appendChild(star);
        scheduleStarMove(star);
    }
}

function randomizeStar(star, initial = false) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const scale = 0.7 + Math.random() * 1.1;
    const driftX = (Math.random() - 0.5) * 14;
    const driftY = -8 - Math.random() * 8;
    star.style.left = `${x}%`;
    star.style.top = `${y}%`;
    star.style.setProperty("--star-scale", scale.toFixed(2));
    star.style.setProperty("--drift-x", `${driftX.toFixed(1)}px`);
    star.style.setProperty("--drift-y", `${driftY.toFixed(1)}px`);
    star.style.animationDelay = `${Math.random() * 1.6}s`;
    if (initial) {
        star.style.transition = "none";
        requestAnimationFrame(() => star.style.transition = "");
    }
}

function scheduleStarMove(star) {
    const delay = 1200 + Math.random() * 2400;
    setTimeout(() => {
        randomizeStar(star);
        scheduleStarMove(star);
    }, delay);
}
