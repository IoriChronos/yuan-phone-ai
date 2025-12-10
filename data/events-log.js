import { addSystemEvent, getWorldState } from "./world-state.js";

export function addEventLog(entry) {
    addSystemEvent(entry);
}

export function getEventsLog() {
    return (getWorldState().eventsLog || []).slice();
}
