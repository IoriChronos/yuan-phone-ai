import { unlock, getState, updateState } from "../state.js";
import { navigateTo } from "./nav.js";

const LOGIN_USER_KEY = "yuan-shell:login-user";
const LOGIN_PWD_KEY = "yuan-shell:login-pass";
const LOGIN_REMEMBER_KEY = "yuan-shell:login-remember";

export function renderUnlock(root) {
    root.innerHTML = "";
    root.className = "unlock-page";
    const state = getState();
    const saved = loadLoginPrefs();
    const gate = document.createElement("div");
    gate.className = "unlock-gate";
    gate.innerHTML = `
        <div class="unlock-anim">
            <div class="scan-lines"></div>
            <div class="glow-bar"></div>
            <div class="pixel-stars"></div>
        </div>
        <div class="unlock-content">
            <p class="unlock-kicker">LOGIN</p>
            <h1>解锁世界</h1>
            <p class="unlock-sub">完成扫描后输入口令，开启故事与终端。</p>
            <form class="unlock-form">
                <input type="text" placeholder="用户名" autocomplete="username" maxlength="7" inputmode="text" value="${saved.user || ""}" data-field="user" />
                <input type="password" placeholder="输入口令" autocomplete="current-password" value="${saved.remember ? saved.password : ""}" data-field="pass" />
                <label class="unlock-remember">
                    <input type="checkbox" data-field="remember" ${saved.remember ? "checked" : ""} />
                    <span class="remember-text">记住密码</span>
                </label>
                <div class="unlock-actions">
                    <button type="submit" class="primary">解锁</button>
                    <button type="button" class="ghost" data-reset>清除记忆</button>
                </div>
                <div class="unlock-hint" aria-live="polite"></div>
            </form>
        </div>
    `;
    root.appendChild(gate);
    scatterPixelStars(gate.querySelector(".pixel-stars"), 6);

    const form = gate.querySelector("form");
    const inputUser = gate.querySelector("[data-field='user']");
    const inputPass = gate.querySelector("[data-field='pass']");
    const inputRemember = gate.querySelector("[data-field='remember']");
    const hint = gate.querySelector(".unlock-hint");
    const resetBtn = gate.querySelector("[data-reset]");

    let ready = false;
    const finishAnim = () => {
        if (gate.classList.contains("ready")) return;
        gate.classList.add("ready");
        ready = true;
        inputPass?.focus();
    };
    setTimeout(finishAnim, 900);

    resetBtn?.addEventListener("click", () => {
        clearSavedLogin();
        if (inputUser) inputUser.value = "";
        if (inputPass) inputPass.value = "";
        if (inputRemember) inputRemember.checked = false;
        hint.textContent = "登录缓存已清除";
        finishAnim();
    });

    form?.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (!ready) {
            hint.textContent = "等待动画完成…";
            return;
        }
        const val = inputPass?.value?.trim();
        if (val !== "0000") {
            hint.textContent = "口令不正确";
            return;
        }
        const loginNameRaw = (inputUser?.value?.trim() || "");
        const nameLength = Array.from(loginNameRaw).length;
        if (nameLength > 7) {
            hint.textContent = "用户名最多 7 个字";
            return;
        }
        const validName = /^[A-Za-z\u4e00-\u9fa5]+$/.test(loginNameRaw || "");
        if (loginNameRaw && !validName) {
            hint.textContent = "用户名仅限英文或汉字";
            return;
        }
        const loginName = loginNameRaw || "玩家";
        saveLoginPrefs({
            user: loginName,
            password: val,
            remember: !!inputRemember?.checked
        });
        updateState({ user: { ...state.user, name: loginName } });
        unlock();
        hint.textContent = "解锁成功";
        setTimeout(() => navigateTo("#/home"), 220);
    });

    return { unmount() {} };
}

export function clearSavedLogin() {
    try {
        window.localStorage?.removeItem(LOGIN_USER_KEY);
        window.localStorage?.removeItem(LOGIN_PWD_KEY);
        window.localStorage?.removeItem(LOGIN_REMEMBER_KEY);
    } catch {
        /* ignore */
    }
}

function loadLoginPrefs() {
    try {
        const remember = window.localStorage?.getItem(LOGIN_REMEMBER_KEY) === "1";
        const user = window.localStorage?.getItem(LOGIN_USER_KEY) || "";
        const password = remember ? (window.localStorage?.getItem(LOGIN_PWD_KEY) || "") : "";
        return { user, password, remember };
    } catch {
        return { user: "", password: "", remember: false };
    }
}

function saveLoginPrefs({ user = "", password = "", remember = false } = {}) {
    try {
        window.localStorage?.setItem(LOGIN_USER_KEY, user);
        if (remember) {
            window.localStorage?.setItem(LOGIN_PWD_KEY, password);
            window.localStorage?.setItem(LOGIN_REMEMBER_KEY, "1");
        } else {
            window.localStorage?.removeItem(LOGIN_PWD_KEY);
            window.localStorage?.setItem(LOGIN_REMEMBER_KEY, "0");
        }
    } catch {
        /* ignore */
    }
}

function scatterPixelStars(container, count = 5) {
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const star = document.createElement("span");
        randomizeStar(star, true);
        container.appendChild(star);
        scheduleStarMove(star);
    }
}

function randomizeStar(el, initial = false) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const scale = 0.7 + Math.random() * 1.1;
    const driftX = (Math.random() - 0.5) * 14;
    const driftY = -8 - Math.random() * 8;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty("--star-scale", scale.toFixed(2));
    el.style.setProperty("--drift-x", `${driftX.toFixed(1)}px`);
    el.style.setProperty("--drift-y", `${driftY.toFixed(1)}px`);
    el.style.animationDelay = `${Math.random() * 1.6}s`;
    if (initial) {
        el.style.transition = "none";
        requestAnimationFrame(() => el.style.transition = "");
    }
}

function scheduleStarMove(star) {
    const delay = 1200 + Math.random() * 2400;
    setTimeout(() => {
        randomizeStar(star);
        scheduleStarMove(star);
    }, delay);
}
