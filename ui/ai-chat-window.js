import { renderStoryBubble, initRendererFx, computeBubbleSpacing } from "./bubble-renderer.js";

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
    const fontSlider = document.getElementById("story-font-slider");
    const fontValue = document.getElementById("story-font-value");
    const providerSelect = document.getElementById("ai-provider-select");
    const editSheet = document.getElementById("story-edit-sheet");
    const editInput = document.getElementById("story-edit-input");
    const editSaveBtn = document.getElementById("story-edit-save");
    const editCancelBtn = document.getElementById("story-edit-cancel");
    const storyPanelEl = document.getElementById("story-panel");
    const storySubtitle = document.querySelector(".story-subtitle");
    const characterSheet = document.getElementById("character-sheet");
    const characterCloseBtn = document.getElementById("character-sheet-close");

    if (!storyLog || !storyInput || !storySend) {
        throw new Error("AI chat window elements missing");
    }

    let systemMode = false;
    let continueBtn = null;
    let contextMenu = null;
    let latestSystemId = null;
    let lastBubbleFxHandle = null;
    let editingEntry = null;
    const sceneFX = initRendererFx();
    const aiGroupState = {
        armed: false,
        started: false,
        lastBubble: null,
        startDivider: null
    };
    let lastBubbleType = null;
    let lastBubbleNode = null;

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
        const rendered = renderStoryBubble(entry, {
            sceneFX,
            lastFxHandle: lastBubbleFxHandle
        });
        if (!rendered || !rendered.bubble) {
            if (rendered?.handledFx) {
                return null;
            }
        }
        const bubble = rendered?.bubble;
        if (!bubble) return null;
        bubble.dataset.role = role;
        if (entry.id) {
            bubble.dataset.message = entry.id;
        }
        if (entry.snapshotId) {
            bubble.dataset.snapshot = entry.snapshotId;
        }
        bubble.__storyEntry = entry;
        applyBubbleSpacing(bubble, rendered?.meta);
        attachBubbleMenu(bubble, entry);
        if (role === "system") {
            ensureAiGroupStart();
        } else if (aiGroupState.started && aiGroupState.armed) {
            endAiReplyGroup();
        }
        storyLog.appendChild(bubble);
        if (role === "system" && aiGroupState.armed) {
            aiGroupState.lastBubble = bubble;
        }
        scrollToBottom();
        if (continueBtn) {
            continueBtn.remove();
            continueBtn = null;
        }
        if (role === "system" && isLastSystemSegment(entry)) {
            latestSystemId = entry.id || latestSystemId;
            continueBtn = document.createElement("button");
            continueBtn.className = "continue-btn align-left";
            continueBtn.textContent = "继续说";
            continueBtn.addEventListener("click", () => {
                const handler = options.onContinue;
                continueBtn?.remove();
                continueBtn = null;
                handler?.();
            }, { once: true });
            bubble.insertAdjacentElement("afterend", continueBtn);
            scrollToBottom();
        }
        lastBubbleFxHandle = rendered.fxHandle || lastBubbleFxHandle;
        return bubble;
    }

    function attachBubbleMenu(bubble, entry) {
        let pressTimer = null;
        let startX, startY;

        const startPress = (e) => {
            // Ignore right-clicks on touch devices
            if (e.pointerType === 'touch' && e.button === 2) {
                return;
            }
            startX = e.clientX;
            startY = e.clientY;
            pressTimer = setTimeout(() => {
                pressTimer = null;
                if (e.target.closest('a, button')) return;
                e.preventDefault();
                openBubbleMenu(e, entry);
            }, 550); 
        };

        const cancelPress = (e) => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const moveCheck = (e) => {
            if (pressTimer) {
                const moveX = Math.abs(e.clientX - startX);
                const moveY = Math.abs(e.clientY - startY);
                if (moveX > 10 || moveY > 10) {
                    cancelPress();
                }
            }
        };

        bubble.addEventListener("pointerdown", startPress);
        bubble.addEventListener("pointerup", cancelPress);
        bubble.addEventListener("pointerleave", cancelPress);
        bubble.addEventListener("pointermove", moveCheck);
        
        bubble.addEventListener("contextmenu", (event) => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
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
        contextMenu.className = ""; // Reset classes

        const panel = document.createElement("div");
        panel.className = "context-panel";
        actions.forEach(action => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = action.label;
            btn.addEventListener("click", () => {
                if (action.id === "edit") {
                    openEditDialog(entry);
                } else {
                    options.onBubbleAction?.(action.id, entry);
                }
                closeBubbleMenu();
            });
            panel.appendChild(btn);
        });
        contextMenu.appendChild(panel);

        const isMobile = window.innerWidth < 768;

        if (isMobile) {
            contextMenu.classList.add("mobile-sheet");
        } else {
            const rect = panel.getBoundingClientRect();
            const margin = 12;
            const clickX = event.clientX;
            const clickY = event.clientY;

            let offsetX = clickX;
            if (clickX + rect.width > window.innerWidth - margin) {
                offsetX = window.innerWidth - rect.width - margin;
            }

            let offsetY = clickY;
            if (clickY + rect.height > window.innerHeight - margin) {
                offsetY = window.innerHeight - rect.height - margin;
            }

            panel.style.left = `${Math.max(margin, offsetX)}px`;
            panel.style.top = `${Math.max(margin, offsetY)}px`;
        }
        
        contextMenu.classList.add("show");

        const closeHandler = (e) => {
            if (contextMenu && !panel.contains(e.target)) {
                closeBubbleMenu();
            }
        };
        contextMenu._closeHandler = closeHandler;
        
        // Use a short timeout to prevent the same click/tap from closing the menu immediately
        setTimeout(() => {
            document.addEventListener("mousedown", closeHandler);
            contextMenu.addEventListener("click", (evt) => {
                if (evt.target === contextMenu) {
                    closeBubbleMenu();
                }
            }, { once: true });
        }, 100);
    }

    function closeBubbleMenu() {
        if (!contextMenu || !contextMenu.classList.contains("show")) return;
        contextMenu.classList.remove("show");
        
        if (contextMenu._closeHandler) {
            document.removeEventListener("mousedown", contextMenu._closeHandler);
            contextMenu._closeHandler = null;
        }
        
        // Allow animations to finish before clearing content
        setTimeout(() => {
            if (!contextMenu.classList.contains("show")) {
                contextMenu.innerHTML = "";
                contextMenu.className = "";
            }
        }, 300);
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
        if (entry.role === "system") {
            items.push({ id: "edit", label: "编辑这一句" });
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

    storySubtitle?.addEventListener("dblclick", () => toggleCharacterPanel());
    characterCloseBtn?.addEventListener("click", () => toggleCharacterPanel(false));

    editCancelBtn?.addEventListener("click", closeEditDialog);
    editSaveBtn?.addEventListener("click", submitEditDialog);
    editSheet?.addEventListener("click", (event) => {
        if (event.target === editSheet) {
            closeEditDialog();
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeEditDialog();
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

    function initFontSliderControl() {
        if (!fontSlider || !fontValue) return;
        const updateFontSize = () => {
            const value = `${fontSlider.value}px`;
            document.documentElement.style.setProperty("--story-font-size", value);
            fontValue.textContent = value;
        };
        fontSlider.addEventListener("input", updateFontSize);
        updateFontSize();
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

    function scrollToBottom() {
        if (!storyLog) return;
        requestAnimationFrame(() => {
            storyLog.scrollTop = storyLog.scrollHeight;
        });
    }

    function resetAiGroupState() {
        aiGroupState.armed = false;
        aiGroupState.started = false;
        aiGroupState.lastBubble = null;
        if (aiGroupState.startDivider) {
            aiGroupState.startDivider.remove();
            aiGroupState.startDivider = null;
        }
    }

    function ensureAiGroupStart() {
        if (!aiGroupState.armed || aiGroupState.started || !storyLog) return;
        const divider = createDivider("start");
        storyLog.appendChild(divider);
        aiGroupState.started = true;
        aiGroupState.startDivider = divider;
    }

    function beginAiReplyGroup() {
        if (aiGroupState.armed) {
            endAiReplyGroup();
        }
        aiGroupState.armed = true;
        aiGroupState.started = false;
        aiGroupState.lastBubble = null;
        if (aiGroupState.startDivider) {
            aiGroupState.startDivider.remove();
            aiGroupState.startDivider = null;
        }
    }

    function endAiReplyGroup() {
        if (aiGroupState.armed && aiGroupState.started && aiGroupState.lastBubble) {
            const divider = createDivider("end");
            insertAfter(aiGroupState.lastBubble, divider);
        } else if (aiGroupState.startDivider) {
            aiGroupState.startDivider.remove();
        }
        aiGroupState.armed = false;
        aiGroupState.started = false;
        aiGroupState.lastBubble = null;
        aiGroupState.startDivider = null;
        scrollToBottom();
    }

    function insertAfter(reference, node) {
        if (!reference || !reference.parentNode || !node) return;
        if (reference.nextSibling) {
            reference.parentNode.insertBefore(node, reference.nextSibling);
        } else {
            reference.parentNode.appendChild(node);
        }
    }

    function createDivider(type) {
        const divider = document.createElement("div");
        divider.className = `story-reply-divider ${type}`;
        divider.innerHTML = `<span>${type === "start" ? "AI · 回复开始" : "AI · 回复结束"}</span>`;
        return divider;
    }

    function openEditDialog(entry) {
        if (!options.onEditMessage || !editSheet || !editInput) return;
        editingEntry = entry;
        editInput.value = entry?.text || "";
        editSheet.classList.add("show");
        editSheet.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => editInput.focus());
    }

    function closeEditDialog() {
        if (!editSheet) return;
        editSheet.classList.remove("show");
        editSheet.setAttribute("aria-hidden", "true");
        editingEntry = null;
        if (editSaveBtn) {
            editSaveBtn.disabled = false;
        }
    }

    function toggleCharacterPanel(forceValue) {
        if (!characterSheet) return;
        const nextState = typeof forceValue === "boolean"
            ? forceValue
            : !characterSheet.classList.contains("show");
        characterSheet.classList.toggle("show", nextState);
        characterSheet.setAttribute("aria-hidden", nextState ? "false" : "true");
    }

    async function submitEditDialog() {
        if (!editingEntry || !editInput) return;
        const content = editInput.value.trim();
        if (!content) return;
        if (editSaveBtn) {
            editSaveBtn.disabled = true;
        }
        let result = true;
        try {
            result = await options.onEditMessage?.(editingEntry, content);
        } catch (err) {
            console.error("edit apply failed", err);
            result = false;
        }
        if (editSaveBtn) {
            editSaveBtn.disabled = false;
        }
        if (result === false) return;
        closeEditDialog();
    }

    function updateBubble(entry) {
        if (!entry || !storyLog) return;
        const target = storyLog.querySelector(`[data-message="${entry.id}"]`);
        if (!target) return;
        const snapshotId = target.dataset.snapshot;
        const rendered = renderStoryBubble(entry, { sceneFX });
        if (!rendered?.bubble) return;
        const bubble = rendered.bubble;
        bubble.dataset.role = entry.role || "system";
        bubble.dataset.message = entry.id;
        if (snapshotId) {
            bubble.dataset.snapshot = snapshotId;
        }
        bubble.__storyEntry = entry;
        applyBubbleSpacing(bubble, rendered?.meta);
        attachBubbleMenu(bubble, entry);
        target.replaceWith(bubble);
        if (entry.role === "system" && aiGroupState.armed) {
            aiGroupState.lastBubble = bubble;
        }
    }

    function isLastSystemSegment(entry = {}) {
        const meta = entry.meta || {};
        if (typeof meta.segmentTotal !== "number" || meta.segmentTotal <= 1) return true;
        return meta.segmentIndex >= meta.segmentTotal - 1;
    }

    initProviderControl();
    initMemorySliderControl();
    initFontSliderControl();
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
            resetAiGroupState();
            lastBubbleType = null;
            lastBubbleNode = null;
            entries.forEach(entry => appendBubble(entry));
            refreshLatestSystem(entries);
            scrollToBottom();
        },
        exitSystemMode: () => toggleSystemMode(false),
        setBubbleSnapshot: setBubbleSnapshot,
        scrollToSnapshot,
        showTimelineToast: showToast,
        beginAiReplyGroup,
        endAiReplyGroup,
        updateBubble
    };

    function applyBubbleSpacing(node, meta = {}) {
        if (!node) return;
        const type = meta?.type || node.dataset.storyType || null;
        const variant = meta?.dialogueVariant || node.dataset.dialogueVariant || null;
        const spacing = computeBubbleSpacing(lastBubbleType, type, variant);
        if (spacing?.marginBottom != null && lastBubbleNode) {
            lastBubbleNode.style.marginBottom = `${spacing.marginBottom}px`;
        }
        if (spacing?.marginTop != null) {
            node.style.marginTop = `${spacing.marginTop}px`;
        }
        lastBubbleType = type;
        lastBubbleNode = node;
    }
}
