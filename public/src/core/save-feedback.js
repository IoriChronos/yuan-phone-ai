const TOAST_LIFETIME = 2000;

export function saveToast(ok = true, message = "") {
    if (typeof document === "undefined") return;
    const host = document.body || document.documentElement;
    const toast = document.createElement("div");
    toast.className = `save-toast ${ok ? "ok" : "fail"}`;
    toast.textContent = message || (ok ? "已保存" : "保存失败");
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => toast.classList.add("hide"), TOAST_LIFETIME);
    setTimeout(() => toast.remove(), TOAST_LIFETIME + 320);
}
