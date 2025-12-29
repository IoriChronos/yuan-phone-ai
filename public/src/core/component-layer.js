const BUTTON_VARIANTS = ["ui-primary", "ui-ghost", "ui-danger"];

let globalObserver = null;

export function enforceComponentLayer(scope = document) {
    if (!scope || !scope.querySelectorAll) return;
    normalizeButtons(scope);
    normalizeInputs(scope);
    normalizeSelects(scope);
    normalizePageHeaders(scope);
    normalizeScrollbars(scope);
}

export function observeComponentLayer(target = document.body) {
    if (!target || globalObserver) return;
    globalObserver = new MutationObserver(() => enforceComponentLayer(target));
    globalObserver.observe(target, { childList: true, subtree: true });
}

function normalizeButtons(scope) {
    const buttons = scope.querySelectorAll("button");
    buttons.forEach(btn => {
        if (!btn.classList.contains("ui-btn")) {
            btn.classList.add("ui-btn");
        }
        if (!BUTTON_VARIANTS.some(v => btn.classList.contains(v))) {
            const variant = resolveButtonVariant(btn);
            btn.classList.add(variant);
        }
    });
}

function resolveButtonVariant(btn) {
    if (btn.classList.contains("primary")) return "ui-primary";
    if (btn.classList.contains("ghost")) return "ui-ghost";
    if (btn.classList.contains("danger") || btn.dataset.danger === "1") return "ui-danger";
    if (btn.classList.contains("decline")) return "ui-danger";
    return "ui-primary";
}

function normalizeInputs(scope) {
    const fields = scope.querySelectorAll("input, textarea");
    fields.forEach(field => {
        if (field.type === "hidden") return;
        if (field.closest(".ui-select")) return;
        const parent = field.parentElement;
        if (!field.classList.contains("ui-input-field")) {
            field.classList.add("ui-input-field");
        }
        if (parent && parent.classList.contains("ui-input")) {
            return;
        }
        const wrap = document.createElement("div");
        wrap.className = "ui-input";
        if (parent) {
            parent.insertBefore(wrap, field);
        }
        wrap.appendChild(field);
    });
}

function normalizeSelects(scope) {
    const selects = scope.querySelectorAll("select");
    selects.forEach(select => {
        if (select.dataset.uiSelectApplied === "1") return;
        applySelectShell(select);
    });
}

function normalizePageHeaders(scope) {
    const headers = scope.querySelectorAll(".ui-page-header");
    headers.forEach(header => {
        const hasTitle = header.querySelector(":scope > .ui-page-title");
        const hasActions = header.querySelector(":scope > .ui-page-actions");
        if (hasTitle && hasActions) return;
        const titleWrap = hasTitle || document.createElement("div");
        titleWrap.classList.add("ui-page-title");
        const actionsWrap = hasActions || document.createElement("div");
        actionsWrap.classList.add("ui-page-actions");
        if (!hasTitle) {
            const nodes = Array.from(header.childNodes);
            nodes.forEach(node => {
                if (node === titleWrap || node === actionsWrap) return;
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BUTTON") {
                    actionsWrap.appendChild(node);
                } else {
                    titleWrap.appendChild(node);
                }
            });
            header.textContent = "";
        }
        if (!hasTitle) header.appendChild(titleWrap);
        if (!hasActions) header.appendChild(actionsWrap);
    });
}

function normalizeScrollbars(scope) {
    const scrollers = scope.querySelectorAll(
        ".ui-modal-body, .ui-panel-body, #app-root, .app-scroll, .story-bubbles-layer, .chat-window-log, .settings-page, .sheet-body.ui-modal-body, [data-ui-scroll]"
    );
    scrollers.forEach(el => {
        el.classList.add("ui-scroll");
    });
}

function applySelectShell(select) {
    const wrapper = document.createElement("div");
    wrapper.className = "ui-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-btn ui-ghost ui-select-trigger";
    const menu = document.createElement("ul");
    menu.className = "ui-select-menu";
    menu.hidden = true;

    const updateTrigger = () => {
        const currentOptions = Array.from(select.options || []);
        const current = currentOptions.find(opt => opt.value === select.value) || currentOptions[0];
        trigger.textContent = current ? current.textContent : "";
    };

    const refreshMenu = () => {
        menu.innerHTML = "";
        const currentOptions = Array.from(select.options || []);
        currentOptions.forEach(option => {
            const li = document.createElement("li");
            li.className = "ui-select-option";
            li.dataset.value = option.value;
            li.textContent = option.textContent || option.value || "";
            if (option.disabled) {
                li.dataset.disabled = "1";
            }
            li.addEventListener("click", () => {
                if (option.disabled) return;
                select.value = option.value;
                updateTrigger();
                const inputEv = new Event("input", { bubbles: true });
                const changeEv = new Event("change", { bubbles: true });
                select.dispatchEvent(inputEv);
                select.dispatchEvent(changeEv);
                closeMenu();
            });
            menu.appendChild(li);
        });
        updateTrigger();
    };

    const closeMenu = () => {
        wrapper.classList.remove("open");
        menu.hidden = true;
    };

    const openMenu = () => {
        wrapper.classList.add("open");
        menu.hidden = false;
    };

    trigger.addEventListener("click", (e) => {
        e.preventDefault();
        if (menu.hidden) openMenu();
        else closeMenu();
    });

    document.addEventListener("click", (e) => {
        if (wrapper.contains(e.target)) return;
        closeMenu();
    });

    const observer = new MutationObserver(() => refreshMenu());
    observer.observe(select, { childList: true, subtree: true });

    select.dataset.uiSelectApplied = "1";
    select.setAttribute("aria-hidden", "true");
    select.hidden = true;
    select.tabIndex = -1;

    refreshMenu();

    const parent = select.parentElement;
    if (parent) {
        parent.insertBefore(wrapper, select);
    }
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(select);
}
