import { unlock, getState } from "../state.js";
import { navigateTo } from "./nav.js";

export function renderUnlock(root) {
    root.innerHTML = "";
    root.className = "unlock-page";
    const state = getState();
    const gate = document.createElement("div");
    gate.className = "unlock-gate";
    gate.innerHTML = `
        <div class="unlock-anim">
            <div class="scan-lines"></div>
            <div class="glow-bar"></div>
            <div class="pixel-stars">
                <span></span><span></span><span></span>
            </div>
        </div>
        <div class="unlock-content">
            <p class="unlock-kicker">Login · ${state.user?.name || "USER"}</p>
            <h1>解锁世界</h1>
            <p class="unlock-sub">输入口令 0715，开启故事与终端。动画播放完毕后可输入。</p>
            <form class="unlock-form">
                <input type="password" placeholder="输入 0715" autocomplete="off" inputmode="numeric" />
                <div class="unlock-actions">
                    <button type="submit" class="primary">解锁</button>
                    <button type="button" class="ghost" data-skip>跳过动画</button>
                </div>
                <div class="unlock-hint" aria-live="polite"></div>
            </form>
        </div>
    `;
    root.appendChild(gate);

    const form = gate.querySelector("form");
    const input = gate.querySelector("input");
    const hint = gate.querySelector(".unlock-hint");
    const skipBtn = gate.querySelector("[data-skip]");

    let ready = false;
    const finishAnim = () => {
        if (gate.classList.contains("ready")) return;
        gate.classList.add("ready");
        ready = true;
        input?.focus();
    };
    setTimeout(finishAnim, 900);

    skipBtn?.addEventListener("click", () => finishAnim());

    form?.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (!ready) {
            hint.textContent = "等待动画完成…";
            return;
        }
        const val = input?.value?.trim();
        if (val !== "0715") {
            hint.textContent = "口令不正确";
            return;
        }
        unlock();
        hint.textContent = "解锁成功";
        setTimeout(() => navigateTo("#/home"), 220);
    });

    return { unmount() {} };
}
