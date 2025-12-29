(function orientationLockBootstrap() {
    const FLAG = "data-orientation-lock";
    const OVERLAY_ID = "orientation-lock";
    const MOBILE_MAX_WIDTH = 900;
    let overlayRef = null;

    const isPortrait = () => {
        try {
            const mq = window.matchMedia && window.matchMedia("(orientation: portrait)");
            if (mq && typeof mq.matches === "boolean") return mq.matches;
        } catch {
            /* ignore matchMedia errors */
        }
        return window.innerHeight >= window.innerWidth;
    };

    function ensureOverlay() {
        if (overlayRef && overlayRef.isConnected) return overlayRef;
        const overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.setAttribute("role", "alert");
        overlay.innerHTML = `
            <div class="orientation-card">
                <p class="orientation-title">请竖屏使用</p>
                <p class="orientation-copy">为保证体验，横屏已暂停显示，请旋转设备。</p>
            </div>
        `;
        document.body.appendChild(overlay);
        overlayRef = overlay;
        return overlayRef;
    }

    const isMobileViewport = () => {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        return Math.min(w, h) <= MOBILE_MAX_WIDTH;
    };

    function update() {
        const overlay = ensureOverlay();
        const portrait = isPortrait();
        const mobile = isMobileViewport();
        const shouldBlock = mobile && !portrait;
        overlay.classList.toggle("show", shouldBlock);
        document.body.classList.toggle("orientation-blocked", shouldBlock);
    }

    function init() {
        if (!document?.body || document.body.getAttribute(FLAG) === "ready") return;
        document.body.setAttribute(FLAG, "ready");
        ensureOverlay();
        update();
        const mq = window.matchMedia && window.matchMedia("(orientation: portrait)");
        if (mq && mq.addEventListener) mq.addEventListener("change", update);
        else if (mq && mq.addListener) mq.addListener(update);
        window.addEventListener("resize", update, { passive: true });
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
})();
