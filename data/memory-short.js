const SHORT_MEMORY_SIZE = 20;
const shortMemory = [];

export function addShortMemory(entry) {
    if (!entry || !entry.text) return;
    shortMemory.push({
        role: entry.role || "system",
        text: entry.text,
        time: entry.time || Date.now()
    });
    if (shortMemory.length > SHORT_MEMORY_SIZE) {
        shortMemory.splice(0, shortMemory.length - SHORT_MEMORY_SIZE);
    }
}

export function getShortMemory() {
    return shortMemory.slice();
}

export function hydrateShortMemory(entries = []) {
    shortMemory.length = 0;
    entries.slice(-SHORT_MEMORY_SIZE).forEach(addShortMemory);
}

export function clearShortMemory() {
    shortMemory.length = 0;
}
