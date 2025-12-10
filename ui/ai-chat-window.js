export function initAIChatWindow(options = {}) {
    const storyLog = document.getElementById("story-log");
    const storyInput = document.getElementById("story-input");
    const storySend = document.getElementById("story-send");
    const collapseBtn = document.getElementById("input-collapse-btn");
    const toolsBtn = document.getElementById("story-tools-btn");
    const toolsMenu = document.getElementById("story-tools-menu");
    const systemBtn = document.getElementById("story-tool-system");
    const restartBtn = document.getElementById("story-tool-restart");
    const restartSheet = document.getElementById("restart-sheet");
    const restartButtons = restartSheet?.querySelectorAll("[data-restart]");
    const memorySlider = document.getElementById("long-memory-slider");
    const memoryValue = document.getElementById("long-memory-value");
    const providerSelect = document.getElementById("ai-provider-select");

    if (!storyLog || !storyInput || !storySend) {
        throw new Error("AI chat window elements missing");
    }

    let systemMode = false;
    let continueBtn = null;
    let contextMenu = null;
    let latestSystemId = null;

    function limitTwoLines() {
        storyInput.classList.remove("expanded");
        collapseBtn?.classList.add("hidden");
        storyInput.style.height = "auto";
        const lineHeight = parseFloat(getComputedStyle(storyInput).lineHeight);
        const twoLineHeight = lineHeight * 2 + 10;
        storyInput.style.height = `${twoLineHeight}px`;
    }

    function autoGrowInput() {
        storyInput.style.height = "auto";
        const lineHeight = parseFloat(getComputedStyle(storyInput).lineHeight);
        const twoLineHeight = lineHeight * 2 + 10;
        const scrollH = storyInput.scrollHeight;
        const max = window.innerHeight * 0.7;
        if (scrollH <= twoLineHeight + 4) {
            limitTwoLines();
            return;
        }
        storyInput.classList.add("expanded");
        if (scrollH < max) {
            storyInput.style.height = `${scrollH}px`;
        } else {
            storyInput.style.height = `${max}px`;
        }
        collapseBtn?.classList.remove("hidden");
    }

    function appendBubble(entry) {
        if (!storyLog || !entry) return null;
        const role = entry.role || "system";
        const bubble = document.createElement("div");
        bubble.className = `story-bubble ${role}`;
        bubble.textContent = entry.text || "";
        bubble.dataset.role = role;
        if (entry.id) {
            bubble.dataset.message = entry.id;
        }
        if (entry.snapshotId) {
            bubble.dataset.snapshot = entry.snapshotId;
        }
        bubble.__storyEntry = entry;
        attachBubbleMenu(bubble, entry);
        storyLog.appendChild(bubble);
        storyLog.scrollTop = storyLog.scrollHeight;
        if (continueBtn) {
            continueBtn.remove();
            continueBtn = null;
        }
        if (role === "system") {
            latestSystemId = entry.id || latestSystemId;
            continueBtn = document.createElement("button");
            continueBtn.className = "continue-btn";
            continueBtn.textContent = "继续说";
            continueBtn.addEventListener("click", () => {
                const handler = options.onContinue;
                continueBtn?.remove();
                continueBtn = null;
                handler?.();
            }, { once: true });
            bubble.insertAdjacentElement("afterend", continueBtn);
        }
        return bubble;
    }

    function attachBubbleMenu(bubble, entry) {
        bubble.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            openBubbleMenu(event, entry);
        });
    }

    function openBubbleMenu(event, entry) {
        const actions = resolveBubbleActions(entry);
        if (!actions.length) return;
        if (!contextMenu) {
            contextMenu = document.createElement("div");
            contextMenu.id = "story-context-menu";
            document.body.appendChild(contextMenu);
        }
        contextMenu.innerHTML = "";
        const panel = document.createElement("div");
        panel.className = "context-panel";
        actions.forEach(action => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = action.label;
            btn.addEventListener("click", () => {
                options.onBubbleAction?.(action.id, entry);
                closeBubbleMenu();
            });
            panel.appendChild(btn);
        });
        contextMenu.appendChild(panel);
        const rect = panel.getBoundingClientRect();
        const maxX = Math.max(12, window.innerWidth - rect.width - 12);
        const maxY = Math.max(12, window.innerHeight - rect.height - 12);
        const offsetX = Math.min(Math.max(12, event.clientX), maxX);
        const offsetY = Math.min(Math.max(12, event.clientY), maxY);
        panel.style.left = `${offsetX}px`;
        panel.style.top = `${offsetY}px`;
        contextMenu.classList.add("show");
        const closeHandler = (e) => {
            if (contextMenu && !panel.contains(e.target)) {
                closeBubbleMenu();
            }
        };
        contextMenu._closeHandler = closeHandler;
        document.addEventListener("mousedown", closeHandler, { once: true });
        contextMenu.addEventListener("mousedown", (evt) => {
            if (!panel.contains(evt.target)) {
                closeBubbleMenu();
            }
        }, { once: true });
    }

    function closeBubbleMenu() {
        if (!contextMenu) return;
        contextMenu.classList.remove("show");
        contextMenu.innerHTML = "";
        if (contextMenu._closeHandler) {
            document.removeEventListener("mousedown", contextMenu._closeHandler);
            contextMenu._closeHandler = null;
        }
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeBubbleMenu();
        }
    });

    function resolveBubbleActions(entry = {}) {
        const items = [];
        if (entry.snapshotId) {
            items.push({ id: "rewind", label: "回溯到此刻" });
        }
        if (entry.role === "system" && entry.id && entry.id === latestSystemId) {
            items.push({ id: "retry", label: "重说这一句" });
        }
        return items;
    }

    function setBubbleSnapshot(node, snapshotId) {
        if (!node || !snapshotId) return;
        node.dataset.snapshot = snapshotId;
        if (node.__storyEntry) {
            node.__storyEntry.snapshotId = snapshotId;
        }
    }

    function handleSubmit() {
        const value = storyInput.value.trim();
        if (!value) return;
        storyInput.value = "";
        limitTwoLines();
        if (systemMode) {
            options.onSystemSubmit?.(value);
            toggleSystemMode(false);
        } else if (typeof options.onSubmit === "function") {
            options.onSubmit(value);
        }
    }

    function toggleSystemMode(forceValue) {
        systemMode = typeof forceValue === "boolean" ? forceValue : !systemMode;
        storyInput.classList.toggle("system-mode", systemMode);
        storyInput.placeholder = systemMode
            ? "System Prompt · persona/world/rules/dynamic"
            : "在这里输入给元书的话…";
        systemBtn?.classList.toggle("active", systemMode);
        options.onSystemModeChange?.(systemMode);
    }

    function toggleToolsMenu(forceValue) {
        const targetState = typeof forceValue === "boolean"
            ? forceValue
            : !toolsMenu?.classList.contains("show");
        toolsMenu?.classList.toggle("show", targetState);
        toolsBtn?.classList.toggle("active", targetState);
    }

    function openRestartSheet() {
        restartSheet?.classList.add("show");
        restartSheet?.setAttribute("aria-hidden", "false");
    }

    function closeRestartSheet() {
        restartSheet?.classList.remove("show");
        restartSheet?.setAttribute("aria-hidden", "true");
    }

    storyInput.addEventListener("input", autoGrowInput);
    if (collapseBtn) {
        collapseBtn.addEventListener("click", () => {
            limitTwoLines();
        });
    }
    storySend.addEventListener("click", handleSubmit);
    storyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    toolsBtn?.addEventListener("click", () => {
        toggleToolsMenu();
    });

    systemBtn?.addEventListener("click", () => {
        toggleSystemMode();
        toggleToolsMenu(false);
    });

    restartBtn?.addEventListener("click", () => {
        toggleToolsMenu(false);
        openRestartSheet();
    });

    restartButtons?.forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.dataset.restart;
            closeRestartSheet();
            if (mode && mode !== "cancel") {
                options.onRestart?.(mode);
            }
        });
    });

    document.addEventListener("click", (event) => {
        if (!toolsBtn || !toolsMenu) return;
        if (!toolsBtn.contains(event.target) && !toolsMenu.contains(event.target)) {
            toggleToolsMenu(false);
        }
    });

    restartSheet?.addEventListener("click", (event) => {
        if (event.target === restartSheet) {
            closeRestartSheet();
        }
    });

    function initMemorySliderControl() {
        if (!memorySlider || !memoryValue) return;
        const startValue = Number(options.longMemoryLimit) || Number(memorySlider.value) || 3;
        memorySlider.value = startValue;
        memoryValue.textContent = startValue;
        memorySlider.addEventListener("input", () => {
            const current = Number(memorySlider.value);
            memoryValue.textContent = current;
            options.onLongMemoryChange?.(current);
        });
    }

    function initProviderControl() {
        if (!providerSelect) return;
        const providers = options.providerOptions || [];
        providerSelect.innerHTML = "";
        providers.forEach(provider => {
            const opt = document.createElement("option");
            opt.value = provider.id;
            opt.textContent = provider.label;
            providerSelect.appendChild(opt);
        });
        const initial = options.currentProvider || providers[0]?.id;
        if (initial) providerSelect.value = initial;
        providerSelect.addEventListener("change", () => {
            options.onProviderChange?.(providerSelect.value);
        });
    }

    function scrollToSnapshot(snapshotId) {
        if (!snapshotId || !storyLog) return;
        const bubble = storyLog.querySelector(`[data-snapshot="${snapshotId}"]`);
        if (bubble) {
            bubble.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    function showToast(text) {
        if (!text) return;
        let toast = document.createElement("div");
        toast.className = "story-toast";
        toast.textContent = text;
        storyPanel().appendChild(toast);
        setTimeout(() => toast.remove(), 2600);
    }

    function storyPanel() {
        return document.getElementById("story-panel") || document.body;
    }

    function refreshLatestSystem(entries = []) {
        const lastSystem = [...entries].reverse().find(item => item.role === "system");
        latestSystemId = lastSystem?.id || null;
    }

    initProviderControl();
    initMemorySliderControl();
    limitTwoLines();

    return {
        appendBubble,
        focusInput: () => storyInput.focus(),
        resetInput: limitTwoLines,
        replaceHistory(entries = []) {
            storyLog.innerHTML = "";
            continueBtn = null;
            closeBubbleMenu();
            latestSystemId = null;
            entries.forEach(entry => appendBubble(entry));
            refreshLatestSystem(entries);
        },
        exitSystemMode: () => toggleSystemMode(false),
        setBubbleSnapshot: setBubbleSnapshot,
        scrollToSnapshot,
        showTimelineToast: showToast
    };
}
