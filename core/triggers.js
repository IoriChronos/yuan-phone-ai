const triggerMap = new Map();

export function registerTrigger(name, rule) {
    if (!name || typeof rule !== "object") return;
    triggerMap.set(name, rule);
}

export function clearTriggers() {
    triggerMap.clear();
}

export async function checkTriggers(input, context = {}) {
    const text = (input ?? "").toString();
    for (const [, rule] of triggerMap.entries()) {
        try {
            const matched = typeof rule.match === "function" ? await rule.match(text, context) : false;
            if (matched && typeof rule.action === "function") {
                return rule.action(text, context);
            }
        } catch (err) {
            console.error("Trigger execution error:", err);
        }
    }
    return null;
}
