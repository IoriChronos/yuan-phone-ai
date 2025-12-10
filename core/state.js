const initialChats = () => ([
    {
        id: "yuan",
        name: "元书",
        icon: "◻",
        preview: "“靠近一点。”",
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
        preview: "电闸修好了。",
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
        preview: "“他在看你。”",
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
        preview: "和平协议仍有效",
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

const initialWalletEvents = () => ([
    { type: "income", source: "元书", amount: 1314.0, time: Date.now() - 3600 * 1000 },
    { type: "balance", amount: 2180.0, time: Date.now() }
]);

const initialContacts = [
    { id: "yuan", name: "元书", tel: "未知线路" },
    { id: "room", name: "室友", tel: "131****8888" },
    { id: "shadow", name: "未知 · 留影", tel: "000-000" },
    { id: "sys", name: "系统通告", tel: "系统广播" }
];

function computeChatPreview(chat) {
    if (!chat || !chat.log || !chat.log.length) return "";
    const last = chat.log[chat.log.length - 1];
    if (last.text) return last.text;
    if (last.kind === "pay") return `转账 ¥${(last.amount || 0).toFixed(2)}`;
    if (last.kind === "red") {
        return `${last.redeemed ? "已收红包" : "红包"} ¥${(last.amount || 0).toFixed(2)}`;
    }
    return "";
}

const unreadOfChats = (chats) => (chats || []).reduce((sum, chat) => sum + (chat.unread || 0), 0);

function latestBalance(events = []) {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === "balance") return events[i].amount || 0;
    }
    return 0;
}

function latestIncome(events = []) {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === "income") return { source: events[i].source, amount: events[i].amount };
    }
    return { source: "", amount: 0 };
}

export const GameState = {
    story: [
        { role: "system", text: "主线从这里开始。你可以先随便说几句，之后我们再把它接到 AI 上。" }
    ],
    contacts: initialContacts,
    chats: initialChats(),
    callHistory: initialCallHistory(),
    walletEvents: initialWalletEvents(),
    moments: initialMoments(),
    triggers: [],
    memoLog: [],
    unread: { total: 0, byApp: { wechat: 0, phone: 0 } },
    lastAppOpened: "home",
    asContext() {
        const summary = {
            lastAppOpened: this.lastAppOpened,
            unread: this.unread,
            story: this.story.slice(-6),
            contacts: this.contacts,
            chats: this.chats.map(chat => ({
                id: chat.id,
                name: chat.name,
                unread: chat.unread,
                preview: computeChatPreview(chat),
                lastMessages: chat.log.slice(-3)
            })),
            callHistory: this.callHistory.slice(0, 5),
            walletEvents: this.walletEvents.slice(-5),
            moments: this.moments.slice(-3),
            triggers: this.triggers.slice(-5)
        };
        return JSON.stringify(summary);
    }
};

function refreshUnread() {
    const totalWechat = unreadOfChats(GameState.chats);
    GameState.unread.byApp.wechat = totalWechat;
    GameState.unread.total = totalWechat + (GameState.unread.byApp.phone || 0);
}
refreshUnread();

const stateListeners = new Set();

function cloneValue(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function resolvePath(path, { createMissing = false } = {}) {
    if (!path) {
        return { parent: null, key: null };
    }
    const segments = Array.isArray(path) ? path : String(path).split(".").filter(Boolean);
    let parent = GameState;
    for (let i = 0; i < segments.length - 1; i++) {
        const key = segments[i];
        if (!(key in parent)) {
            if (createMissing) {
                parent[key] = {};
            } else {
                return { parent: null, key: null };
            }
        }
        parent = parent[key];
    }
    const key = segments[segments.length - 1];
    return { parent, key };
}

function notifyStateChange(path, value) {
    const normalized = path.startsWith("phone.") ? path.slice("phone.".length) : path;
    if (normalized.startsWith("chats")) {
        refreshUnread();
    }
    stateListeners.forEach((listener) => {
        try {
            listener(path, value, GameState);
        } catch (err) {
            console.error("State listener error:", err);
        }
    });
}

export function updateState(path, value, options = {}) {
    const { silent = false } = options;
    if (!path) throw new Error("updateState requires a path");
    const { parent, key } = resolvePath(path, { createMissing: true });
    if (!parent) return;
    parent[key] = value;
    if (!silent) notifyStateChange(path, value);
    return value;
}

export function mutateState(path, mutator, options = {}) {
    const current = cloneValue(getState(path));
    const next = mutator(current);
    return updateState(path, next, options);
}

export function getState(path = "") {
    if (!path) return GameState;
    const segments = Array.isArray(path) ? path : String(path).split(".").filter(Boolean);
    let value = GameState;
    for (const key of segments) {
        if (value == null) return undefined;
        value = value[key];
    }
    return value;
}

export function subscribeState(listener) {
    if (typeof listener !== "function") return () => {};
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
}

const phoneProxy = {};
Object.defineProperties(phoneProxy, {
    unreadByApp: {
        get() { return GameState.unread.byApp; },
        set(val) { GameState.unread.byApp = val; }
    },
    unreadTotal: {
        get() { return GameState.unread.total; },
        set(val) { GameState.unread.total = val; }
    },
    chats: {
        get() { return GameState.chats; },
        set(val) { GameState.chats = val; refreshUnread(); }
    },
    moments: {
        get() { return GameState.moments; },
        set(val) { GameState.moments = val; }
    },
    calls: {
        get() { return GameState.callHistory; },
        set(val) { GameState.callHistory = val; }
    },
    wallet: {
        get() {
            const events = GameState.walletEvents || [];
            return {
                balance: latestBalance(events),
                lastIncome: latestIncome(events)
            };
        },
        set(val = {}) {
            const events = (GameState.walletEvents || []).slice();
            if (typeof val.balance === "number") {
                events.push({ type: "balance", amount: val.balance, time: Date.now() });
            }
            if (val.lastIncome) {
                events.push({
                    type: "income",
                    amount: val.lastIncome.amount || 0,
                    source: val.lastIncome.source || "未知",
                    time: Date.now()
                });
            }
            GameState.walletEvents = events;
        }
    },
    memoLog: {
        get() { return GameState.memoLog; },
        set(val) { GameState.memoLog = val; }
    }
});

GameState.phone = phoneProxy;
