import { getWindowId } from "../core/window-context.js";
import { getCardForWindow } from "./character-cards.js";

const STORAGE_KEY_BASE = "yuan-phone:persona-memory";
const MAX_ITEMS = 30;

let personaMemory = [];
let activeScopeKey = "";

function getScope(options = {}) {
    let windowId = options.windowId;
    try {
        windowId = windowId || getWindowId();
    } catch {
        windowId = windowId || "win-default";
    }
    const card = getCardForWindow(windowId, options.characterId);
    const characterId = options.characterId || card?.id || "default";
    return { windowId, characterId };
}

function scopeKey(scope) {
    return `${scope.windowId}:${scope.characterId}`;
}

function storageKey(scope) {
    return `${STORAGE_KEY_BASE}:${scope.windowId}:${scope.characterId}`;
}

function load(scope) {
    if (typeof window === "undefined" || !window.localStorage) return [];
    try {
        const raw = window.localStorage.getItem(storageKey(scope));
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(-MAX_ITEMS) : [];
    } catch {
        return [];
    }
}

function persist(scope) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        window.localStorage.setItem(storageKey(scope), JSON.stringify(personaMemory.slice(-MAX_ITEMS)));
    } catch (err) {
        console.warn("Failed to persist persona memory", err);
    }
}

function ensureScope(scope) {
    const key = scopeKey(scope);
    if (key === activeScopeKey) return scope;
    personaMemory = load(scope);
    activeScopeKey = key;
    return scope;
}

export function getPersonaMemory(options = {}) {
    const scope = ensureScope(getScope(options));
    persist(scope);
    return personaMemory.slice();
}

export function addPersonaMemory(entry, options = {}) {
    const scope = ensureScope(getScope(options));
    if (!entry) return;
    const clean = typeof entry === "string" ? entry.trim() : "";
    if (!clean) return;
    personaMemory.push({
        text: clean,
        time: Date.now()
    });
    if (personaMemory.length > MAX_ITEMS) {
        personaMemory.splice(0, personaMemory.length - MAX_ITEMS);
    }
    persist(scope);
}

export function loadPersonaMemory(list = [], options = {}) {
    const scope = ensureScope(getScope(options));
    personaMemory = Array.isArray(list) ? list.slice(-MAX_ITEMS) : [];
    persist(scope);
}

export function clearPersonaMemory(options = {}) {
    const scope = ensureScope(getScope(options));
    personaMemory = [];
    persist(scope);
}
