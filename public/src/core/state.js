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
    const segments = normalizePath(path);
    const isWalletPath = segments.length && segments[0] === "wallet";
    const prevWallet = isWalletPath ? getState("phone.wallet") : null;
    updateWorldState((state) => {
        let target = state;
        for (let i = 0; i < segments.length - 1; i++) {
            const key = segments[i];
            if (!(key in target)) target[key] = {};
            target = target[key];
        }
        target[segments[segments.length - 1]] = value;
    }, `state:${path}`);
    if (isWalletPath && typeof window !== "undefined") {
        const nextWallet = getState("phone.wallet") || {};
        const before = prevWallet?.balance;
        const after = nextWallet.balance;
        if (typeof before === "number" && typeof after === "number" && before !== after) {
            const delta = after - before;
            window.dispatchEvent(new CustomEvent("wallet:changed", {
                detail: {
                    delta,
                    balance: after,
                    source: value?.lastSource || nextWallet.lastSource || "账户变动"
                }
            }));
        }
    }
}

export function subscribeState(listener) {
    return subscribeWorldState(listener);
}
