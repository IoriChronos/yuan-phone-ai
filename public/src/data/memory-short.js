const STORY_MEMORY_SIZE = 20;
const EVENT_MEMORY_SIZE = 10;

const storyMemory = [];
const eventMemory = [];

function trimBuffer(buffer, limit) {
    if (buffer.length <= limit) return;
    buffer.splice(0, buffer.length - limit);
}

export function addShortMemory(entry) {
    if (!entry || !entry.text) return;
    const meta = entry.meta || {};
    if (meta.placeholder || meta.loading || meta.failed || meta.opening) return;
    storyMemory.push({
        role: entry.role || "system",
        text: entry.text,
        time: entry.time || Date.now()
    });
    trimBuffer(storyMemory, STORY_MEMORY_SIZE);
}

export function addShortEventMemory(entry) {
    if (!entry || (!entry.text && !entry.summary)) return;
    const payload = {
        type: entry.type || "event",
        app: entry.app || "phone",
        text: entry.text || entry.summary || "",
        time: entry.time || Date.now(),
        meta: entry.meta || null
    };
    eventMemory.push(payload);
    trimBuffer(eventMemory, EVENT_MEMORY_SIZE);
}

export function getShortMemory() {
    return {
        story: storyMemory.slice(),
        events: eventMemory.slice()
    };
}

export function hydrateShortMemory(source = []) {
    storyMemory.length = 0;
    eventMemory.length = 0;
    if (Array.isArray(source)) {
        source.slice(-STORY_MEMORY_SIZE).forEach(addShortMemory);
        return;
    }
    if (Array.isArray(source.story)) {
        source.story.slice(-STORY_MEMORY_SIZE).forEach(addShortMemory);
    }
    if (Array.isArray(source.events)) {
        source.events.slice(-EVENT_MEMORY_SIZE).forEach(addShortEventMemory);
    }
}

export function clearShortMemory() {
    storyMemory.length = 0;
    eventMemory.length = 0;
}
