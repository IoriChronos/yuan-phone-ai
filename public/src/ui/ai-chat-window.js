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
    const newWindowBtn = document.getElementById("story-tool-new-window");
    const restartSheet = document.getElementById("restart-sheet");
    const restartButtons = restartSheet?.querySelectorAll("[data-restart]");
    const memorySlider = document.getElementById("long-memory-slider");
    const memoryValue = document.getElementById("long-memory-value");
    const fontSlider = document.getElementById("story-font-slider");
    const fontValue = document.getElementById("story-font-value");
    const providerSelect = document.getElementById("narrator-model-select") || document.getElementById("ai-provider-select");
    const editSheet = document.getElementById("story-edit-sheet");
    const editInput = document.getElementById("story-edit-input");
    const editSaveBtn = document.getElementById("story-edit-save");
    const editCancelBtn = document.getElementById("story-edit-cancel");
    const storyPanelEl = document.getElementById("story-panel");
    const storySubtitle = document.querySelector(".story-subtitle");
    const characterSheet = document.getElementById("character-sheet");
    const characterCloseBtn = document.getElementById("character-sheet-close");
    const storyLayer = document.querySelector(".story-bubbles-layer");
    const storyInputRow = document.getElementById("story-input-row");

    if (!storyLog || !storyInput || !storySend) {
        console.warn("AI chat window elements missing, skipping initAIChatWindow");
        return {
            appendBubble: () => null,
            replaceHistory: () => null,
            updateBubble: () => null,
            beginAiReplyGroup: () => null,
            endAiReplyGroup: () => null,
            showTimelineToast: () => null,
            setBubbleSnapshot: () => null,
            scrollToSnapshot: () => null,
            lockInput: () => null,
            unlockInput: () => null
        };
    }

    let systemMode = false;
    let continueBtn = null;
    let contextMenu = null;
    let latestSystemId = null;
    let lastBubbleFxHandle = null;
    let editingEntry = null;
    let interactionLocked = false;
    let lockReason = null;
    let lastEnterAt = 0;
    const sceneFX = initRendererFx();
    const aiGroupState = {
        armed: false,
        started: false,
        lastBubble: null,
        startDivider: null
    };
    let lastBubbleType = null;
    let lastBubbleNode = null;
    const scrollBottomBtn = createScrollBottomButton();

    storyLog.addEventListener("scroll", updateScrollHint);
    window.addEventListener("resize", updateScrollHint);
    updateScrollHint();

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
        const segments = splitTaggedSegments(entry);
        let lastBubble = null;
        segments.forEach(seg => {
            const role = seg.role || "system";
            const prevBubble = storyLog.querySelector(".story-bubble:last-of-type");
            const rendered = renderStoryBubble(seg, {
                sceneFX,
                lastFxHandle: lastBubbleFxHandle
            });
            if (!rendered || !rendered.bubble) {
                if (rendered?.handledFx) return;
            }
            const bubble = rendered?.bubble;
            if (!bubble) return;
            bubble.dataset.role = role;
            if (seg.id) {
                bubble.dataset.message = seg.id;
            }
            if (seg.snapshotId) {
                bubble.dataset.snapshot = seg.snapshotId;
            }
            if (seg.meta?.placeholder) {
                bubble.dataset.placeholder = "true";
                bubble.classList.add("ai-placeholder");
            }
            bubble.__storyEntry = seg;
            applyPlaceholderState(bubble, seg);
            applyBubbleSpacing(bubble, rendered?.meta);
            attachBubbleMenu(bubble, seg);
            if (bubble.classList.contains("bubble-dialog") && prevBubble?.classList.contains("bubble-dialog")) {
                bubble.classList.add("bubble-dialog-linked");
                prevBubble.classList.add("bubble-dialog-has-next");
            }
            if (role === "system") {
                ensureAiGroupStart();
            } else if (aiGroupState.started && aiGroupState.armed) {
                endAiReplyGroup();
            }
            storyLog.appendChild(bubble);
            if (role === "system" && aiGroupState.armed) {
                aiGroupState.lastBubble = bubble;
            }
            lastBubbleFxHandle = rendered.fxHandle || lastBubbleFxHandle;
            lastBubble = bubble;
        });
        if (!lastBubble) return null;
        scrollToBottom();
        if (continueBtn) {
            continueBtn.remove();
            continueBtn = null;
        }
        if ((lastBubble.dataset.role || entry.role) === "system" && isLastSystemSegment(entry) && !entry.meta?.placeholder && !entry.meta?.error) {
            latestSystemId = entry.id || latestSystemId;
            continueBtn = document.createElement("button");
            continueBtn.className = "continue-btn align-left";
            continueBtn.textContent = "继续说";
            continueBtn.addEventListener("click", () => {
                if (interactionLocked) return;
                const handler = options.onContinue;
                continueBtn?.remove();
                continueBtn = null;
                handler?.();
            }, { once: true });
            continueBtn.disabled = interactionLocked;
            continueBtn.classList.toggle("locked", interactionLocked);
            lastBubble.insertAdjacentElement("afterend", continueBtn);
            scrollToBottom();
        }
        return lastBubble;
    }

    function splitTaggedSegments(entry = {}) {
        const text = entry.text || "";
        const matches = [...text.matchAll(/(^|\n)(#[NATSD]\b)/g)];
        if (matches.length <= 1) return [entry];
        const segments = [];
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + (matches[i][1]?.length || 0);
            const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
            const chunk = text.slice(start, end).trim();
            if (!chunk) continue;
            const cloned = { ...entry, text: chunk };
            if (i > 0) delete cloned.id;
            segments.push(cloned);
        }
        return segments.length ? segments : [entry];
    }

    function attachBubbleMenu(bubble, entry) {
        let pressTimer = null;
        let startX, startY;

        const startPress = (e) => {
            if (interactionLocked) return;
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
            if (interactionLocked) {
                event.preventDefault();
                return;
            }
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            event.preventDefault();
            openBubbleMenu(event, entry);
        });
    }

    function openBubbleMenu(event, entry) {
        if (interactionLocked) return;
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

    function setInputDisabled(disabled) {
        if (disabled) {
            storySend?.setAttribute("disabled", "true");
            storySend?.classList.add("disabled");
            storyInput?.classList.add("input-busy");
            storyInputRow?.classList.add("input-locked");
        } else {
            storySend?.removeAttribute("disabled");
            storySend?.classList.remove("disabled");
            storyInput?.classList.remove("input-busy");
            storyInputRow?.classList.remove("input-locked");
        }
    }

    function setInert(node, state) {
        if (!node) return;
        if (state) {
            node.setAttribute("inert", "true");
            node.classList.add("locked");
        } else {
            node.removeAttribute("inert");
            node.classList.remove("locked");
        }
    }

    function setUiLocked(state) {
        interactionLocked = state;
        lockReason = state ? "generation" : null;
        setInputDisabled(state);
        toggleToolsMenu(false);
        const hardLockTargets = [
            storySend,
            collapseBtn
        ];
        hardLockTargets.forEach(node => setInert(node, state));
        const softLockTargets = [
            systemBtn,
            restartBtn,
            newWindowBtn,
            characterCloseBtn,
            providerSelect,
            memorySlider,
            fontSlider,
            toolsBtn,
            toolsMenu
        ];
        const shouldSoftLock = state && lockReason !== "generation";
        softLockTargets.forEach(node => setInert(node, shouldSoftLock));
        restartButtons?.forEach(btn => setInert(btn, shouldSoftLock));
        if (continueBtn) setInert(continueBtn, state);
        if (contextMenu) closeBubbleMenu();
        storyLayer?.classList.toggle("ai-generating", state);
        storyPanelEl?.classList.toggle("ai-generating", state);
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeBubbleMenu();
        }
    });

    function resolveBubbleActions(entry = {}) {
        const meta = entry.meta || {};
        if (meta.placeholder || meta.error) return [];
        const items = [];
        const isLatestSystem = entry.role === "system" && entry.id && entry.id === latestSystemId;
        const snapshotAllowed = entry.snapshotId
            && (!options.isSnapshotAllowed || options.isSnapshotAllowed(entry.snapshotId));
        if (snapshotAllowed) {
            items.push({ id: "rewind", label: "回溯到此刻" });
        }
        if (isLatestSystem) {
            items.push({ id: "retry", label: "重说这一句" });
        }
        if (isLatestSystem) {
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
        if (interactionLocked) return;
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
            : "开始你的故事";
        systemBtn?.classList.toggle("active", systemMode);
        options.onSystemModeChange?.(systemMode);
    }

    function toggleToolsMenu(forceValue) {
        const targetState = typeof forceValue === "boolean"
            ? forceValue
            : !toolsMenu?.classList.contains("show");
        if (interactionLocked && lockReason !== "generation" && targetState) return;
        toolsMenu?.classList.toggle("show", targetState);
        toolsBtn?.classList.toggle("active", targetState);
        if (toolsMenu && !targetState && toolsMenu.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        if (toolsMenu) {
            if (targetState) {
                toolsMenu.removeAttribute("inert");
            } else {
                toolsMenu.setAttribute("inert", "true");
            }
        }
    }

    function openRestartSheet() {
        restartSheet?.classList.add("show");
        restartSheet?.removeAttribute("inert");
    }

    function closeRestartSheet() {
        restartSheet?.classList.remove("show");
        if (restartSheet?.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        restartSheet?.setAttribute("inert", "true");
    }

    storyInput.addEventListener("input", autoGrowInput);
    if (collapseBtn) {
        collapseBtn.addEventListener("click", () => {
            limitTwoLines();
        });
    }
    storySend.addEventListener("click", handleSubmit);
    storyInput.addEventListener("keydown", (e) => {
        if (interactionLocked) {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing) {
            const now = Date.now();
            const doubleTap = now - lastEnterAt < 380;
            if (doubleTap) {
                e.preventDefault();
                handleSubmit();
                lastEnterAt = 0;
                return;
            }
            lastEnterAt = now;
            // 单次回车默认换行，不触发发送
        }
    });

    storyInput.addEventListener("blur", () => {
        lastEnterAt = 0;
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

    newWindowBtn?.addEventListener("click", () => {
        toggleToolsMenu(false);
        const roleId = typeof window !== "undefined" ? window.__SHELL_ROLE_ID__ || null : null;
        try {
            window.parent?.postMessage({ type: "shell:new-window", roleId }, "*");
        } catch {
            /* ignore cross-frame errors */
        }
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
        const providers = (options.providerOptions && options.providerOptions.length)
            ? options.providerOptions
            : (options.narratorModelOptions || []);
        providerSelect.innerHTML = "";
        providers.forEach(provider => {
            const opt = document.createElement("option");
            opt.value = provider.id;
            opt.textContent = provider.label;
            providerSelect.appendChild(opt);
        });
        const initial = options.currentProvider || options.currentNarratorModel || providers[0]?.id;
        if (initial) providerSelect.value = initial;
        providerSelect.addEventListener("change", () => {
            if (options.onProviderChange) {
                options.onProviderChange(providerSelect.value);
            } else if (options.onNarratorModelChange) {
                options.onNarratorModelChange(providerSelect.value);
            }
        });
    }

    function scrollToSnapshot(snapshotId) {
        if (!snapshotId || !storyLog) return;
        const bubble = storyLog.querySelector(`[data-snapshot="${snapshotId}"]`);
        if (bubble) {
            bubble.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(updateScrollHint);
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

    function scrollToBottom(options = {}) {
        if (!storyLog) return;
        const behavior = options.behavior || (options.smooth ? "smooth" : "auto");
        requestAnimationFrame(() => {
            if (storyLog.scrollTo) {
                storyLog.scrollTo({ top: storyLog.scrollHeight, behavior });
            } else {
                storyLog.scrollTop = storyLog.scrollHeight;
            }
            updateScrollHint();
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
        const seed = typeof options.getEditSeed === "function" ? options.getEditSeed(entry) : null;
        editInput.value = seed ?? entry?.text ?? "";
        editSheet.classList.add("show");
        editSheet.removeAttribute("inert");
        requestAnimationFrame(() => editInput.focus());
    }

    function closeEditDialog() {
        if (!editSheet) return;
        editSheet.classList.remove("show");
        if (editSheet.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        editSheet.setAttribute("inert", "true");
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
        characterSheet.classList.toggle("open", nextState);
        if (!nextState && characterSheet.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        if (nextState) {
            characterSheet.removeAttribute("inert");
        } else {
            characterSheet.setAttribute("inert", "true");
        }
        options.onToggleProfile?.(nextState);
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
        if (entry.meta?.placeholder) {
            bubble.dataset.placeholder = "true";
            bubble.classList.add("ai-placeholder");
        }
        bubble.__storyEntry = entry;
        applyPlaceholderState(bubble, entry);
        applyBubbleSpacing(bubble, rendered?.meta);
        attachBubbleMenu(bubble, entry);
        target.replaceWith(bubble);
        if (entry.role === "system" && aiGroupState.armed) {
            aiGroupState.lastBubble = bubble;
        }
        if (continueBtn) {
            continueBtn.remove();
            continueBtn = null;
        }
        const isPlaceholder = Boolean(entry.meta?.placeholder);
        const isError = Boolean(entry.meta?.error);
        if (entry.role === "system" && isLastSystemSegment(entry) && !isPlaceholder && !isError) {
            latestSystemId = entry.id || latestSystemId;
            continueBtn = document.createElement("button");
            continueBtn.className = "continue-btn align-left";
            continueBtn.textContent = "继续说";
            continueBtn.addEventListener("click", () => {
            if (interactionLocked) return;
            const handler = options.onContinue;
            continueBtn?.remove();
            continueBtn = null;
            handler?.();
        }, { once: true });
            continueBtn.disabled = interactionLocked;
            continueBtn.classList.toggle("locked", interactionLocked);
            bubble.insertAdjacentElement("afterend", continueBtn);
            scrollToBottom();
        }
        return bubble;
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
        lockInput: () => setInputDisabled(true),
        unlockInput: () => setInputDisabled(false),
        replaceHistory(entries = []) {
            storyLog.innerHTML = "";
            continueBtn = null;
            closeBubbleMenu();
            latestSystemId = null;
            resetAiGroupState();
            lastBubbleType = null;
            lastBubbleNode = null;
            let lastRole = null;
            entries.forEach(entry => {
                const role = entry.role || "system";
                const shouldGroup = storyLog.childElementCount > 0; // 跳过最初默认文本
                if (role === "system" && shouldGroup) {
                    if (!aiGroupState.armed) beginAiReplyGroup();
                } else if (aiGroupState.armed && aiGroupState.started) {
                    endAiReplyGroup();
                }
                const bubble = appendBubble(entry);
                lastRole = role;
                if (role === "system" && aiGroupState.armed) {
                    aiGroupState.lastBubble = bubble || aiGroupState.lastBubble;
                    aiGroupState.started = true;
                }
            });
            if (aiGroupState.armed && aiGroupState.started) {
                endAiReplyGroup();
            }
            refreshLatestSystem(entries);
            scrollToBottom();
        },
        exitSystemMode: () => toggleSystemMode(false),
        setBubbleSnapshot: setBubbleSnapshot,
        scrollToSnapshot,
        showTimelineToast: showToast,
        beginAiReplyGroup,
        endAiReplyGroup,
        updateBubble,
        setGenerationState: setUiLocked
    };

    function applyPlaceholderState(node, entry = {}) {
        if (!node) return;
        const meta = entry.meta || {};
        const isPlaceholder = node.dataset.placeholder === "true" || Boolean(meta.placeholder);
        const variant = meta.placeholderVariant || node.dataset.placeholderVariant || "";
        node.classList.toggle("ai-placeholder", isPlaceholder);
        node.classList.toggle("ai-placeholder-active", isPlaceholder && meta.loading !== false && !meta.error);
        node.classList.toggle("ai-placeholder-error", isPlaceholder && Boolean(meta.error));
        if (variant && isPlaceholder) {
            node.dataset.placeholderVariant = variant;
        } else if (!isPlaceholder) {
            node.removeAttribute("data-placeholder-variant");
        }
    }

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

    function isNearBottom() {
        if (!storyLog) return true;
        const distance = storyLog.scrollHeight - storyLog.clientHeight - storyLog.scrollTop;
        return distance < 48;
    }

    function updateScrollHint() {
        if (!scrollBottomBtn) return;
        scrollBottomBtn.classList.toggle("visible", !isNearBottom());
    }

    function createScrollBottomButton() {
        const btn = document.createElement("button");
        btn.id = "story-scroll-bottom";
        btn.type = "button";
        btn.setAttribute("aria-label", "回到底部");
        btn.innerHTML = `<span class="chevron">↓</span>`;
        btn.addEventListener("click", () => scrollToBottom({ behavior: "smooth" }));
        const host = storyLayer || storyPanelEl || storyLog.parentElement;
        host?.appendChild(btn);
        return btn;
    }
}
