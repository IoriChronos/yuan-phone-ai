export const DEFAULT_ISLAND_LABEL = "···";

let dynamicIsland = null;
let dynamicIslandContent = null;
let dynamicIslandLabel = DEFAULT_ISLAND_LABEL;
let islandCallContainer = null;
let islandCallName = null;
let islandBubble = null;
let bubbleTimer = null;
let initialized = false;
let callActionHandler = null;

function ensureIslandElements() {
    if (initialized) return;
    dynamicIsland = document.getElementById("dynamic-island");
    if (dynamicIsland) {
        dynamicIslandContent = dynamicIsland.querySelector(".island-content");
        islandCallContainer = document.getElementById("island-call");
        islandCallName = document.getElementById("island-call-name");
        dynamicIsland.addEventListener("click", () => {
            dynamicIsland.classList.toggle("expanded");
        });
        document.querySelectorAll("[data-call-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.callAction;
                if (callActionHandler) callActionHandler(action);
            });
        });
        initialized = true;
    }
}

function ensureBubbleElement() {
    ensureIslandElements();
    if (!dynamicIsland || islandBubble) return;
    islandBubble = document.createElement("div");
    islandBubble.className = "island-bubble";
    dynamicIsland.appendChild(islandBubble);
}

export function initDynamicIsland(options = {}) {
    callActionHandler = options.onCallAction || null;
    ensureIslandElements();
    ensureBubbleElement();
    if (dynamicIslandContent && dynamicIslandContent.textContent) {
        dynamicIslandLabel = dynamicIslandContent.textContent;
    }
}

export function setIslandLabel(text) {
    ensureIslandElements();
    dynamicIslandLabel = text || DEFAULT_ISLAND_LABEL;
    if (dynamicIsland && dynamicIslandContent && !dynamicIsland.classList.contains("notify")) {
        dynamicIslandContent.textContent = dynamicIslandLabel;
    }
}

export function triggerIslandUnlock() {
    ensureIslandElements();
    if (!dynamicIsland) return;
    dynamicIsland.classList.add("unlocking");
    setTimeout(() => {
        dynamicIsland.classList.remove("unlocking");
        dynamicIsland.style.width = "";
        dynamicIsland.style.height = "";
        if (dynamicIslandContent) dynamicIslandContent.textContent = dynamicIslandLabel;
    }, 820);
}

export function triggerIslandNotify(msg) {
    ensureIslandElements();
    if (!dynamicIsland) return;
    if (dynamicIslandContent && msg) dynamicIslandContent.textContent = msg;
    dynamicIsland.classList.add("notify");
    setTimeout(() => {
        dynamicIsland.classList.remove("notify");
        if (dynamicIslandContent) dynamicIslandContent.textContent = dynamicIslandLabel;
    }, 1500);
}

export function showIslandCallAlert(name) {
    ensureIslandElements();
    if (!dynamicIsland || !islandCallContainer) return;
    if (islandCallName) islandCallName.textContent = name;
    dynamicIsland.classList.add("call-alert");
    islandCallContainer.setAttribute("aria-hidden", "false");
}

export function hideIslandCallAlert() {
    ensureIslandElements();
    if (!dynamicIsland || !islandCallContainer) return;
    dynamicIsland.classList.remove("call-alert");
    islandCallContainer.setAttribute("aria-hidden", "true");
}

export function playIslandMessage(label = "", bubbleText = "") {
    ensureBubbleElement();
    if (label) setIslandLabel(label);
    if (!dynamicIsland) return;
    dynamicIsland.classList.add("pop");
    setTimeout(() => dynamicIsland?.classList.remove("pop"), 900);
    if (islandBubble && bubbleText) {
        islandBubble.textContent = bubbleText;
        islandBubble.classList.add("show");
        if (bubbleTimer) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => {
            islandBubble?.classList.remove("show");
        }, 1600);
    }
}

export function collapseIslandAfterCall() {
    hideIslandCallAlert();
    setIslandLabel(DEFAULT_ISLAND_LABEL);
}
