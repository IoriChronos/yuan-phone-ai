export function initAIChatWindow(options = {}) {
    const storyLog = document.getElementById("story-log");
    const storyInput = document.getElementById("story-input");
    const storySend = document.getElementById("story-send");
    const collapseBtn = document.getElementById("input-collapse-btn");

    if (!storyLog || !storyInput || !storySend) {
        throw new Error("AI chat window elements missing");
    }

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

    function appendBubble(role, text) {
        if (!storyLog) return;
        const bubble = document.createElement("div");
        bubble.className = `story-bubble ${role}`;
        bubble.textContent = text;
        storyLog.appendChild(bubble);
        storyLog.scrollTop = storyLog.scrollHeight;
    }

    function handleSubmit() {
        const value = storyInput.value.trim();
        if (!value) return;
        storyInput.value = "";
        limitTwoLines();
        if (typeof options.onSubmit === "function") {
            options.onSubmit(value);
        }
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

    limitTwoLines();

    return {
        appendBubble,
        focusInput: () => storyInput.focus(),
        resetInput: limitTwoLines
    };
}
