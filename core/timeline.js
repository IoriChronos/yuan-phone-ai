import { initializeWorldState, getWorldState } from "../data/world-state.js";
import { getShortMemory, hydrateShortMemory } from "../data/memory-short.js";
import { getLongMemory, loadLongMemory } from "../data/memory-long.js";
import { getSystemRules, updateSystemRules } from "../data/system-rules.js";

const MAX_SNAPSHOTS = 30;
const snapshots = [];

function deepClone(data) {
    if (typeof window !== "undefined" && window.structuredClone) {
        return window.structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
}

export function saveSnapshot(label = "") {
    const snapshot = {
        id: cryptoRandomId(),
        label,
        createdAt: Date.now(),
        world: deepClone(getWorldState()),
        shortMemory: getShortMemory(),
        longMemory: getLongMemory(),
        systemRules: getSystemRules()
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
    initializeWorldState(snapshot.world);
    loadLongMemory(snapshot.longMemory || []);
    hydrateShortMemory(snapshot.shortMemory || []);
    updateSystemRules(snapshot.systemRules || {});
    return true;
}

export function dropSnapshotsAfter(snapshotId) {
    if (!snapshotId || !snapshots.length) return;
    const index = snapshots.findIndex(s => s.id === snapshotId);
    if (index === -1) return;
    snapshots.splice(index);
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
