const MAX_ENTRIES = 200;
let longMemory = [];

export function loadLongMemory(data = []) {
    longMemory = Array.isArray(data) ? data.slice() : [];
}

export function getLongMemory() {
    return longMemory.slice();
}

export function addLongMemory(entry) {
    if (!entry) return;
    longMemory.push({
        text: entry.text || entry,
        time: entry.time || Date.now()
    });
    if (longMemory.length > MAX_ENTRIES) {
        summarizeAndTrim();
    }
}

export function clearMemory() {
    longMemory = [];
}

export function summarizeAndTrim() {
    if (longMemory.length <= MAX_ENTRIES) return;
    const chunk = longMemory.splice(0, Math.floor(longMemory.length / 2));
    const summaryText = chunk.map(item => item.text).join(" / ").slice(0, 280);
    longMemory.unshift({
        text: `【总结】${summaryText}`,
        time: Date.now()
    });
}
