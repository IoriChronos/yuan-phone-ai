import { getState, updateState, subscribeState } from "../core/state.js";
import { askAI } from "../core/ai.js";
import {
    triggerIncomingCall as phoneTriggerIncomingCall,
    triggerOutgoingCall
} from "./phone.js";
import { openPhonePage, showPhoneFloatingAlert } from "../ui/phone.js";
import { triggerIslandNotify } from "../ui/dynamic-island.js";
import {
    incrementMomentsUnread,
    clearMomentsUnread,
    sendMessage as sendWeChatMessage,
    markChatRead as worldMarkChatRead,
    postMoment as worldPostMoment,
    likeMoment as worldLikeMoment,
    commentMoment as worldCommentMoment,
    sendTransfer as walletSendTransfer,
    sendRedPacket as walletSendRedPacket,
    openRedPacket as walletOpenRedPacket
} from "../data/world-state.js";
import { addShortEventMemory } from "../data/memory-short.js";
import { addEventLog } from "../data/events-log.js";

let weChatRuntime = null;
const PLAYER_ID = "player";
const PLAYER_ALIASES = ["你", "自己", "me", "self"];

export function initWeChatApp() {
    const tabs = document.querySelectorAll(".wechat-tabs button");
    const panels = {
        chats: document.getElementById("wechat-chats"),
        moments: document.getElementById("wechat-moments"),
        wallet: document.getElementById("wechat-wallet"),
    };
    const chatWindow = document.getElementById("wechat-chat-window");
    const chatHeadControls = document.getElementById("chat-head-controls");
    const chatLog = document.getElementById("wechat-chat-log");
    const chatInput = document.getElementById("wechat-chat-input");
    const chatSend = document.getElementById("wechat-chat-send");
    const chatBack = document.getElementById("chat-back");
    const wechatTop = document.getElementById("wechat-top");
    const wechatBottom = document.getElementById("wechat-bottom");
    const momentsFeed = document.getElementById("wechat-moments-feed");
    const momentComposerInput = document.getElementById("moment-composer-input");
    const momentComposerSend = document.getElementById("moment-composer-send");
    const chatActionsToggle = document.getElementById("chat-actions-toggle");
    const chatActionsPanel = document.getElementById("chat-actions-panel");
    const chatActionsButtons = document.getElementById("chat-actions-buttons");
    const chatActionButtons = document.querySelectorAll("[data-chataction]");
    const chatActionForm = document.getElementById("chat-action-form");
    const chatActionDisplay = document.getElementById("chat-action-display");
    const chatActionKeypad = document.getElementById("chat-action-keypad");
    const chatActionConfirm = document.getElementById("chat-action-confirm");
    const chatActionCancel = document.getElementById("chat-action-cancel");
    const walletAmtEl = document.getElementById("wallet-balance-amt");
    const redEnvelopeOverlay = document.getElementById("red-envelope-overlay");
    const redEnvelopeAmount = document.getElementById("red-envelope-amount");
    const redEnvelopeConfirm = document.getElementById("red-envelope-confirm");
    const messageBanner = document.getElementById("message-banner");
    const messageBannerTitle = document.getElementById("message-banner-title");
    const messageBannerText = document.getElementById("message-banner-text");
    const momentsTabButton = document.querySelector('[data-wtab="moments"]');
    const chats = getState("phone.chats") || [];
    const moments = getState("phone.moments") || [];
    const wallet = getState("phone.wallet") || { balance: 0 };
    let walletBalance = wallet.balance ?? 0;
    let pendingRedEnvelope = null;
    let chatActionsOpen = false;
    let currentChatAction = null;
    let chatActionValue = "";
    const ACTION_PRESETS = {
        pay: { type: "pay", label: "转账金额（≤1,000,000）", min: 0.01, max: 1000000, defaultValue: 520.00 },
        red: { type: "red", label: "红包金额（0-200）", min: 0, max: 200, defaultValue: 66.00 },
    };
    let messageBannerTimer = null;
    let messageBannerTarget = null;
    let unreadMomentsCount = getState("unreadMomentsCount") || 0;
    updateMomentsBadgeDisplay(unreadMomentsCount);

    function rememberPhoneEvent(text, options = {}) {
        if (!text) return;
        const entry = {
            type: options.type || "event",
            app: options.app || "wechat",
            text,
            meta: options.meta || null,
            time: Date.now()
        };
        try {
            addShortEventMemory(entry);
        } catch (err) {
            console.warn("短期记忆记录失败", err);
        }
        try {
            addEventLog({ text, type: entry.type, time: entry.time });
        } catch (err) {
            console.warn("事件日志写入失败", err);
        }
    }

    function syncUnreadTotals() {
        const totalUnread = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
        const unreadByApp = { ...(getState("phone.unreadByApp") || {}) };
        unreadByApp.wechat = totalUnread;
        updateState("phone.unreadByApp", unreadByApp);
        updateState("phone.unreadTotal", totalUnread);
    }

    function persistChats() {
        syncUnreadTotals();
    }

    function persistMoments() {
        // 数据通过 world-state API 写入，这里只负责刷新 UI。
    }

    function getCallHistory() {
        return getState("phone.calls") || [];
    }

    function getContactsList() {
        return getState("contacts") || [];
    }

    function getMentionContacts() {
        return getContactsList().map(c => ({
            id: c.id,
            name: c.name || c.id
        }));
    }

    function resolveContactIdByName(name = "") {
        if (!name) return null;
        const contact = getContactsList().find(c => c.name === name);
        return contact ? contact.id : null;
    }

    function resolveContactNameById(id) {
        if (!id) return null;
        if (id === PLAYER_ID) return "你";
        const contact = getContactsList().find(c => c.id === id);
        return contact ? contact.name : null;
    }

    function extractMentionedContactIds(text = "") {
        if (!text || !text.includes("@")) return [];
        const contacts = getContactsList();
        const matches = [];
        contacts.forEach(contact => {
            if (!contact?.name) return;
            const pattern = `@${contact.name}`;
            let searchIndex = 0;
            while (searchIndex < text.length) {
                const found = text.indexOf(pattern, searchIndex);
                if (found === -1) break;
                matches.push({ id: contact.id, name: contact.name, index: found });
                searchIndex = found + pattern.length;
            }
        });
        PLAYER_ALIASES.forEach(alias => {
            const pattern = `@${alias}`;
            let searchIndex = 0;
            while (searchIndex < text.length) {
                const found = text.indexOf(pattern, searchIndex);
                if (found === -1) break;
                matches.push({ id: PLAYER_ID, name: alias, index: found });
                searchIndex = found + pattern.length;
            }
        });
        matches.sort((a, b) => a.index - b.index);
        const ordered = [];
        matches.forEach(match => {
            if (!ordered.includes(match.id)) ordered.push(match.id);
        });
        return ordered;
    }

    function insertTextAtCursor(input, text) {
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const before = input.value.slice(0, start);
        const after = input.value.slice(end);
        input.value = `${before}${text}${after}`;
        const nextPos = start + text.length;
        requestAnimationFrame(() => {
            input.selectionStart = input.selectionEnd = nextPos;
            input.focus();
        });
    }

    function ensureMomentAuthor(moment) {
        if (!moment) return null;
        if (!moment.authorId) {
            if (moment.who === "你") {
                moment.authorId = PLAYER_ID;
            } else {
                moment.authorId = resolveContactIdByName(moment.who);
            }
        }
        return moment.authorId;
    }

    function getRandomContact(preferredId) {
        const contacts = getMentionContacts();
        if (!contacts.length) return null;
        if (preferredId) {
            const preferred = contacts.find(c => c.id === preferredId);
            if (preferred) return preferred;
        }
        const pool = contacts.filter(c => c.id !== PLAYER_ID);
        const list = pool.length ? pool : contacts;
        return list[Math.floor(Math.random() * list.length)];
    }

    function pickMomentForEvent(momentId, requirePlayerAuthor = false) {
        const pool = requirePlayerAuthor
            ? moments.filter(m => ensureMomentAuthor(m) === PLAYER_ID)
            : moments.slice();
        if (!pool.length) return null;
        if (momentId) {
            const found = pool.find(m => m.id === momentId);
            if (found) return found;
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function updateMomentsBadgeDisplay(count = unreadMomentsCount) {
        if (!momentsTabButton) return;
        momentsTabButton.classList.toggle("has-unread", count > 0);
    }

    function bumpMomentsUnread(delta = 1) {
        const amount = Number.isFinite(delta) ? delta : 1;
        unreadMomentsCount = Math.max(0, (unreadMomentsCount || 0) + amount);
        updateMomentsBadgeDisplay();
        incrementMomentsUnread(amount);
    }

    function markMomentsAsRead() {
        if (!unreadMomentsCount) {
            updateMomentsBadgeDisplay(0);
            return;
        }
        unreadMomentsCount = 0;
        updateMomentsBadgeDisplay(0);
        clearMomentsUnread();
    }

    function handleMomentNotification(kind, detail = {}) {
        const actorId = detail.actorId;
        const targetAuthorId = detail.momentAuthorId;
        if (kind === "mention") {
            const mentionedIds = (detail.mentionedIds || []).filter(id => id && id !== actorId);
            if (!mentionedIds.includes(PLAYER_ID)) return;
        } else if (kind === "like") {
            if (actorId === PLAYER_ID) return;
            if (targetAuthorId !== PLAYER_ID) return;
        } else {
            if (actorId === PLAYER_ID) return;
        }
        bumpMomentsUnread(1);
        triggerIslandNotify("朋友圈有新动态");
        const label = kind === "mention"
            ? "@ 提醒"
            : kind === "like"
                ? "朋友圈点赞"
                : "朋友圈评论";
        showPhoneFloatingAlert(label, { special: kind === "mention" });
    }

    function resolveCommentAuthorName(comment) {
        if (!comment) return "访客";
        if (comment.authorId === PLAYER_ID) return "你";
        if (comment.authorId) {
            return resolveContactNameById(comment.authorId) || comment.from || "访客";
        }
        return comment.from || "访客";
    }

    async function addMomentComment(moment, text, options = {}) {
        if (!moment || !text) return;
        const {
            type,
            authorId = PLAYER_ID,
            mentionedContactIds,
            triggerEcho = true
        } = typeof options === "object" ? options : {};
        const mentions = (mentionedContactIds && mentionedContactIds.length)
            ? mentionedContactIds
            : extractMentionedContactIds(text);
        const entryType = type || (mentions.length ? "mention" : "comment");
        worldCommentMoment(moment.id, authorId, text, mentions, entryType);
        rememberPhoneEvent(`朋友圈评论 ${moment.who || "访客"}：${text}`, {
            type: entryType === "mention" ? "moment_mention" : "moments",
            app: "moments",
            meta: { momentId: moment.id, mentions }
        });
        const momentAuthorId = ensureMomentAuthor(moment);
        if (authorId !== PLAYER_ID) {
            if (mentions.includes(PLAYER_ID)) {
                handleMomentNotification("mention", {
                    actorId: authorId,
                    mentionedIds: mentions,
                    momentAuthorId
                });
            } else {
                handleMomentNotification("comment", {
                    actorId: authorId,
                    momentAuthorId
                });
            }
        }
        renderMoments();
        if (triggerEcho) {
            try {
                const aiEcho = await askAI(`朋友圈互动：${moment.who} 发布了「${moment.text}」，请跟进一句回复。`);
                if (aiEcho) {
                    await addMomentComment(moment, aiEcho, {
                        type: "ai",
                        authorId: resolveContactIdByName(moment.who) || "npc",
                        triggerEcho: false
                    });
                }
            } catch (err) {
                console.error("AI 评论失败", err);
            }
        }
    }

    function formatChatText(message) {
        if (!message) return "";
        if (message.text) return message.text;
        if (message.kind === "pay" && message.amount != null) {
            return `转账 ¥${message.amount.toFixed(2)}`;
        }
        if (message.kind === "red" && message.amount != null) {
            return message.redeemed ? `已收红包 ¥${message.amount.toFixed(2)}` : `红包 ¥${message.amount.toFixed(2)}`;
        }
        return "";
    }

    function updateWalletDisplay() {
        const latest = getState("phone.wallet")?.balance;
        if (typeof latest === "number") {
            walletBalance = latest;
        }
        if (walletAmtEl) walletAmtEl.textContent = `¥ ${walletBalance.toFixed(2)}`;
    }

    function showMessageBanner(title, text, chatId) {
        if (!messageBanner || !messageBannerTitle || !messageBannerText) return;
        messageBannerTitle.textContent = title || "微信";
        messageBannerText.textContent = text || "";
        messageBannerTarget = chatId || null;
        messageBanner.classList.add("show");
        messageBanner.setAttribute("aria-hidden", "false");
        if (messageBannerTimer) clearTimeout(messageBannerTimer);
        messageBannerTimer = setTimeout(() => hideMessageBanner(), 3200);
    }

    function hideMessageBanner() {
        if (!messageBanner) return;
        messageBanner.classList.remove("show");
        messageBanner.setAttribute("aria-hidden", "true");
        if (messageBannerTimer) {
            clearTimeout(messageBannerTimer);
            messageBannerTimer = null;
        }
        messageBannerTarget = null;
    }

    function notifyChatMessage(chat, msg) {
        if (!chat || !msg) return;
        const preview = formatChatText(msg) || msg.text || "";
        showMessageBanner(chat.name, preview, chat.id);
        showPhoneFloatingAlert(preview.includes("@") ? "@ 提醒" : "新消息");
    }

    if (messageBanner) {
        messageBanner.addEventListener("click", () => {
            if (messageBannerTarget) {
                openPhonePage("wechat-page");
                switchTab("chats");
                openChat(messageBannerTarget);
            }
            hideMessageBanner();
        });
    }

    const walletActions = [
        "转账", "收款", "红包", "扫一扫",
        "卡包", "乘车码", "生活缴费", "更多"
    ];

    function totalUnreadCount() {
        return chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    }

    function renderChats() {
        const wrap = panels.chats;
        if (!wrap) return;
        wrap.innerHTML = "";
        chats.forEach(c => {
            const div = document.createElement("div");
            div.className = "wc-item";
            const meta = `
                <div class="wc-meta">
                    ${c.unread ? `<span class="wc-unread">${c.unread}</span>` : ""}
                    <span class="wc-time">${c.time}</span>
                </div>
            `;
            div.innerHTML = `
                <div class="wc-avatar">${c.icon}</div>
                <div class="wc-main">
                    <div class="wc-name">${c.name}</div>
                    <div class="wc-sub">${c.preview}</div>
                </div>
                ${meta}
            `;
            div.addEventListener("click", () => openChat(c.id));
            wrap.appendChild(div);
        });
        const top = document.getElementById("wechat-top");
        const totalUnread = totalUnreadCount();
        if (top) {
            const chatOpen = chatWindow && chatWindow.style.display !== "none";
            if (!chatOpen) top.textContent = `Wechat (${totalUnread})`;
        }
        const chatBadge = document.getElementById("chat-unread-total");
        if (chatBadge) {
            if (totalUnread > 0) {
                chatBadge.textContent = totalUnread;
                chatBadge.style.display = "inline-flex";
            } else {
                chatBadge.style.display = "none";
            }
        }
    }

    function renderMoments() {
        const wrap = momentsFeed;
        if (!wrap) return;
        wrap.innerHTML = "";
        const mentionContacts = getMentionContacts();
        moments.forEach(m => {
            ensureMomentAuthor(m);
            const div = document.createElement("div");
            div.className = "moment-card";
            div.innerHTML = `
                <div class="wc-name">${m.who}</div>
                <div class="wc-sub">${m.text}</div>
                <div class="moment-meta">
                    <span>${m.time}</span>
                    <span>赞 ${m.likes}</span>
                </div>
                <div class="moment-actions">
                    <button class="like" data-act="like">${m.likedByUser ? "取消赞" : "赞一下"}</button>
                    <button data-act="comment">评论</button>
                    <button data-act="mention">@联系人</button>
                </div>
            `;
            div.querySelector('[data-act="like"]').addEventListener("click", () => {
                toggleOwnMomentLike(m);
            });
            const commentPanel = document.createElement("div");
            commentPanel.className = "moment-comment-panel";
            const commentInput = document.createElement("textarea");
            commentInput.className = "moment-comment-input";
            commentInput.rows = 2;
            commentInput.placeholder = "输入评论…";
            const controls = document.createElement("div");
            controls.className = "moment-comment-controls";
            const sendBtn = document.createElement("button");
            sendBtn.type = "button";
            sendBtn.className = "moment-send-btn";
            sendBtn.textContent = "发送";
            controls.appendChild(sendBtn);
            const mentionMenu = document.createElement("div");
            mentionMenu.className = "mention-menu";
            mentionMenu.setAttribute("aria-hidden", "true");
            if (mentionContacts.length) {
                mentionContacts.forEach(contact => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.textContent = contact.name;
                    btn.addEventListener("click", () => {
                        const snippet = `@${contact.name} `;
                        insertTextAtCursor(commentInput, snippet);
                        mentionMenu.classList.remove("open");
                        mentionMenu.setAttribute("aria-hidden", "true");
                        commentInput.focus();
                    });
                    mentionMenu.appendChild(btn);
                });
            } else {
                const empty = document.createElement("span");
                empty.className = "mention-empty";
                empty.textContent = "暂无联系人";
                mentionMenu.appendChild(empty);
            }
            commentPanel.appendChild(commentInput);
            commentPanel.appendChild(controls);
            commentPanel.appendChild(mentionMenu);
            div.appendChild(commentPanel);
            const commentBtn = div.querySelector('[data-act="comment"]');
            const mentionBtn = div.querySelector('[data-act="mention"]');
            const togglePanel = (show) => {
                const next = typeof show === "boolean" ? show : !commentPanel.classList.contains("show");
                commentPanel.classList.toggle("show", next);
                if (next) {
                    commentInput.focus();
                } else {
                    mentionMenu.classList.remove("open");
                    mentionMenu.setAttribute("aria-hidden", "true");
                }
            };
            const toggleMention = () => {
                togglePanel(true);
                const open = !mentionMenu.classList.contains("open");
                mentionMenu.classList.toggle("open", open);
                mentionMenu.setAttribute("aria-hidden", String(!open));
                if (open) commentInput.focus();
            };
            if (commentBtn) commentBtn.addEventListener("click", () => togglePanel());
            if (mentionBtn) mentionBtn.addEventListener("click", () => toggleMention());
            sendBtn.addEventListener("click", () => {
                const text = commentInput.value.trim();
                if (!text) return;
                const type = text.includes("@") ? "mention" : "comment";
                commentInput.value = "";
                mentionMenu.classList.remove("open");
                mentionMenu.setAttribute("aria-hidden", "true");
                addMomentComment(m, text, {
                    type,
                    authorId: PLAYER_ID
                }).catch(err => console.error(err));
            });
            if (m.comments && m.comments.length) {
                const commentsBlock = document.createElement("div");
                commentsBlock.className = "moment-comments";
                m.comments.forEach(c => {
                    const item = document.createElement("div");
                    item.className = "moment-comment";
                    const authorSpan = document.createElement("span");
                    authorSpan.className = "moment-comment-author";
                    authorSpan.textContent = `${resolveCommentAuthorName(c)}：`;
                    const textSpan = document.createElement("span");
                    textSpan.className = "moment-comment-text";
                    textSpan.textContent = c.text || "";
                    item.appendChild(authorSpan);
                    item.appendChild(textSpan);
                    commentsBlock.appendChild(item);
                });
                div.appendChild(commentsBlock);
            }
            wrap.appendChild(div);
        });
    }

    function publishMoment(text) {
        if (!text) return;
        const entry = worldPostMoment(text, [], PLAYER_ID);
        rememberPhoneEvent(`我发朋友圈：${text}`, {
            type: "moment_post",
            app: "moments",
            meta: { momentId: entry?.id }
        });
        renderMoments();
    }

    function toggleOwnMomentLike(moment) {
        if (!moment) return;
        const action = moment.likedByUser ? "取消赞" : "点赞";
        worldLikeMoment(moment.id, PLAYER_ID, !moment.likedByUser);
        rememberPhoneEvent(`我${action} ${moment.who} 的朋友圈`, {
            type: action === "点赞" ? "moment_like" : "moment_unlike",
            app: "moments",
            meta: { momentId: moment.id }
        });
        renderMoments();
    }

    function registerExternalMomentLike(moment, likerId) {
        if (!moment) return;
        worldLikeMoment(moment.id, likerId, true);
        rememberPhoneEvent(`${resolveContactNameById(likerId) || "访客"} 赞了 ${moment.who} 的朋友圈`, {
            type: "moment_like",
            app: "moments",
            meta: { momentId: moment.id, actorId: likerId }
        });
        renderMoments();
        handleMomentNotification("like", {
            actorId: likerId,
            momentAuthorId: ensureMomentAuthor(moment)
        });
    }

    function renderWallet() {
        const wrap = document.getElementById("wallet-actions");
        if (!wrap) return;
        wrap.innerHTML = "";
        walletActions.forEach(a => {
            const btn = document.createElement("div");
            btn.className = "wallet-btn";
            btn.textContent = a;
            wrap.appendChild(btn);
        });
    }

    function isChatActive(id) {
        return chatWindow && chatWindow.style.display !== "none" && chatWindow.dataset.chat === id;
    }

    function switchTab(target) {
        tabs.forEach(btn => btn.classList.toggle("active", btn.dataset.wtab === target));
        Object.entries(panels).forEach(([key, el]) => {
            if (!el) return;
            if (key === target) {
                el.style.display = key === "moments" ? "flex" : "block";
            } else {
                el.style.display = "none";
            }
        });
        if (chatWindow) chatWindow.style.display = "none";
        if (wechatBottom) wechatBottom.style.display = "grid";
        if (chatHeadControls) chatHeadControls.style.display = "none";
        setChatActions(false);
        hideRedEnvelopeOverlay();
        const unread = totalUnreadCount();
        if (wechatTop) {
            if (target === "chats") wechatTop.textContent = `Wechat (${unread})`;
            else if (target === "moments") wechatTop.textContent = "朋友圈";
            else if (target === "wallet") wechatTop.textContent = "钱包";
        }
        if (target === "chats") hideMessageBanner();
        if (target === "moments") {
            markMomentsAsRead();
        }
    }

    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            switchTab(btn.dataset.wtab);
        });
    });

    function openChat(id) {
        const c = chats.find(x => x.id === id);
        if (!c || !chatWindow || !chatLog) return;
        worldMarkChatRead(id);
        persistChats();
        Object.entries(panels).forEach(([, el]) => {
            if (el) el.style.display = "none";
        });
        setChatActions(false);
        hideRedEnvelopeOverlay();
        hideMessageBanner();
        chatLog.innerHTML = "";
        c.log.forEach(m => {
            const b = document.createElement("div");
            const kind = m.kind ? ` ${m.kind}` : "";
            b.className = "chat-bubble " + (m.from === "in" ? "in" : "out") + kind;
            b.textContent = formatChatText(m);
            const row = document.createElement("div");
            row.className = "chat-row " + (m.from === "in" ? "in" : "out");
            const avatar = document.createElement("div");
            avatar.className = "chat-avatar";
            avatar.textContent = m.from === "in" ? "◻" : "▣";
            row.appendChild(avatar);
            row.appendChild(b);
            if (m.kind === "red" && m.from === "in") {
                b.classList.add("red-bubble-in");
                if (!m.redeemed) {
                    b.classList.add("red-can-open");
                    b.addEventListener("click", () => showRedEnvelopeOverlay(m, id));
                }
            }
            chatLog.appendChild(row);
        });
        chatLog.scrollTop = chatLog.scrollHeight;
        chatWindow.dataset.chat = id;
        chatWindow.style.display = "flex";
        if (wechatBottom) wechatBottom.style.display = "none";
        if (wechatTop) wechatTop.textContent = c.name;
        if (chatHeadControls) chatHeadControls.style.display = "flex";
        renderChats();
    }

    function setChatActions(open) {
        if (!chatActionsPanel || !chatActionsToggle) return;
        const shouldOpen = typeof open === "boolean" ? open : !chatActionsOpen;
        chatActionsOpen = shouldOpen;
        chatActionsPanel.classList.toggle("open", chatActionsOpen);
        chatActionsToggle.classList.toggle("active", chatActionsOpen);
        if (!chatActionsOpen) closeChatActionForm();
    }

    function openChatActionForm(type) {
        if (!chatActionForm || !chatActionsButtons) return;
        const preset = ACTION_PRESETS[type];
        if (!preset) return;
        currentChatAction = { ...preset };
        chatActionValue = preset.defaultValue.toFixed(2);
        chatActionsButtons.style.display = "none";
        chatActionForm.classList.add("show");
        updateChatActionDisplay();
        setChatActions(true);
    }

    function closeChatActionForm() {
        if (chatActionForm) chatActionForm.classList.remove("show");
        if (chatActionsButtons) chatActionsButtons.style.display = "flex";
        currentChatAction = null;
        chatActionValue = "";
    }

    function updateChatActionDisplay() {
        if (!chatActionDisplay) return;
        const num = parseFloat(chatActionValue);
        const formatted = !Number.isNaN(num) ? num.toFixed(2) : "0.00";
        chatActionDisplay.textContent = `¥${formatted}`;
    }

    function handleKeypadInput(key) {
        if (!currentChatAction) return;
        if (key === "←") {
            chatActionValue = chatActionValue.slice(0, -1);
        } else if (key === ".") {
            if (!chatActionValue.includes('.')) {
                chatActionValue = chatActionValue ? chatActionValue + '.' : '0.';
            }
        } else {
            const next = chatActionValue ? chatActionValue + key : key;
            if (chatActionValue.includes('.')) {
                const decimals = chatActionValue.split('.')[1] || "";
                if (decimals.length >= 2) return;
            }
            chatActionValue = next.replace(/^0+(\d)/, '$1');
        }
        updateChatActionDisplay();
    }

    if (chatActionKeypad) {
        const keys = ["1","2","3","4","5","6","7","8","9",".","0","←"];
        chatActionKeypad.innerHTML = "";
        keys.forEach(key => {
            const btn = document.createElement("button");
            btn.textContent = key === "←" ? "⌫" : key;
            btn.dataset.key = key;
            btn.addEventListener("click", () => handleKeypadInput(key));
            chatActionKeypad.appendChild(btn);
        });
    }

    function showRedEnvelopeOverlay(message, chatId) {
        if (!redEnvelopeOverlay || !message) return;
        pendingRedEnvelope = { message, chatId };
        setChatActions(false);
        if (redEnvelopeAmount) {
            const amt = message.amount != null ? message.amount : 0;
            redEnvelopeAmount.textContent = `¥${amt.toFixed(2)}`;
        }
        redEnvelopeOverlay.classList.add("show");
    }

    function hideRedEnvelopeOverlay() {
        if (redEnvelopeOverlay) redEnvelopeOverlay.classList.remove("show");
        pendingRedEnvelope = null;
    }

    function handleIncomingMessage(chat, msg) {
        if (!chat) return;
        const payload = {
            kind: msg.kind,
            amount: msg.amount,
            redeemed: msg.redeemed
        };
        sendWeChatMessage(chat.id, msg.text || formatChatText(msg), "in", payload);
        const updatedChat = getState("phone.chats").find(c => c.id === chat.id) || chat;
        const active = isChatActive(chat.id);
        if (!active) {
            notifyChatMessage(updatedChat, msg);
        }
        persistChats();
        rememberPhoneEvent(`${updatedChat.name} 来信：${formatChatText(msg)}`, {
            type: "wechat",
            app: "wechat",
            meta: { chatId: chat.id, direction: "in" }
        });
        if (active) {
            openChat(chat.id);
        } else {
            renderChats();
        }
    }

    async function sendChat(textOverride, kindOverride, meta = {}) {
        if (!chatWindow || !chatInput) return;
        const id = chatWindow.dataset.chat;
        const c = chats.find(x => x.id === id);
        if (!c) return;
        const text = (textOverride != null ? textOverride : chatInput.value.trim());
        if (!text) return;
        const kind = kindOverride || "";
        const payload = {
            kind,
            amount: meta.amount,
            redeemed: meta.redeemed
        };
        sendWeChatMessage(id, text, "out", payload);
        chatInput.value = "";
        setChatActions(false);
        persistChats();
        rememberPhoneEvent(`我 → ${c.name}：${text}`, {
            type: "wechat",
            app: "wechat",
            meta: { chatId: c.id, direction: "out" }
        });
        openChat(id);
        renderChats();
        try {
            const aiReply = await askAI(`微信中${c.name}听见了「${text}」，他会怎么回？`);
            const replyMsg = { from: "in", text: aiReply || "……" };
            handleIncomingMessage(c, replyMsg);
        } catch (err) {
            console.error("AI 微信回复失败", err);
        }
    }

    if (chatSend) chatSend.addEventListener("click", () => {
        sendChat().catch(err => console.error(err));
    });
    if (chatInput) chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendChat().catch(err => console.error(err));
        }
    });
    if (chatActionsToggle) {
        chatActionsToggle.addEventListener("click", () => {
            setChatActions();
        });
    }
    chatActionButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            openChatActionForm(btn.dataset.chataction);
        });
    });
    if (chatActionConfirm) {
        chatActionConfirm.addEventListener("click", () => {
            if (!currentChatAction) return;
            const amount = parseFloat(chatActionValue || "0");
            if (Number.isNaN(amount)) {
                alert("请输入有效的金额");
                return;
            }
            if (amount < currentChatAction.min || amount > currentChatAction.max) {
                alert(`金额需在 ${currentChatAction.min} - ${currentChatAction.max} 之间`);
                return;
            }
            const formatted = amount.toFixed(2);
            if (currentChatAction.type === "pay") {
                sendChat(`转账 ¥${formatted}`, "pay", { amount });
                walletSendTransfer(-amount, "微信转账");
                updateWalletDisplay();
            } else if (currentChatAction.type === "red") {
                sendChat(`红包 ¥${formatted}`, "red", { amount, redeemed: true });
                walletSendRedPacket(amount);
                updateWalletDisplay();
            }
            closeChatActionForm();
            setChatActions(false);
        });
    }
    if (chatActionCancel) {
        chatActionCancel.addEventListener("click", () => {
            closeChatActionForm();
            setChatActions(false);
        });
    }
    if (redEnvelopeConfirm) {
        redEnvelopeConfirm.addEventListener("click", () => {
            if (pendingRedEnvelope && pendingRedEnvelope.message) {
                const msg = pendingRedEnvelope.message;
                msg.redeemed = true;
                if (msg.amount != null) {
                    msg.text = `已收红包 ¥${msg.amount.toFixed(2)}`;
                    walletOpenRedPacket(msg.id || Date.now(), msg.amount);
                }
                persistChats();
                updateWalletDisplay();
                const activeId = chatWindow ? chatWindow.dataset.chat : null;
                if (activeId && pendingRedEnvelope.chatId === activeId) {
                    openChat(activeId);
                } else {
                    renderChats();
                }
            }
            hideRedEnvelopeOverlay();
        });
    }
    if (redEnvelopeOverlay) {
        redEnvelopeOverlay.addEventListener("click", (e) => {
            if (e.target === redEnvelopeOverlay) {
                hideRedEnvelopeOverlay();
            }
        });
    }
    if (chatBack) chatBack.addEventListener("click", () => {
        if (chatWindow) chatWindow.style.display = "none";
        switchTab("chats");
        hideRedEnvelopeOverlay();
        const top = document.getElementById("wechat-top");
        if (top) top.textContent = `Wechat (${totalUnreadCount()})`;
        hideMessageBanner();
    });

    /* 电话页：记录/联系人/拨号 */
    const callTabs = document.querySelectorAll('[data-ctab]');
    const callPanels = {
        history: document.getElementById("call-history"),
        contacts: document.getElementById("call-contacts"),
        keypad: document.getElementById("call-keypad"),
    };
    const dialDisplay = document.getElementById("dial-display");
    const dialGrid = document.getElementById("dial-grid");
    const dialCall = document.getElementById("dial-call");
    const contacts = [
        { name: "元书", tel: "未知线路" },
        { name: "室友", tel: "131****8888" },
        { name: "学妹", tel: "185****0000" },
    ];
    function renderCallHistory() {
        const wrap = callPanels.history;
        if (!wrap) return;
        wrap.innerHTML = "";
        getCallHistory().forEach(c => {
            const div = document.createElement("div");
            div.className = "call-item";
            div.innerHTML = `
                <div class="top"><span>${c.name}</span><span>${c.time}</span></div>
                <div class="sub">${c.note}</div>
            `;
            wrap.appendChild(div);
        });
    }
    function renderContactsList() {
        const wrap = callPanels.contacts;
        if (!wrap) return;
        wrap.innerHTML = "";
        contacts.forEach(c => {
            const div = document.createElement("div");
            div.className = "call-item";
            div.innerHTML = `<div class="top"><span>${c.name}</span><span>${c.tel}</span></div>`;
            wrap.appendChild(div);
        });
    }
    function renderDial() {
        if (!dialGrid) return;
        const keys = ["1","2","3","4","5","6","7","8","9","*","0","#"];
        dialGrid.innerHTML = "";
        keys.forEach(k => {
            const btn = document.createElement("button");
            btn.className = "dial-key";
            btn.textContent = k;
            btn.addEventListener("click", () => {
                const base = dialDisplay.textContent === "输入号码…" ? "" : dialDisplay.textContent;
                dialDisplay.textContent = base + k;
            });
            dialGrid.appendChild(btn);
        });
        if (dialCall) {
            dialCall.addEventListener("click", () => {
                const num = (dialDisplay.textContent || "").trim() || "未知号码";
                triggerOutgoingCall(num);
                renderCallHistory();
                dialDisplay.textContent = "输入号码…";
                switchCallTab("history");
            });
        }
    }
    function switchCallTab(target) {
        callTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.ctab === target));
        Object.entries(callPanels).forEach(([key, el]) => {
            if (el) el.style.display = (key === target) ? "grid" : "none";
        });
    }
    callTabs.forEach(btn => btn.addEventListener("click", () => switchCallTab(btn.dataset.ctab)));
    renderCallHistory();
    subscribeState((path, detail) => {
        if (path === "phone.calls") {
            renderCallHistory();
        }
        if (path === "moments:unread" || path === "state:unreadMomentsCount") {
            const next = typeof detail?.count === "number"
                ? detail.count
                : (getState("unreadMomentsCount") || 0);
            unreadMomentsCount = next;
            updateMomentsBadgeDisplay(unreadMomentsCount);
        }
    });
    renderContactsList();
    renderDial();
    switchCallTab("history");

    if (momentComposerSend && momentComposerInput) {
        momentComposerSend.addEventListener("click", () => {
            const text = momentComposerInput.value.trim();
            if (!text) return;
            publishMoment(text);
            momentComposerInput.value = "";
        });
    }

    weChatRuntime = {
        chats,
        moments,
        handleIncomingMessage,
        renderChats,
        renderMoments,
        renderWallet,
        persistMoments,
        addMomentComment,
        publishMoment,
        resolveContactIdByName,
        extractMentionedContactIds,
        registerExternalMomentLike,
        pickMomentForEvent: (momentId, requirePlayerAuthor) => pickMomentForEvent(momentId, requirePlayerAuthor),
        getRandomContact: (preferredId) => getRandomContact(preferredId)
    };

    renderChats();
    renderMoments();
    renderWallet();
    switchTab("chats");

    updateWalletDisplay();

    // 黑雾点击：注入消息+转账，触发岛通知
    document.querySelectorAll('.app-icon[data-target="darkfog-page"]').forEach(icon => {
        icon.addEventListener('click', () => {
            const targetChat = chats.find(x => x.id === "yuan");
            if (targetChat) {
                const wasActive = isChatActive(targetChat.id);
                sendWeChatMessage(targetChat.id, "黑雾覆盖：他在看你。", "in");
                sendWeChatMessage(targetChat.id, "红包 ¥18.00", "in", { kind: "red", amount: 18.00, redeemed: false });
                sendWeChatMessage(targetChat.id, "转账 ¥66.00", "in", { kind: "pay", amount: 66.00 });
                walletSendTransfer(66, "黑雾注入");
                updateWalletDisplay();
                if (wasActive) {
                    openChat(targetChat.id);
                } else {
                    notifyChatMessage(targetChat, targetChat.log[targetChat.log.length - 1]);
                }
                persistChats();
                renderChats();
            }
        });
    });

    // 守望：触发来电
    document.querySelectorAll('.app-icon[data-target="watch-page"]').forEach(icon => {
        icon.addEventListener('click', () => {
            phoneTriggerIncomingCall("守望 · 来电");
            renderCallHistory();
        });
    });
}

export async function triggerWeChatNotification(reason = "剧情") {
    if (!weChatRuntime || !weChatRuntime.chats?.length) return;
    const target = weChatRuntime.chats[Math.floor(Math.random() * weChatRuntime.chats.length)];
    if (!target) return;
    try {
        const aiText = await askAI(`请用${target.name}的语气推送一条微信提醒，缘由：${reason}`);
        const msg = { from: "in", text: aiText || "……" };
        weChatRuntime.handleIncomingMessage(target, msg);
        showPhoneFloatingAlert("微信提醒");
    } catch (err) {
        console.error("触发微信通知失败", err);
    }
}

export async function triggerMomentsNotification(detail = {}) {
    if (!weChatRuntime || !weChatRuntime.moments?.length) return;
    const type = detail.type || "comment";
    const requirePlayerMoment = type === "like";
    const target = weChatRuntime.pickMomentForEvent?.(detail.momentId, requirePlayerMoment);
    if (!target) return;
    const contact = weChatRuntime.getRandomContact?.(detail.contactId) || { id: "npc", name: "未知信号" };
    if (type === "like") {
        if (contact.id === PLAYER_ID) return;
        weChatRuntime.registerExternalMomentLike?.(target, contact.id);
        return;
    }
    try {
        let text = detail.text || await askAI(`朋友圈中「${target.text}」，请写一句简短评论。`);
        if (!text) text = "……";
        if (type === "mention" && !text.includes("@")) {
            text = `${text} @你`;
        }
        await weChatRuntime.addMomentComment(target, text, {
            authorId: contact.id,
            mentionedContactIds: detail.mentionedContactIds,
            triggerEcho: false
        });
    } catch (err) {
        console.error("朋友圈触发失败", err);
    }
}

export function refreshWeChatUI() {
    if (!weChatRuntime) return;
    weChatRuntime.renderChats();
    weChatRuntime.renderMoments();
    weChatRuntime.renderWallet?.();
}
