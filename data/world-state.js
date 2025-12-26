import { addShortMemory, addShortEventMemory, hydrateShortMemory } from "./memory-short.js";
import { getActiveCard, DEFAULT_OPENER, GENERIC_OPENER } from "./character-cards.js";

const SYSTEM_VERSION = 2;
const MARKER_TO_TYPE = {
    N: "narration",
    A: "action",
    T: "thought",
    S: "system"
};

const initialContacts = [
    { id: "yuan", name: "元书", tel: "未知线路", icon: "◻" },
    { id: "room", name: "室友", tel: "131****8888", icon: "▣" },
    { id: "shadow", name: "未知 · 留影", tel: "000-000", icon: "□" },
    { id: "sys", name: "系统通告", tel: "系统广播", icon: "▢" }
];

const initialChats = () => ([
    {
        id: "yuan",
        name: "元书",
        icon: "◻",
        time: "刚刚",
        unread: 1,
        log: [
            { from: "in", text: "零钱到账 ¥1314.00", kind: "pay", amount: 1314.0 },
            { from: "in", text: "“你今天在门口回头三次。”" },
            { from: "out", text: "我只是觉得有人跟着我。" },
            { from: "in", text: "“那就是我。”" },
            { from: "in", text: "红包 ¥6.00", kind: "red", amount: 6.0, redeemed: false }
        ]
    },
    {
        id: "room",
        name: "室友",
        icon: "▣",
        time: "下午",
        unread: 0,
        log: [
            { from: "in", text: "电闸修好了，你晚点回来吗？" }
        ]
    },
    {
        id: "shadow",
        name: "未知 · 留影",
        icon: "□",
        time: "刚刚",
        unread: 0,
        log: [
            { from: "in", text: "“他在看你。”" }
        ]
    },
    {
        id: "sys",
        name: "系统通告",
        icon: "▢",
        time: "夜里",
        unread: 0,
        log: [
            { from: "in", text: "和平协议仍有效。" }
        ]
    }
]);

const initialMoments = () => ([
    { id: "m1", who: "你", authorId: "player", text: "今天只是想确认一件事：你有没有在看我。", time: "刚刚", likes: 23, likedByUser: false, comments: [] },
    { id: "m2", who: "未知信号", authorId: "shadow", text: "今晚的城很安静，像在等一场失控。", time: "1 小时前", likes: 9, likedByUser: false, comments: [] },
    { id: "m3", who: "甜品店老板", authorId: "sys", text: "提前留了三盒奶油泡芙，希望他别发火。", time: "2 小时前", likes: 12, likedByUser: false, comments: [] }
]);

const initialCallHistory = () => ([
    { name: "未知来电", time: "刚刚", note: "00:42" },
    { name: "室友", time: "昨天", note: "01:10" },
    { name: "未知号码", time: "前天", note: "未接" }
]);

const GENERIC_OPENER_FALLBACK = GENERIC_OPENER || "这是默认开场白";
const DEFAULT_OPENER_FALLBACK = DEFAULT_OPENER || GENERIC_OPENER_FALLBACK;

function seedDefaultStory(card = getActiveCard()) {
    const opener = (card?.opener && String(card.opener).trim()) || (card?.id === "default" ? DEFAULT_OPENER_FALLBACK : GENERIC_OPENER_FALLBACK);
    const segments = segmentStoryPayload(opener);
    if (!segments.length) return [];
    const total = segments.length;
    return segments.map((segment, index) =>
        createStoryEntry("system", segment.text, {}, segment.storyType, index, total)
    );
}

function createId(prefix = "id") {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultState(card = getActiveCard()) {
    const skipSeed = typeof window !== "undefined" && window.__SHELL_HOSTED__;
    const baseStory = skipSeed ? [] : seedDefaultStory(card);
    return {
        systemVersion: SYSTEM_VERSION,
        story: baseStory.map(entry => ({ ...entry, id: entry.id || createId("story") })),
        contacts: initialContacts.map(c => ({ ...c })),
        chats: initialChats().map((chat, idx) => enrichChat(chat, idx)),
        chatOrder: ["yuan", "room", "shadow", "sys"],
        moments: initialMoments().map(moment => enrichMoment(moment, initialContacts)),
        callHistory: initialCallHistory().map(entry => ({ ...entry })),
        memoEntries: [],
        eventsLog: [],
        unread: { total: 1, byApp: { wechat: 1, phone: 0 } },
        wallet: {
            balance: 2180.0,
            events: [
                { type: "income", source: "元书", amount: 1314.0, time: Date.now() - 3600 * 1000 }
            ]
        },
        blackFog: { nodes: [], lastTrigger: null },
        triggers: [],
        lastAppOpened: null,
        unreadMomentsCount: 0
    };
}

function enrichChat(chat, index = 0) {
    const log = (chat.log || chat.messages || []).map(entry => ({ ...entry }));
    return {
        id: chat.id,
        name: chat.name || chat.title || "",
        icon: chat.icon || "◻",
        time: chat.time || "刚刚",
        unread: chat.unread || 0,
        log,
        preview: chat.preview || computeChatPreview(log),
        pinned: Boolean(chat.pinned),
        blocked: Boolean(chat.blocked),
        orderIndex: typeof chat.orderIndex === "number" ? chat.orderIndex : index
    };
}

function enrichMoment(moment, contactsSource = initialContacts) {
    return {
        id: moment.id || `moment-${Math.random().toString(36).slice(2, 7)}`,
        who: moment.who,
        text: moment.text,
        time: moment.time || "刚刚",
        likes: moment.likes || 0,
        likedByUser: Boolean(moment.likedByUser),
        authorId: moment.authorId || deriveAuthorId(moment.who, contactsSource),
        comments: (moment.comments || []).map(c => ({
            ...c,
            authorId: c.authorId || null,
            mentions: c.mentions || []
        }))
    };
}

function deriveAuthorId(name, contactsSource = initialContacts) {
    if (!name) return null;
    if (name === "你") return "player";
    const contact = (contactsSource || initialContacts).find(c => c.name === name);
    return contact ? contact.id : null;
}

function computeChatPreview(log = []) {
    if (!log.length) return "";
    const last = log[log.length - 1];
    if (last.text) return last.text;
    if (last.kind === "pay") return `转账 ¥${(last.amount || 0).toFixed(2)}`;
    if (last.kind === "red") {
        return `${last.redeemed ? "已收红包" : "红包"} ¥${(last.amount || 0).toFixed(2)}`;
    }
    return "";
}

function unreadOfChats(chats) {
    return chats.reduce((sum, chat) => sum + (chat.unread || 0), 0);
}

let worldState = createDefaultState();
const listeners = new Set();

export function getSeedState() {
    return createDefaultState();
}

export function initializeWorldState(loadedState = null) {
    if (loadedState && typeof loadedState === "object") {
        const base = createDefaultState();
        worldState = {
            ...base,
            ...loadedState
        };
        const contactsSeed = (loadedState.contacts && loadedState.contacts.length) ? loadedState.contacts : base.contacts;
        worldState.contacts = contactsSeed.map(c => ({ ...c }));
        const chatsSeed = (loadedState.chats && loadedState.chats.length) ? loadedState.chats : base.chats;
        worldState.chats = chatsSeed.map((chat, idx) => enrichChat(chat, idx));
        worldState.chatOrder = (loadedState.chatOrder && loadedState.chatOrder.length) ? loadedState.chatOrder : base.chatOrder;
        const momentsSeed = (loadedState.moments && loadedState.moments.length) ? loadedState.moments : base.moments;
        worldState.moments = momentsSeed.map(moment => enrichMoment(moment, worldState.contacts));
        const callSeed = (loadedState.callHistory && loadedState.callHistory.length) ? loadedState.callHistory : base.callHistory;
        worldState.callHistory = callSeed.map(entry => ({ ...entry }));
        worldState.memoEntries = (loadedState.memoEntries || []).slice(-50);
        worldState.eventsLog = (loadedState.eventsLog || []).slice(-100);
        worldState.wallet = loadedState.wallet || base.wallet;
        worldState.blackFog = loadedState.blackFog || base.blackFog;
        worldState.story = (loadedState.story || base.story).map(entry => ({
            ...entry,
            id: entry.id || createId("story")
        }));
        worldState.unread = loadedState.unread || base.unread;
        worldState.triggers = (loadedState.triggers || base.triggers).slice(-20);
        worldState.lastAppOpened = loadedState.lastAppOpened || base.lastAppOpened;
        worldState.unreadMomentsCount = loadedState.unreadMomentsCount || base.unreadMomentsCount;
    } else {
        worldState = createDefaultState();
    }
    sortChatsByPinned();
    refreshUnread();
    hydrateShortMemory(worldState.story);
    emit("world:init", { state: worldState });
}

export function getWorldState() {
    return worldState;
}

export function setWorldState(next) {
    if (!next) return;
    worldState = next;
    hydrateShortMemory(worldState.story || []);
    emit("world:set", { state: worldState });
}

export function subscribeWorldState(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit(path, detail) {
    listeners.forEach(listener => {
        try {
            listener(path, detail, worldState);
        } catch (err) {
            console.error("WorldState listener error:", err);
        }
    });
}

export function updateWorldState(mutator, path = "world:update") {
    if (typeof mutator !== "function") return;
    mutator(worldState);
    emit(path, { type: path });
}

export function addStoryMessage(role, text, meta = {}) {
    const segments = segmentStoryPayload(text);
    if (!segments.length) return [];
    const total = segments.length;
    const entries = [];
    segments.forEach((segment, index) => {
        const entry = createStoryEntry(role, segment.text, meta, segment.storyType, index, total);
        worldState.story.push(entry);
        addShortMemory(entry);
        entries.push(entry);
        emit("story:append", { message: entry });
    });
    return entries;
}

export function trimStoryAfter(messageId) {
    if (!messageId) return false;
    const index = worldState.story.findIndex(item => item.id === messageId);
    if (index === -1) return false;
    worldState.story.splice(index);
    hydrateShortMemory(worldState.story);
    emit("story:trim", { messageId });
    return true;
}

export function editStoryMessage(messageId, text) {
    if (!messageId || typeof text !== "string") return false;
    const clean = text.trim();
    if (!clean) return false;
    const entry = worldState.story.find(item => item.id === messageId);
    if (!entry) return false;
    entry.text = clean;
    entry.time = Date.now();
    hydrateShortMemory(worldState.story);
    emit("story:update", { message: { ...entry } });
    return true;
}

function segmentStoryPayload(rawText = "") {
    if (rawText == null) return [];
    const normalized = String(rawText).replace(/\r\n/g, "\n");
    const rawBlocks = [];
    const lines = normalized.split("\n");
    let buffer = [];

    const flush = () => {
        if (!buffer.length) return;
        const joined = buffer.join("\n").trim();
        if (joined) rawBlocks.push(joined);
        buffer = [];
    };

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            flush();
            return;
        }
        const markerStart = /^#[A-Z]+\b/.test(trimmed);
        if (markerStart) {
            flush();
        }
        buffer.push(line);
    });
    flush();

    const segments = [];
    let inheritedType = null;
    rawBlocks.forEach(block => {
        if (!block) return;
        let text = block.trim();
        if (!text) return;
        const markerMatch = text.match(/^#([A-Z]+)\s*/);
        let storyType = inheritedType;
        if (markerMatch) {
            const marker = markerMatch[1];
            if (MARKER_TO_TYPE[marker]) {
                inheritedType = MARKER_TO_TYPE[marker];
                storyType = inheritedType;
                text = text.slice(markerMatch[0].length).trim();
            }
        }
        if (!storyType && looksLikeDialogue(text)) {
            storyType = "dialogue";
            inheritedType = storyType;
        }
        if (!text) return;
        segments.push({
            text,
            storyType
        });
    });
    if (!segments.length && normalized.trim()) {
        segments.push({ text: normalized.trim(), storyType: null });
    }
    return segments;
}

function looksLikeDialogue(text = "") {
    if (!text) return false;
    if (/^“.+”$/.test(text)) return true;
    return /(说|说道|回答|问道|问：“|他道|她说|我说)/.test(text);
}

function createStoryEntry(role, text, meta = {}, storyType = null, index = 0, total = 1) {
    const metaData = { ...(meta.meta || {}) };
    if (storyType) metaData.storyType = storyType;
    metaData.segmentIndex = index;
    metaData.segmentTotal = total;
    if (!metaData.storyType && metaData.segmentTotal <= 1) {
        delete metaData.segmentIndex;
        delete metaData.segmentTotal;
    }
    const hasMeta = Object.keys(metaData).length > 0;
    return {
        role,
        text,
        time: meta.time || Date.now(),
        meta: hasMeta ? metaData : null,
        id: createId("story")
    };
}

export function addChatMessage(chatId, message = {}) {
    const chat = getChatById(chatId);
    if (!chat) return;
    const entry = {
        from: message.from || "in",
        text: message.text || "",
        kind: message.kind,
        amount: message.amount,
        redeemed: message.redeemed,
        time: message.time || Date.now()
    };
    chat.log.push(entry);
    chat.preview = computeChatPreview(chat.log);
    chat.time = "刚刚";
    addShortEventMemory({
        type: entry.kind || "chat",
        app: "wechat",
        text: entry.text || chat.preview || "",
        meta: { chatId, direction: entry.from }
    });
    if (entry.from === "in") {
        chat.unread = (chat.unread || 0) + 1;
        refreshUnread();
    }
    emit("chats:message", { chatId, message: entry });
    return entry;
}

export function markChatRead(chatId) {
    const chat = getChatById(chatId);
    if (!chat) return;
    chat.unread = 0;
    refreshUnread();
    emit("chats:read", { chatId });
}

export function sendMessage(chatId, text, author = "out", meta = {}) {
    if (!chatId || !text) return null;
    const direction = meta.direction || author;
    return addChatMessage(chatId, {
        from: direction === "system" ? "in" : direction,
        text,
        kind: meta.kind,
        amount: meta.amount,
        redeemed: meta.redeemed,
        time: meta.time
    });
}

export function appendSystemMessage(chatId, text, meta = {}) {
    return sendMessage(chatId, text, "in", meta);
}

export function withdrawChatMessage(chatId, msgIndex = null) {
    const chat = getChatById(chatId);
    if (!chat || !chat.log?.length) return null;
    const target = msgIndex != null
        ? { entry: chat.log[msgIndex], idx: msgIndex }
        : [...chat.log].map((entry, idx) => ({ entry, idx })).reverse().find(item => item.entry.from === "out");
    if (!target || !target.entry || target.entry.from !== "out") return null;
    const entry = target.entry;
    if (entry.recalled) return null;
    const originalText = entry.text || "";
    entry.text = `已撤回「${originalText}」`;
    entry.recalled = true;
    entry.kind = "recall";
    entry.time = Date.now();
    const notice = {
        from: "system",
        text: "你撤回了一条消息。",
        kind: "tip",
        time: Date.now()
    };
    chat.log.push(notice);
    chat.preview = computeChatPreview(chat.log);
    chat.time = "刚刚";
    addShortEventMemory({
        type: "chat-recall",
        app: "wechat",
        text: originalText,
        meta: { chatId, msgIndex: target.idx }
    });
    emit("chats:withdraw", { chatId, message: notice, recalled: entry, msgIndex: target.idx });
    return entry;
}

export function deleteMoment(momentId) {
    const index = worldState.moments.findIndex(m => m.id === momentId);
    if (index === -1) return null;
    const [removed] = worldState.moments.splice(index, 1);
    emit("moments:delete", { momentId, moment: removed });
    addShortEventMemory({
        type: "moments-delete",
        app: "moments",
        text: removed?.text || "删除了朋友圈",
        meta: { momentId }
    });
    return removed;
}

export function addMomentComment(momentId, comment) {
    const moment = getMomentById(momentId);
    if (!moment) return;
    const entry = {
        from: comment.from || "你",
        text: comment.text || "",
        type: comment.type || "comment",
        time: comment.time || Date.now(),
        authorId: comment.authorId || null,
        mentions: comment.mentions || []
    };
    moment.comments = moment.comments || [];
    moment.comments.push(entry);
    addShortEventMemory({
        type: entry.type || "comment",
        app: "moments",
        text: `${entry.from || "访客"}: ${entry.text}`,
        meta: { momentId }
    });
    emit("moments:comment", { momentId, comment: entry });
}

export function commentMoment(momentId, authorId = "player", text, mentions = [], type = "comment") {
    if (!text) return null;
    const fromName = authorId === "player"
        ? "你"
        : (worldState.contacts.find(c => c.id === authorId)?.name || "访客");
    return addMomentComment(momentId, {
        from: fromName,
        text,
        type,
        authorId,
        mentions
    });
}

export function likeMoment(momentId, userId = "player", liked = true) {
    const moment = getMomentById(momentId);
    if (!moment) return null;
    const current = userId === "player" ? Boolean(moment.likedByUser) : false;
    const shouldLike = typeof liked === "boolean" ? liked : !current;
    const delta = shouldLike ? 1 : -1;
    if (userId === "player") {
        moment.likedByUser = shouldLike;
    }
    moment.likes = Math.max(0, (moment.likes || 0) + delta);
    addShortEventMemory({
        type: shouldLike ? "moment_like" : "moment_unlike",
        app: "moments",
        text: `${userId === "player" ? "I" : userId} ${shouldLike ? "liked" : "unliked"} a moment.`,
        meta: { momentId, userId }
    });
    emit("moments:like", { momentId, userId, liked: shouldLike });
    return moment;
}

export function addMomentPost(post) {
    const entry = enrichMoment({
        ...post,
        id: post.id || `moment-${Date.now()}`
    }, worldState.contacts);
    worldState.moments.unshift(entry);
    addShortEventMemory({
        type: "moment_post",
        app: "moments",
        text: `New moment posted: "${entry.text}"`,
        meta: { momentId: entry.id, authorId: entry.authorId }
    });
    emit("moments:post", { post: entry });
    return entry;
}

export function postMoment(text, images = [], authorId = "player") {
    if (!text) return null;
    const who = authorId === "player"
        ? "你"
        : (worldState.contacts.find(c => c.id === authorId)?.name || "访客");
    return addMomentPost({
        who,
        authorId,
        text,
        images,
        time: "刚刚"
    });
}

export function incrementMomentsUnread(delta = 1) {
    const amount = Number.isFinite(delta) ? delta : 1;
    const next = Math.max(0, (worldState.unreadMomentsCount || 0) + amount);
    if (next === worldState.unreadMomentsCount) return;
    worldState.unreadMomentsCount = next;
    emit("moments:unread", { count: worldState.unreadMomentsCount });
}

export function clearMomentsUnread() {
    if (!worldState.unreadMomentsCount) return;
    worldState.unreadMomentsCount = 0;
    emit("moments:unread", { count: 0 });
}

export function addCallLog(entryOrType) {
    let payload = entryOrType;
    if (typeof entryOrType !== "object") {
        payload = {
            note: entryOrType,
            name: arguments[1],
            transcript: arguments[2]
        };
    }
    const record = {
        name: payload.name || "未知来电",
        time: payload.time || "刚刚",
        note: payload.note || "",
        transcript: payload.transcript || []
    };
    worldState.callHistory.unshift(record);
    worldState.callHistory = worldState.callHistory.slice(0, 50);
    addShortEventMemory({
        type: "call",
        app: "phone",
        text: `${record.name} · ${record.note || "通话"}`,
        meta: { direction: payload.direction || record.note }
    });
    emit("calls:add", { record });
    return 0;
}

export function updateCallLog(index, patch) {
    const record = worldState.callHistory[index];
    if (!record) return;
    worldState.callHistory[index] = { ...record, ...patch };
    emit("calls:update", { index, record: worldState.callHistory[index] });
}

export function addCallHistory(type = "来电", from = "未知来电", transcript = []) {
    return addCallLog({
        note: type,
        name: from,
        transcript
    });
}

export function setIncomingCall(state = "idle", caller = null) {
    worldState.incomingCall = {
        state,
        caller,
        time: Date.now()
    };
    emit("calls:incoming", worldState.incomingCall);
}

export function addMemoEntry(text) {
    if (!text) return;
    worldState.memoEntries = worldState.memoEntries || [];
    worldState.memoEntries.unshift({ text, time: Date.now() });
    worldState.memoEntries = worldState.memoEntries.slice(0, 50);
    emit("memo:add", { text });
}

export function clearMemoEntries() {
    worldState.memoEntries = [];
    emit("memo:clear");
}

export function addSystemEvent(entry) {
    worldState.eventsLog = worldState.eventsLog || [];
    worldState.eventsLog.unshift({
        text: entry.text || entry,
        type: entry.type || "system",
        time: entry.time || Date.now()
    });
    worldState.eventsLog = worldState.eventsLog.slice(0, 100);
    emit("events:add", { entry });
}

export function adjustWalletBalance(delta, meta = {}) {
    if (!worldState.wallet) {
        worldState.wallet = { balance: 0, events: [] };
    }
    worldState.wallet.balance = Math.max(0, (worldState.wallet.balance || 0) + delta);
    worldState.wallet.events = worldState.wallet.events || [];
    worldState.wallet.events.unshift({
        type: delta >= 0 ? "income" : "expense",
        amount: Math.abs(delta),
        source: meta.source || "黑雾",
        time: Date.now()
    });
    emit("wallet:update", { balance: worldState.wallet.balance });
}

export function sendTransfer(amount, reason = "转账") {
    const delta = Number(amount) || 0;
    adjustWalletBalance(delta, { source: reason });
    return worldState.wallet.balance;
}

export function sendRedPacket(amount) {
    const delta = -Math.abs(Number(amount) || 0);
    adjustWalletBalance(delta, { source: "红包发送" });
    return worldState.wallet.balance;
}

export function openRedPacket(packetId, amount = 0) {
    adjustWalletBalance(Math.abs(Number(amount) || 0), { source: "红包" });
    emit("wallet:redpacket", { packetId, amount });
}

export function blockChat(chatId, blocked = true) {
    const chat = getChatById(chatId);
    if (!chat) return null;
    chat.blocked = Boolean(blocked);
    if (chat.blocked) {
        chat.unread = 0;
    }
    emit("chats:block", { chatId, blocked: chat.blocked });
    return chat;
}

export function setChatPinned(chatId, pinned = true) {
    const chat = getChatById(chatId);
    if (!chat) return null;
    chat.pinned = Boolean(pinned);
    sortChatsByPinned();
    emit("chats:pinned", { chatId, pinned: chat.pinned });
    return chat;
}

function sortChatsByPinned() {
    if (!worldState.chats) return;
    worldState.chats.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const aIndex = typeof a.orderIndex === "number" ? a.orderIndex : Infinity;
        const bIndex = typeof b.orderIndex === "number" ? b.orderIndex : Infinity;
        return aIndex - bIndex;
    });
}

export function setBlackFogData(data) {
    worldState.blackFog = {
        ...worldState.blackFog,
        ...data,
        lastTrigger: Date.now()
    };
    emit("blackfog:update", { blackFog: worldState.blackFog });
}

export function getChatById(chatId) {
    return worldState.chats.find(chat => chat.id === chatId);
}

export function getMomentById(momentId) {
    return worldState.moments.find(m => m.id === momentId);
}

function refreshUnread() {
    const totalWechat = unreadOfChats(worldState.chats);
    worldState.unread.byApp.wechat = totalWechat;
    worldState.unread.total = totalWechat + (worldState.unread.byApp.phone || 0);
}
