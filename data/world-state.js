import { addShortMemory, hydrateShortMemory } from "./memory-short.js";

const SYSTEM_VERSION = 2;

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
    { id: "m1", who: "你", text: "今天只是想确认一件事：你有没有在看我。", time: "刚刚", likes: 23, likedByUser: false, comments: [] },
    { id: "m2", who: "未知信号", text: "今晚的城很安静，像在等一场失控。", time: "1 小时前", likes: 9, likedByUser: false, comments: [] },
    { id: "m3", who: "甜品店老板", text: "提前留了三盒奶油泡芙，希望他别发火。", time: "2 小时前", likes: 12, likedByUser: false, comments: [] }
]);

const initialCallHistory = () => ([
    { name: "未知来电", time: "刚刚", note: "00:42" },
    { name: "室友", time: "昨天", note: "01:10" },
    { name: "未知号码", time: "前天", note: "未接" }
]);

const defaultStory = [
    { role: "system", text: "主线从这里开始。你可以先随便说几句，之后我们再把它接到 AI 上。", time: Date.now() }
];

function createDefaultState() {
    return {
        systemVersion: SYSTEM_VERSION,
        story: defaultStory.map(entry => ({ ...entry })),
        contacts: initialContacts.map(c => ({ ...c })),
        chats: initialChats().map(enrichChat),
        chatOrder: ["yuan", "room", "shadow", "sys"],
        moments: initialMoments().map(enrichMoment),
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
        lastAppOpened: null
    };
}

function enrichChat(chat) {
    const log = (chat.log || chat.messages || []).map(entry => ({ ...entry }));
    return {
        id: chat.id,
        name: chat.name || chat.title || "",
        icon: chat.icon || "◻",
        time: chat.time || "刚刚",
        unread: chat.unread || 0,
        log,
        preview: chat.preview || computeChatPreview(log)
    };
}

function enrichMoment(moment) {
    return {
        id: moment.id || `moment-${Math.random().toString(36).slice(2, 7)}`,
        who: moment.who,
        text: moment.text,
        time: moment.time || "刚刚",
        likes: moment.likes || 0,
        likedByUser: Boolean(moment.likedByUser),
        comments: (moment.comments || []).map(c => ({ ...c }))
    };
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

export function initializeWorldState(loadedState = null) {
    if (loadedState && typeof loadedState === "object") {
        const base = createDefaultState();
        worldState = {
            ...base,
            ...loadedState
        };
        worldState.contacts = (loadedState.contacts || base.contacts).map(c => ({ ...c }));
        worldState.chats = (loadedState.chats || base.chats).map(enrichChat);
        worldState.chatOrder = loadedState.chatOrder || base.chatOrder;
        worldState.moments = (loadedState.moments || base.moments).map(enrichMoment);
        worldState.callHistory = (loadedState.callHistory || base.callHistory).map(entry => ({ ...entry }));
        worldState.memoEntries = (loadedState.memoEntries || []).slice(-50);
        worldState.eventsLog = (loadedState.eventsLog || []).slice(-100);
        worldState.wallet = loadedState.wallet || base.wallet;
        worldState.blackFog = loadedState.blackFog || base.blackFog;
        worldState.story = (loadedState.story || base.story).map(entry => ({ ...entry }));
        worldState.unread = loadedState.unread || base.unread;
        worldState.triggers = (loadedState.triggers || base.triggers).slice(-20);
        worldState.lastAppOpened = loadedState.lastAppOpened || base.lastAppOpened;
    } else {
        worldState = createDefaultState();
    }
    refreshUnread();
    hydrateShortMemory(worldState.story);
    emit("world:init", { state: worldState });
}

export function getWorldState() {
    return worldState;
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
    if (!text) return;
    const entry = {
        role,
        text,
        time: meta.time || Date.now(),
        meta: meta.meta || null
    };
    worldState.story.push(entry);
    addShortMemory(entry);
    emit("story:append", { message: entry });
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
    if (entry.from === "in") {
        chat.unread = (chat.unread || 0) + 1;
        refreshUnread();
    }
    emit("chats:message", { chatId, message: entry });
}

export function markChatRead(chatId) {
    const chat = getChatById(chatId);
    if (!chat) return;
    chat.unread = 0;
    refreshUnread();
    emit("chats:read", { chatId });
}

export function addMomentComment(momentId, comment) {
    const moment = getMomentById(momentId);
    if (!moment) return;
    const entry = {
        from: comment.from || "你",
        text: comment.text || "",
        type: comment.type || "comment",
        time: comment.time || Date.now()
    };
    moment.comments = moment.comments || [];
    moment.comments.push(entry);
    emit("moments:comment", { momentId, comment: entry });
}

export function addMomentPost(post) {
    const entry = enrichMoment({
        ...post,
        id: post.id || `moment-${Date.now()}`
    });
    worldState.moments.unshift(entry);
    emit("moments:post", { post: entry });
}

export function addCallLog(entry) {
    const record = {
        name: entry.name || "未知来电",
        time: entry.time || "刚刚",
        note: entry.note || "",
        transcript: entry.transcript || []
    };
    worldState.callHistory.unshift(record);
    worldState.callHistory = worldState.callHistory.slice(0, 50);
    emit("calls:add", { record });
    return 0;
}

export function updateCallLog(index, patch) {
    const record = worldState.callHistory[index];
    if (!record) return;
    worldState.callHistory[index] = { ...record, ...patch };
    emit("calls:update", { index, record: worldState.callHistory[index] });
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
