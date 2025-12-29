import { initializeWorldState, getWorldState } from "../data/world-state.js";
import { getShortMemory, hydrateShortMemory } from "../data/memory-short.js";
import { getLongMemory, loadLongMemory } from "../data/memory-long.js";
import { getSystemRules, updateSystemRules } from "../data/system-rules.js";
import { exportWindowBundle, importWindowBundle } from "../data/window-memory.js";
import { getWindowId } from "./window-context.js";

const MAX_SNAPSHOTS = 20;
const snapshots = [];

function deepClone(data) {
    if (typeof window !== "undefined" && window.structuredClone) {
        return window.structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
}

export function saveSnapshot(label = "", options = {}) {
    const windowId = getWindowId();
    const snapshot = {
        id: cryptoRandomId(),
        label,
        createdAt: Date.now(),
        windowId,
        kind: options.kind || "",
        narratorModelUsed: options.narratorModelUsed || "",
        world: deepClone(getWorldState()),
        shortMemory: getShortMemory(),
        longMemory: getLongMemory(),
        systemRules: getSystemRules(),
        windowMemory: exportWindowBundle(windowId)
    };
    snapshots.push(snapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
        snapshots.shift();
        notifyOverflow();
    }
    return snapshot.id;
}

export function getSnapshots() {
    return snapshots.slice().reverse();
}

export function getSnapshotById(snapshotId) {
    if (!snapshotId) return null;
    return snapshots.find(item => item.id === snapshotId) || null;
}

export function restoreSnapshot(snapshotId) {
    if (!snapshots.length) return false;
    let snapshot = null;
    if (snapshotId) {
        snapshot = snapshots.find(item => item.id === snapshotId);
    }
    if (!snapshot) {
        snapshot = snapshots[snapshots.length - 1];
    }
    if (!snapshot) return false;
    const currentWindowId = getWindowId();
    if (snapshot.windowId && snapshot.windowId !== currentWindowId) {
        console.warn("[Timeline] Window mismatch, snapshot ignored", {
            expected: currentWindowId,
            snapshotWindow: snapshot.windowId
        });
        return false;
    }
    initializeWorldState(snapshot.world);
    loadLongMemory(snapshot.longMemory || []);
    hydrateShortMemory(snapshot.shortMemory || []);
    updateSystemRules(snapshot.systemRules || {});
    if (snapshot.windowMemory) {
        importWindowBundle(snapshot.windowMemory);
    }
    return true;
}

export function dropSnapshotsAfter(snapshotId) {
    if (!snapshotId || !snapshots.length) return;
    const index = snapshots.findIndex(s => s.id === snapshotId);
    if (index === -1) return;
    snapshots.splice(index);
}

export function syncSnapshotsWithStory(windowId, allowedSnapshotIds = []) {
    const allowed = new Set(allowedSnapshotIds || []);
    for (let i = snapshots.length - 1; i >= 0; i -= 1) {
        const snap = snapshots[i];
        if (!snap) continue;
        if (windowId && snap.windowId && snap.windowId !== windowId) continue;
        if (!allowed.size) {
            snapshots.splice(i, 1);
            continue;
        }
        if (!allowed.has(snap.id)) {
            snapshots.splice(i, 1);
        }
    }
}

export function clearSnapshots() {
    snapshots.length = 0;
}

function cryptoRandomId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `snap-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyOverflow() {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("timeline:overflow"));
}
