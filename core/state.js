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
    { who: "你", text: "今天只是想确认一件事：你有没有在看我。", time: "刚刚", likes: 23, likedByUser: false, comments: [] },
    { who: "未知信号", text: "今晚的城很安静，像在等一场失控。", time: "1 小时前", likes: 9, likedByUser: false, comments: [] },
    { who: "甜品店老板", text: "提前留了三盒奶油泡芙，希望他别发火。", time: "2 小时前", likes: 12, likedByUser: false, comments: [] }
]);

const initialCalls = () => ([
    { name: "未知来电", time: "刚刚", note: "00:42" },
    { name: "室友", time: "昨天", note: "01:10" },
    { name: "未知号码", time: "前天", note: "未接" }
]);

const unreadOfChats = (chats) => (chats || []).reduce((sum, chat) => sum + (chat.unread || 0), 0);

export const GameState = {
    story: [
        { role: "system", text: "主线从这里开始。你可以先随便说几句，之后我们再把它接到 AI 上。" }
    ],
    phone: {
        unreadByApp: { wechat: 0 },
        unreadTotal: 0,
        chats: initialChats(),
        moments: initialMoments(),
        calls: initialCalls(),
        wallet: {
            balance: 2180.0,
            lastIncome: { from: "元书", amount: 1314.0 }
        },
        memoLog: []
    }
};

GameState.phone.unreadByApp.wechat = unreadOfChats(GameState.phone.chats);
GameState.phone.unreadTotal = GameState.phone.unreadByApp.wechat;

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
