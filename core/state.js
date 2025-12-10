import {
    getWorldState,
    initializeWorldState,
    subscribeWorldState,
    updateWorldState
} from "../data/world-state.js";

export const GameState = getWorldState();

const PHONE_SEGMENT_MAP = {
    chats: ["chats"],
    moments: ["moments"],
    calls: ["callHistory"],
    wallet: ["wallet"],
    unreadTotal: ["unread", "total"],
    unreadByApp: ["unread", "byApp"]
};

function normalizePath(path = "") {
    if (!path) return [];
    const segments = path.split(".").filter(Boolean);
    if (!segments.length) return segments;
    if (segments[0] !== "phone") return segments;
    if (segments.length === 1) return segments;
    const mapped = PHONE_SEGMENT_MAP[segments[1]];
    if (mapped) {
        return mapped.concat(segments.slice(2));
    }
    return segments.slice(1);
}

export function initState(data) {
    initializeWorldState(data);
}

export function getState(path = "") {
    if (!path) return getWorldState();
    const segments = normalizePath(path);
    let value = getWorldState();
    for (const key of segments) {
        if (value == null) return undefined;
        value = value[key];
    }
    return value;
}

export function updateState(path, value) {
    if (!path) return;
    updateWorldState((state) => {
        const segments = normalizePath(path);
        let target = state;
        for (let i = 0; i < segments.length - 1; i++) {
            const key = segments[i];
            if (!(key in target)) target[key] = {};
            target = target[key];
        }
        target[segments[segments.length - 1]] = value;
    }, `state:${path}`);
}

export function subscribeState(listener) {
    return subscribeWorldState(listener);
}
