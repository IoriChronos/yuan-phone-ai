import { triggerIslandUnlock } from "./dynamic-island.js";

let body = null;
let homeScreen = null;
let appPages = [];
let appIcons = [];
let backButtons = [];
let homeBar = null;
let phoneLayer = null;
let toggleBtn = null;
let phoneToggleBubble = null;

let phoneVisible = false;
let dockSide = "right";
let phoneAlertTimer = null;
let phoneBubbleDelayTimer = null;
let optionsRef = {};

const APP_LABELS = {
    "wechat-page": "微信",
    "call-page": "电话",
    "darkfog-page": "黑雾",
    "watch-page": "守望",
    "memo-page": "备忘录",
    "heart-page": "心率",
    "settings-page": "设置",
    "shopping-page": "购物",
    "mmo-page": "武侠"
};
const ICON_ORDER_KEY = "homeIconOrder";

function setPhoneVisible(show) {
    phoneVisible = show;
    const modeIsMobile = body?.classList.contains("mobile-mode");
    if (!body) return;
    if (modeIsMobile) {
        if (show) {
            phoneLayer?.classList.add("show");
            body.classList.add("phone-open");
            triggerIslandUnlock();
            clearPhoneAlert();
        } else {
            phoneLayer?.classList.remove("show");
            body.classList.remove("phone-open");
        }
    } else {
        body.classList.toggle("phone-open", show);
        if (show) {
            triggerIslandUnlock();
            clearPhoneAlert();
        }
    }
    if (typeof optionsRef.onVisibilityChange === "function") {
        optionsRef.onVisibilityChange(phoneVisible);
    }
}

function togglePhone() {
    setPhoneVisible(!phoneVisible);
}

function recordAppOpen(id) {
    if (typeof optionsRef.onAppOpen === "function") {
        const label = APP_LABELS[id] || id;
        optionsRef.onAppOpen(id, label);
    }
}

function showHome() {
    if (!homeScreen) return;
    appPages.forEach(p => p.style.display = "none");
    homeScreen.style.display = "grid";
}

export function forcePhoneHome() {
    showHome();
    if (homeBar) {
        homeBar.style.display = "block";
    }
}

function openPage(id) {
    if (!homeScreen) {
        homeScreen = document.getElementById("home-screen");
    }
    if (!appPages || !appPages.length) {
        appPages = Array.from(document.querySelectorAll(".app-page"));
    }
    homeScreen.style.display = "none";
    let targetFound = false;
    appPages.forEach(page => {
        const isTarget = page.id === id;
        page.style.display = isTarget ? "flex" : "none";
        if (isTarget) targetFound = true;
    });
    if (!targetFound) {
        const page = document.getElementById(id);
        if (page) {
            appPages.push(page);
            page.style.display = "flex";
        }
    }
    const scroll = document.querySelector(`#${id} .app-scroll`);
    if (scroll) scroll.scrollTop = 0;
    recordAppOpen(id);
}

function clearPhoneAlert() {
    if (!toggleBtn) return;
    toggleBtn.classList.remove("notify");
    toggleBtn.classList.remove("special-alert");
    if (phoneToggleBubble) {
        phoneToggleBubble.classList.remove("show");
    }
    if (phoneBubbleDelayTimer) {
        clearTimeout(phoneBubbleDelayTimer);
        phoneBubbleDelayTimer = null;
    }
    if (phoneAlertTimer) {
        clearTimeout(phoneAlertTimer);
        phoneAlertTimer = null;
    }
}

function showPhoneAlert(message = "新消息", opts = {}) {
    const options = (opts && typeof opts === "object") ? opts : {};
    const { special = false, force = false } = options;
    if (!toggleBtn) return;
    const shouldShowBubble = force || !phoneVisible;
    toggleBtn.classList.add("notify");
    if (special) toggleBtn.classList.add("special-alert");
    else toggleBtn.classList.remove("special-alert");
    if (phoneToggleBubble) phoneToggleBubble.textContent = message;
    phoneToggleBubble?.classList.remove("show");
    if (phoneBubbleDelayTimer) clearTimeout(phoneBubbleDelayTimer);
    phoneBubbleDelayTimer = setTimeout(() => {
        if (shouldShowBubble) phoneToggleBubble?.classList.add("show");
        else phoneToggleBubble?.classList.remove("show");
    }, 720);
    if (phoneAlertTimer) clearTimeout(phoneAlertTimer);
    phoneAlertTimer = setTimeout(() => {
        clearPhoneAlert();
    }, special ? 4000 : 2600);
}

function attachToggleDrag() {
    if (!toggleBtn) return;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let btnStartLeft = 0;
    let btnStartTop = 0;
    let pressStartTime = 0;

    const startDrag = (clientX, clientY) => {
        dragging = false;
        pressStartTime = performance.now();
        const rect = toggleBtn.getBoundingClientRect();
        dragStartX = clientX;
        dragStartY = clientY;
        btnStartLeft = rect.left;
        btnStartTop = rect.top;
        toggleBtn.style.left = `${rect.left}px`;
        toggleBtn.style.top = `${rect.top}px`;
        toggleBtn.style.right = "auto";
        toggleBtn.style.bottom = "auto";

        const onMouseMove = (ev) => {
            const dx = ev.clientX - dragStartX;
            const dy = ev.clientY - dragStartY;
            const distance = Math.hypot(dx, dy);
            if (!dragging && distance > 4) {
                dragging = true;
            }
            if (!dragging) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;
            let newLeft = btnStartLeft + dx;
            let newTop = btnStartTop + dy;
            newLeft = Math.max(margin, Math.min(newLeft, vw - rect.width - margin));
            newTop = Math.max(margin, Math.min(newTop, vh - rect.height - margin));
            toggleBtn.style.left = `${newLeft}px`;
            toggleBtn.style.top = `${newTop}px`;
        };

        const onMouseUp = (ev) => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            const duration = performance.now() - pressStartTime;
            if (!dragging && duration < 250) {
                togglePhone();
            } else if (dragging) {
                const rectEnd = toggleBtn.getBoundingClientRect();
                const margin = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const centerX = rectEnd.left + rectEnd.width / 2;
                dockSide = centerX < vw / 2 ? "left" : "right";
                const finalLeft = dockSide === "left" ? margin : vw - rectEnd.width - margin;
                let finalTop = rectEnd.top;
                finalTop = Math.max(margin, Math.min(finalTop, vh - rectEnd.height - margin));
                toggleBtn.style.left = `${finalLeft}px`;
                toggleBtn.style.top = `${finalTop}px`;
            }
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    toggleBtn.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch") e.preventDefault();
        startDrag(e.clientX, e.clientY);
        toggleBtn.setPointerCapture(e.pointerId);
        const moveHandler = (ev) => document.dispatchEvent(new MouseEvent("mousemove", ev));
        const upHandler = (ev) => {
            document.removeEventListener("pointermove", moveHandler);
            document.removeEventListener("pointerup", upHandler);
            document.removeEventListener("pointercancel", upHandler);
            toggleBtn.releasePointerCapture(ev.pointerId);
            document.dispatchEvent(new MouseEvent("mouseup", ev));
        };
        document.addEventListener("pointermove", moveHandler, { passive: false });
        document.addEventListener("pointerup", upHandler);
        document.addEventListener("pointercancel", upHandler);
    }, { passive: false });
}

function repositionToggle() {
    if (!toggleBtn) return;
    const rect = toggleBtn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let top = rect.top;
    let left = dockSide === "left" ? margin : vw - rect.width - margin;
    top = Math.max(margin, Math.min(top, vh - rect.height - margin));
    toggleBtn.style.left = `${left}px`;
    toggleBtn.style.top = `${top}px`;
    toggleBtn.style.right = "auto";
    toggleBtn.style.bottom = "auto";
}

function updateLayoutMode() {
    if (!body) return;
    const vw = window.innerWidth;
    const PHONE_WIDTH = 380;
    const STORY_MIN = 480;
    const GAP = 80;
    if (vw >= PHONE_WIDTH + STORY_MIN + GAP) {
        body.classList.remove("mobile-mode");
        body.classList.add("pc-mode");
        phoneLayer?.classList.remove("show");
        if (phoneVisible === false) {
            setPhoneVisible(true);
        }
    } else {
        body.classList.add("mobile-mode");
        body.classList.remove("pc-mode");
        phoneLayer?.classList.remove("show");
        body.classList.remove("phone-open");
        phoneVisible = false;
    }
}

function attachIconDrag() {
    let dragSrc = null;
    appIcons.forEach(icon => {
        icon.setAttribute("draggable", "true");
        icon.addEventListener("dragstart", (e) => {
            dragSrc = icon;
            e.dataTransfer.effectAllowed = "move";
            icon.classList.add("dragging");
        });
        icon.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });
        icon.addEventListener("drop", () => {
            if (dragSrc && dragSrc !== icon) {
                const parent = icon.parentNode;
                parent.insertBefore(dragSrc, icon);
                persistAppOrder();
            }
        });
        icon.addEventListener("dragend", () => {
            icon.classList.remove("dragging");
            dragSrc = null;
        });
        icon.addEventListener("pointerdown", (e) => {
            if (e.pointerType !== "touch") return;
            icon.dataset.dragging = "false";
            icon.setPointerCapture?.(e.pointerId);
            icon.__dragStartX = e.clientX;
            icon.__dragStartY = e.clientY;
            icon.__pointerDragging = false;
        });
        icon.addEventListener("pointermove", (e) => {
            if (e.pointerType !== "touch") return;
            if (icon.__dragStartX == null) return;
            const dx = e.clientX - (icon.__dragStartX || 0);
            const dy = e.clientY - (icon.__dragStartY || 0);
            if (!icon.__pointerDragging && Math.hypot(dx, dy) > 8) {
                icon.__pointerDragging = true;
                icon.classList.add("dragging");
                icon.dataset.dragging = "true";
            }
            if (!icon.__pointerDragging) return;
            const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".app-icon");
            if (target && target !== icon && target.parentNode === homeScreen) {
                const rect = target.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                homeScreen.insertBefore(icon, before ? target : target.nextSibling);
            }
        }, { passive: false });
        const pointerEnd = (e) => {
            if (e.pointerType !== "touch") return;
            if (icon.__pointerDragging) {
                persistAppOrder();
                icon.classList.remove("dragging");
            }
            icon.dataset.dragging = "";
            icon.__pointerDragging = false;
            icon.__dragStartX = null;
            icon.__dragStartY = null;
            icon.releasePointerCapture?.(e.pointerId);
        };
        icon.addEventListener("pointerup", pointerEnd);
        icon.addEventListener("pointercancel", pointerEnd);
    });
}

function persistAppOrder() {
    if (!homeScreen) return;
    const order = Array.from(homeScreen.querySelectorAll(".app-icon"))
        .map(icon => icon.getAttribute("data-target"))
        .filter(Boolean);
    try {
        localStorage.setItem(ICON_ORDER_KEY, JSON.stringify(order));
    } catch (err) {
        console.error("persistAppOrder", err);
    }
    appIcons = Array.from(document.querySelectorAll(".app-icon"));
}

function loadAppOrder() {
    if (!homeScreen) return;
    try {
        const stored = localStorage.getItem(ICON_ORDER_KEY);
        if (!stored) return;
        const order = JSON.parse(stored);
        if (!Array.isArray(order)) return;
        const seen = new Set();
        order.forEach(target => {
            if (seen.has(target)) return;
            seen.add(target);
            const icon = homeScreen.querySelector(`.app-icon[data-target="${target}"]`);
            if (icon) {
                homeScreen.appendChild(icon);
            }
        });
    } catch (err) {
        console.error("loadAppOrder", err);
    }
}

export function initPhoneUI(options = {}) {
    optionsRef = options;
    body = document.body;
    homeScreen = document.getElementById("home-screen");
    loadAppOrder();
    appPages = Array.from(document.querySelectorAll(".app-page"));
    appIcons = Array.from(document.querySelectorAll(".app-icon"));
    backButtons = Array.from(document.querySelectorAll(".back-home"));
    homeBar = document.getElementById("home-bar");
    const barRoot = document.getElementById("phone-layer") || document.getElementById("phone") || document.body || document.documentElement;
    if (!homeBar) {
        homeBar = document.createElement("div");
        homeBar.id = "home-bar";
    }
    if (homeBar && homeBar.parentElement !== barRoot) {
        barRoot.appendChild(homeBar);
    }
    if (homeBar) {
        homeBar.style.display = "block";
        homeBar.style.zIndex = "30000";
        homeBar.style.position = "absolute";
        homeBar.style.pointerEvents = "auto";
    }
    phoneLayer = document.getElementById("phone-layer");
    toggleBtn = document.getElementById("phone-toggle");
    phoneToggleBubble = document.getElementById("phone-toggle-bubble");

    appIcons.forEach(icon => {
        icon.addEventListener("click", () => {
            if (icon.dataset.dragging === "true") {
                icon.dataset.dragging = "";
                return;
            }
            const target = icon.getAttribute("data-target");
            if (!target) return;
            icon.classList.add("launching");
            setTimeout(() => {
                openPage(target);
                icon.classList.remove("launching");
            }, 180);
        });
    });

    backButtons.forEach(btn => btn.addEventListener("click", showHome));

    if (homeBar) {
        homeBar.addEventListener("click", showHome);
        let hbStartY = null;
        let hbTriggered = false;
        homeBar.addEventListener("pointerdown", (e) => {
            hbStartY = e.clientY;
            hbTriggered = false;
        });
        homeBar.addEventListener("pointermove", (e) => {
            if (hbStartY == null || hbTriggered) return;
            if (hbStartY - e.clientY > 24) {
                hbTriggered = true;
                showHome();
            }
        });
        homeBar.addEventListener("pointerup", () => { hbStartY = null; });
        homeBar.addEventListener("pointercancel", () => { hbStartY = null; });
    }

    if (toggleBtn) attachToggleDrag();
    attachIconDrag();
    updateLayoutMode();
    repositionToggle();
    window.addEventListener("resize", () => {
        updateLayoutMode();
        repositionToggle();
    });

    return {
        openPage,
        showHome,
        togglePhone,
        isPhoneVisible: () => phoneVisible,
        showPhoneAlert,
        clearPhoneAlert,
        playFloatNotification: (msg) => showPhoneAlert(msg, { special: true })
    };
}

export function openPhonePage(id) {
    openPage(id);
}

export function showPhoneHome() {
    showHome();
}

export function isPhoneCurrentlyVisible() {
    return phoneVisible;
}

export function showPhoneFloatingAlert(message, opts) {
    showPhoneAlert(message, opts);
}

export function clearPhoneFloatingAlert() {
    clearPhoneAlert();
}

export function forcePhoneToHomeScreen() {
    forcePhoneHome();
}

export function playSpecialFloatNotification(message = "触发") {
    showPhoneAlert(message, { special: true });
}
