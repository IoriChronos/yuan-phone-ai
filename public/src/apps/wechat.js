import { getState, updateState, subscribeState } from "../core/state.js";
import { WALLET_DEFAULT } from "../config.js";
import { askAI } from "../core/ai.js";
import {
    triggerIncomingCall as phoneTriggerIncomingCall,
    triggerOutgoingCall
} from "./phone.js";
import { openPhonePage, showPhoneFloatingAlert, isPhoneCurrentlyVisible } from "../ui/phone.js";
import { triggerIslandNotify } from "../ui/dynamic-island.js";
import {
    incrementMomentsUnread,
    clearMomentsUnread,
    sendMessage as sendWeChatMessage,
    withdrawChatMessage,
    markChatRead as worldMarkChatRead,
    postMoment as worldPostMoment,
    deleteMoment,
    likeMoment as worldLikeMoment,
    setMomentVisibility,
    commentMoment as worldCommentMoment,
    appendSystemMessage,
    sendTransfer as walletSendTransfer,
    sendRedPacket as walletSendRedPacket,
    openRedPacket as walletOpenRedPacket,
    blockChat,
    setChatPinned,
    addMemoEntry as logMemoEntry
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
    const wechatPage = document.getElementById("wechat-page");
    const chatWindow = document.getElementById("wechat-chat-window");
    const chatHeadControls = document.getElementById("chat-head-controls");
    const chatRecallBtn = document.getElementById("chat-recall-btn");
    const contactsAddBtn = document.getElementById("contacts-add-btn");
    const chatTitle = document.getElementById("chat-title");
    const chatStatusText = document.getElementById("chat-status-text");
    const chatLog = document.getElementById("wechat-chat-log");
    const chatInput = document.getElementById("wechat-chat-input");
    const chatSend = document.getElementById("wechat-chat-send");
    const chatBack = document.getElementById("chat-back");
    const wechatTop = document.getElementById("wechat-top");
    const wechatBottom = document.getElementById("wechat-bottom");
    const momentsFeed = document.getElementById("wechat-moments-feed");
    const momentComposerInput = document.getElementById("moment-composer-input");
    const momentComposerSend = document.getElementById("moment-composer-send");
    const momentComposerActions = document.querySelector(".moment-composer-actions");
    const momentVisibilityDefault = getState("momentVisibilityDays") || 7;
    let momentVisibilityDays = momentVisibilityDefault;
    const chatActionsToggle = document.getElementById("chat-actions-toggle");
    const chatActionsPanel = document.getElementById("chat-actions-panel");
    const chatActionsButtons = document.getElementById("chat-actions-buttons");
    const chatActionButtons = document.querySelectorAll("[data-chataction]");
    const chatActionForm = document.getElementById("chat-action-form");
    let chatActionDisplay = document.getElementById("chat-action-display");
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
    const moments = getState("phone.moments") || [];
    const wallet = syncWalletState();
    let walletBalance = wallet.balance ?? 0;
    const WALLET_EVENT_ID = "wallet-inline-list";
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
    const momentNotifications = [];
    let pendingMomentDelete = null;
    const visibilityOptions = [
        { value: 1, label: "1天" },
        { value: 3, label: "3天" },
        { value: 7, label: "7天" },
        { value: "self", label: "仅自己" }
    ];

    const chatMenuBtn = document.getElementById("chat-menu-btn");
    const chatHeadMenu = document.getElementById("chat-head-menu");
    const chatContextMenu = document.getElementById("chat-context-menu");
    const addFriendButton = document.getElementById("contacts-add-btn");
    const addFriendModal = document.getElementById("add-friend-modal");
    const addFriendInput = document.getElementById("add-friend-input");
    const addFriendConfirm = document.getElementById("add-friend-confirm");
    const addFriendCancel = document.getElementById("add-friend-cancel");
    const momentDeleteModal = document.getElementById("moment-delete-modal");
    const momentDeleteConfirm = document.getElementById("moment-delete-confirm");
    const momentDeleteCancel = document.getElementById("moment-delete-cancel");
    const momentsNoticeRail = document.getElementById("moments-notice-rail");
    const momentsNoticePanel = document.getElementById("moments-notice-panel");
    const momentsNoticeClose = document.getElementById("moments-notice-close");
    const momentsNoticeList = document.getElementById("moments-notice-list");



    function getAllChats() {
        return getState("phone.chats") || [];
    }

    function syncUnreadTotals() {
        const totalUnread = getAllChats().reduce((sum, c) => sum + (c.unread || 0), 0);
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
        const pool = (requirePlayerAuthor
            ? moments.filter(m => ensureMomentAuthor(m) === PLAYER_ID)
            : moments.slice()).filter(m => !m.deleted);
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

    function getActiveChat() {
        const activeId = chatWindow?.dataset?.chat;
        if (!activeId) return null;
        const chatList = getAllChats();
        return chatList.find(c => c.id === activeId) || null;
    }

    function updateChatInputState(chat) {
        const blocked = Boolean(chat?.blocked);
        if (chatInput) chatInput.disabled = blocked;
        if (chatSend) chatSend.disabled = blocked;
        if (chatActionsToggle) chatActionsToggle.disabled = blocked;
    }

    function toggleAddFriendButton(show) {
        if (!contactsAddBtn) return;
        contactsAddBtn.style.display = show ? "inline-flex" : "none";
    }

    function setWeChatMode(mode) {
        if (!wechatPage) return;
        const modes = ["list", "moments", "wallet", "chat"];
        modes.forEach(m => wechatPage.classList.remove(`mode-${m}`));
        if (mode && modes.includes(mode)) {
            wechatPage.classList.add(`mode-${mode}`);
        }
    }

    function toggleMainHeader(show, text) {
        if (wechatTop) {
            wechatTop.style.visibility = show ? "visible" : "hidden";
            if (typeof text === "string") wechatTop.textContent = text;
        }
        toggleAddFriendButton(show && (!chatWindow || chatWindow.style.display === "none"));
    }

    function updateChatActionControls(chat) {
        updateChatRecallControl(chat);
        const statusParts = [];
        if (chat?.pinned) {
            statusParts.push("置顶");
        }
        if (chat?.blocked) {
            statusParts.push("已拉黑");
        }
        if (chatTitle) {
            chatTitle.textContent = chat?.name || "";
        }
        if (chatStatusText) {
            chatStatusText.textContent = statusParts.join(" · ");
            chatStatusText.style.opacity = statusParts.length ? "0.8" : "0";
        }
        updateChatInputState(chat);
    }

    let contextTarget = null;
    let longPressTimer = null;
    let contextTimer = null;

    function showChatContextMenuAt(row, x, y) {
        if (!chatContextMenu || !row) return;
        const chatId = row.dataset.chatId;
        const msgIndex = row.dataset.msgIndex;
        if (!chatId) return;
        // skip recalled or non-out messages
        const chat = getAllChats().find(c => c.id === chatId);
        const entry = chat?.log?.[msgIndex];
        if (!entry || entry.from !== "out" || entry.recalled) return;
        contextTarget = chatId;
        if (contextTimer) {
            clearTimeout(contextTimer);
            contextTimer = null;
        }
        const menuRect = chatContextMenu.getBoundingClientRect();
        const posX = Math.min(x, window.innerWidth - menuRect.width - 12);
        const posY = Math.min(y, window.innerHeight - menuRect.height - 12);
        chatContextMenu.style.left = `${posX}px`;
        chatContextMenu.style.top = `${posY}px`;
        chatContextMenu.classList.add("show");
        chatContextMenu.dataset.chatId = chatId;
        if (msgIndex != null) {
            chatContextMenu.dataset.msgIndex = msgIndex;
        } else {
            chatContextMenu.removeAttribute("data-msg-index");
        }
    }

    function closeChatContextMenu() {
        if (!chatContextMenu) return;
        chatContextMenu.classList.remove("show");
        chatContextMenu.removeAttribute("data-chat-id");
        chatContextMenu.removeAttribute("data-msg-index");
        contextTarget = null;
    }

    function attemptContextMenu(event) {
        const row = event.target.closest(".chat-row");
        if (!row || row.dataset.from !== "out") return;
        const { clientX, clientY } = event.touches?.[0] || event;
        event.preventDefault();
        showChatContextMenuAt(row, clientX, clientY);
    }

    function handleContextRecall() {
        const chatId = chatContextMenu?.dataset?.chatId;
        const msgIndexAttr = chatContextMenu?.dataset?.msgIndex;
        const msgIndex = msgIndexAttr != null ? Number(msgIndexAttr) : null;
        if (!chatId) return;
        withdrawChatMessage(chatId, msgIndex);
        renderChats();
        openChat(chatId);
        showMessageBanner("微信", "你撤回了一条消息。");
        closeChatContextMenu();
    }

    function handleChatMenuAction(action) {
        const chat = getActiveChat();
        if (!chat) return;
        if (action === "pin") {
            const next = !chat.pinned;
            setChatPinned(chat.id, next);
            showPhoneFloatingAlert("微信", next ? "已置顶" : "取消置顶");
        } else if (action === "block") {
            const next = !chat.blocked;
            blockChat(chat.id, next);
            appendSystemMessage(chat.id, next ? "你已将对方拉黑。" : "你已解除拉黑。", { kind: "tip" });
            showPhoneFloatingAlert("微信", next ? "已拉黑" : "已解除拉黑");
        }
        renderChats();
        const updated = getActiveChat();
        updateChatActionControls(updated);
        chatHeadMenu?.classList.remove("show");
    }

    function openAddFriendModal() {
        if (!addFriendModal) return;
        if (addFriendInput) addFriendInput.value = "";
        addFriendModal.classList.add("show");
        addFriendModal.setAttribute("aria-hidden", "false");
    }

    function closeAddFriendModal() {
        if (!addFriendModal) return;
        addFriendModal.classList.remove("show");
        addFriendModal.setAttribute("aria-hidden", "true");
    }

    function submitAddFriend() {
        if (!addFriendInput) return closeAddFriendModal();
        const raw = addFriendInput.value.trim();
        if (!raw) {
            showPhoneFloatingAlert("微信", "请输入名称");
            return;
        }
        const contacts = getContactsList();
        if (contacts.find(c => c.name === raw)) {
            showPhoneFloatingAlert("微信", "该好友已存在");
            closeAddFriendModal();
            return;
        }
        const chatsList = getAllChats();
        const newId = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `friend-${Date.now()}`;
        const newContact = {
            id: newId,
            name: raw,
            tel: "未知线路",
            icon: raw[0] || "✦"
        };
        const newChat = {
            id: newId,
            name: raw,
            icon: newContact.icon,
            time: "刚刚",
            unread: 0,
            log: [],
            preview: "",
            pinned: false,
            blocked: false,
            orderIndex: chatsList.length
        };
        updateState("contacts", [...contacts, newContact]);
        updateState("phone.chats", [...chatsList, newChat]);
        renderChats();
        closeAddFriendModal();
        logMemoEntry(`添加好友：${raw}`);
        showPhoneFloatingAlert("微信", "好友请求已发送");
    }

    function openMomentDeleteModal(moment) {
        if (!momentDeleteModal || !moment) return;
        pendingMomentDelete = moment;
        momentDeleteModal.classList.add("show");
        momentDeleteModal.setAttribute("aria-hidden", "false");
    }

    function closeMomentDeleteModal() {
        if (!momentDeleteModal) return;
        pendingMomentDelete = null;
        momentDeleteModal.classList.remove("show");
        momentDeleteModal.setAttribute("aria-hidden", "true");
    }

    function confirmMomentDelete() {
        if (!pendingMomentDelete) return;
        deleteMoment(pendingMomentDelete.id);
        renderMoments();
        closeMomentDeleteModal();
        showPhoneFloatingAlert("朋友圈", "已删除该动态");
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
        queueMomentNotification(kind, detail);
    }

    function queueMomentNotification(kind, detail = {}) {
        const label = kind === "mention"
            ? "@ 提醒"
            : kind === "like"
                ? "朋友圈点赞"
                : "朋友圈评论";
        const who = detail.fromName || detail.authorName || detail.who || detail.contactName || "";
        const namePrefix = who ? `${who}：` : "";
        const entry = {
            id: `notice-${kind}-${Date.now()}`,
            kind,
            label,
            momentId: detail.momentId,
            text: namePrefix + (detail.snippet || detail.momentText || label),
            time: detail.time || Date.now()
        };
        momentNotifications.unshift(entry);
        if (momentNotifications.length > 12) {
            momentNotifications.pop();
        }
        renderMomentNoticeRail();
    }

    function renderMomentNoticeRail() {
        if (!momentsNoticeRail) return;
        const has = momentNotifications.length > 0;
        momentsNoticeRail.style.display = "block";
        momentsNoticeRail.classList.toggle("has-notice", has);
        momentsNoticeRail.dataset.count = has ? momentNotifications.length : "";
        let label = momentsNoticeRail.querySelector(".notice-label");
        if (!label) {
            label = document.createElement("span");
            label.className = "notice-label";
            momentsNoticeRail.appendChild(label);
        }
        label.textContent = has ? "未读通知" : "";
    }

    function openMomentNoticePanel() {
        if (!momentsNoticePanel) return;
        if (panels.moments) {
            panels.moments.scrollTop = 0;
        }
        renderMomentNoticeList();
        momentsNoticePanel.classList.add("show");
        momentsNoticePanel.setAttribute("aria-hidden", "false");
        // 已查看未读，清空未读标签
        renderMomentNoticeRail();
        if (panels.moments) {
            panels.moments.classList.add("notice-open");
            panels.moments.style.overflow = "hidden";
        }
    }

    function closeMomentNoticePanel() {
        if (!momentsNoticePanel) return;
        momentsNoticePanel.classList.remove("show");
        momentsNoticePanel.setAttribute("aria-hidden", "true");
        if (panels.moments) {
            panels.moments.classList.remove("notice-open");
            panels.moments.style.overflow = "";
        }
    }

    function renderMomentNoticeList() {
        if (!momentsNoticeList) return;
        momentsNoticeList.innerHTML = "";
        momentNotifications.forEach(entry => {
            const item = document.createElement("div");
            item.className = "moments-notice-item";
            item.innerHTML = `
                <strong>${entry.label}</strong>
                <p>${entry.text}</p>
                <small>${new Date(entry.time).toLocaleTimeString()}</small>
            `;
            item.addEventListener("click", () => {
                closeMomentNoticePanel();
                if (entry.momentId) {
                    openMomentById(entry.momentId);
                }
            });
            momentsNoticeList.appendChild(item);
        });
    }

    function openMomentById(momentId) {
        if (!momentId) return;
        switchTab("moments");
        renderMoments();
        requestAnimationFrame(() => {
            const card = document.querySelector(`[data-moment-card="${momentId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
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
        const momentAuthorId = ensureMomentAuthor(moment);
        if (authorId !== PLAYER_ID) {
            if (mentions.includes(PLAYER_ID)) {
                handleMomentNotification("mention", {
                    actorId: authorId,
                    mentionedIds: mentions,
                    momentAuthorId,
                    momentId: moment.id,
                    snippet: text
                });
            } else {
                handleMomentNotification("comment", {
                    actorId: authorId,
                    momentAuthorId,
                    momentId: moment.id,
                    snippet: text
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
        const walletState = getState("phone.wallet") || { balance: 0, events: [] };
        const latest = walletState.balance;
        walletBalance = typeof latest === "number" ? latest : 0;
        if (walletAmtEl) walletAmtEl.textContent = `¥ ${walletBalance.toFixed(2)}`;
        updateWalletInlineDetail(walletState);
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

    window.addEventListener("wallet:changed", (ev) => {
        const detail = ev?.detail || {};
        const delta = Number(detail.delta) || 0;
        const abs = Math.abs(delta).toFixed(2);
        const sign = delta >= 0 ? "+" : "-";
        const body = `零钱变动：${detail.source || "钱包"} ${sign}¥${abs}`;
        showMessageBanner("微信", body, null);
        showPhoneFloatingAlert("微信：零钱变动", { force: true });
        updateWalletDisplay();
    });

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
        "转账", "收款", "零钱包", "扫一扫",
        "卡包", "乘车码", "生活缴费", "更多"
    ];

    function syncWalletState() {
        // unify phone.wallet and legacy wallet; default test balance from config
        const phoneWallet = getState("phone.wallet");
        const legacyWallet = getState("wallet");
        const base = phoneWallet || legacyWallet || WALLET_DEFAULT;
        if (!phoneWallet) updateState("phone.wallet", base);
        if (!legacyWallet || legacyWallet.balance !== base.balance) updateState("wallet", base);
        return getState("phone.wallet") || base;
    }

    function totalUnreadCount() {
        return getAllChats().reduce((sum, c) => sum + (c.unread || 0), 0);
    }

    function renderChats() {
        const wrap = panels.chats;
        if (!wrap) return;
        wrap.innerHTML = "";
        const chats = [...getAllChats()].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (b.pinned && !a.pinned) return 1;
            return (b.time || 0) - (a.time || 0);
        });
        chats.forEach(c => {
            const div = document.createElement("div");
            div.className = "wc-item";
            if (c.pinned) div.classList.add("wc-item-pinned");
            if (c.blocked) div.classList.add("wc-item-blocked");
            const statusBadges = [];
            if (c.pinned) statusBadges.push('<span class="wc-pin">置顶</span>');
            if (c.blocked) statusBadges.push('<span class="wc-blocked">拉黑</span>');
            const meta = `
                <div class="wc-meta">
                    ${statusBadges.join("")}
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

    function updateChatRecallControl(chat) {
        if (!chatRecallBtn) return;
        const hasOutgoing = chat && Array.isArray(chat.log) && chat.log.some(m => m.from === "out");
        chatRecallBtn.style.display = hasOutgoing ? "inline-flex" : "none";
    }

    function renderMoments() {
        const wrap = momentsFeed;
        if (!wrap) return;
        wrap.innerHTML = "";
        const mentionContacts = getMentionContacts();
        const helper = document.createElement("div");
        helper.className = "moment-visibility-tip";
        helper.textContent = "可见性决定 AI 可读取的朋友圈范围，不影响你自己查看历史";
        wrap.appendChild(helper);
        const visibleMoments = moments.filter(m => !m.deleted);
        visibleMoments.forEach(m => {
            ensureMomentAuthor(m);
            const div = document.createElement("div");
            div.className = "moment-card";
            div.dataset.momentCard = m.id;
            div.dataset.momentAuthor = m.authorId;
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
            const actionsEl = div.querySelector(".moment-actions");
            const meta = div.querySelector(".moment-meta");
            if (meta && m.createdAt) {
                const real = document.createElement("span");
                const dt = new Date(m.createdAt);
                real.className = "moment-real-time";
                real.textContent = dt.toLocaleString();
                meta.appendChild(real);
            }
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
            if (m.authorId === PLAYER_ID && actionsEl) {
                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "moment-delete-btn";
                deleteBtn.textContent = "删除";
                deleteBtn.addEventListener("click", (event) => {
                    event.stopPropagation();
                    openMomentDeleteModal(m);
                });
                actionsEl.appendChild(deleteBtn);
            }
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
        worldPostMoment(text, [], PLAYER_ID, momentVisibilityDays);
        renderMoments();
    }

    function toggleOwnMomentLike(moment) {
        if (!moment || moment.deleted) return;
        worldLikeMoment(moment.id, PLAYER_ID, !moment.likedByUser);
        renderMoments();
    }

    function registerExternalMomentLike(moment, likerId) {
        if (!moment || moment.deleted) return;
        worldLikeMoment(moment.id, likerId, true);
        renderMoments();
        handleMomentNotification("like", {
            actorId: likerId,
            momentAuthorId: ensureMomentAuthor(moment),
            momentId: moment.id,
            snippet: moment.text
        });
    }

    function renderWallet() {
        const wrap = document.getElementById("wallet-actions");
        const walletPanel = document.getElementById("wechat-wallet");
        if (!wrap || !walletPanel) return;
        wrap.innerHTML = "";
        walletActions.forEach(a => {
            const btn = document.createElement("div");
            btn.className = "wallet-btn";
            btn.textContent = a;
            if (a === "零钱包") {
                btn.addEventListener("click", () => toggleWalletDetail(walletPanel));
            }
            wrap.appendChild(btn);
        });
        const sub = document.querySelector(".wallet-balance .sub");
        const walletState = getState("phone.wallet") || getState("wallet") || {};
        const events = walletState.events || [];
        const latest = events[0];
        if (sub && latest) {
            const sign = latest.type === "expense" ? "-" : "+";
            const amt = (latest.amount || 0).toFixed(2);
            sub.textContent = `最近变动：${sign}¥${amt} · ${latest.source || "记录"}`;
        } else if (sub) {
            sub.textContent = "最近变动：暂无记录";
        }
        const logList = document.getElementById("wallet-events");
        if (logList && logList.remove) logList.remove();
    }

    function toggleWalletDetail(walletPanel) {
        if (!walletPanel) return;
        let detail = walletPanel.querySelector("#wallet-inline-detail");
        if (!detail) {
            detail = document.createElement("div");
            detail.id = "wallet-inline-detail";
            detail.className = "wallet-inline-detail";
            walletPanel.appendChild(detail);
        }
        const walletState = getState("phone.wallet") || getState("wallet") || {};
        const events = walletState.events || [];
        const balance = walletState.balance ?? walletBalance ?? 0;
        const recent = events.slice(0, 5);
        detail.innerHTML = `
            <h4>零钱</h4>
            <div class="wallet-inline-balance">¥${(balance || 0).toFixed(2)}</div>
            <ul class="wallet-inline-list">
                ${
                    recent.length
                        ? recent.map(ev => {
                            const sign = ev.type === "expense" ? "-" : "+";
                            const amt = (ev.amount || 0).toFixed(2);
                            return `<li><span>${ev.source || "记录"}</span><em>${sign}¥${amt}</em></li>`;
                        }).join("")
                        : "<li class=\"empty\">暂无流水</li>"
                }
            </ul>
            <div class="wallet-inline-actions">
                <button class="ui-btn ui-ghost" data-act="withdraw" type="button">提现</button>
                <button class="ui-btn ui-ghost" data-act="deposit" type="button">充值</button>
            </div>
        `;
        detail.querySelectorAll(".wallet-inline-actions button").forEach(btn => {
            btn.addEventListener("click", () => {
                const sub = document.querySelector(".wallet-balance .sub");
                if (sub) sub.textContent = btn.dataset.act === "withdraw" ? "提现申请已创建" : "充值入口待接入";
            });
        });
        detail.classList.toggle("show");
    }

    function updateWalletInlineDetail(stateOverride) {
        const detail = document.getElementById("wallet-inline-detail");
        if (!detail || !detail.classList.contains("show")) return;
        const walletState = stateOverride || getState("phone.wallet") || { balance: 0, events: [] };
        walletBalance = walletState.balance ?? 0;
        const balanceEl = detail.querySelector(".wallet-inline-balance");
        if (balanceEl) balanceEl.textContent = `¥${(walletBalance || 0).toFixed(2)}`;
        const list = detail.querySelector(".wallet-inline-list");
        if (list) {
            const recent = (walletState.events || []).slice(0, 5);
            list.innerHTML = recent.length
                ? recent.map(ev => {
                    const sign = ev.type === "expense" ? "-" : "+";
                    const amt = (ev.amount || 0).toFixed(2);
                    return `<li><span>${ev.source || "记录"}</span><em>${sign}¥${amt}</em></li>`;
                }).join("")
                : "<li class=\"empty\">暂无流水</li>";
        }
    }

    function isChatActive(id) {
        const phoneOpen = typeof isPhoneCurrentlyVisible === "function"
            ? isPhoneCurrentlyVisible()
            : document.body?.classList?.contains("phone-open");
        if (!phoneOpen) return false;
        const wechatVisible = wechatPage && wechatPage.style.display !== "none";
        if (!wechatVisible) return false;
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
        toggleAddFriendButton(target === "chats");
        toggleMainHeader(target === "chats", target === "chats" ? `Wechat (${totalUnreadCount()})` : wechatTop?.textContent);
        setWeChatMode(target === "chats" ? "list" : target === "moments" ? "moments" : target === "wallet" ? "wallet" : "list");
        setChatActions(false);
        hideRedEnvelopeOverlay();
        const unread = totalUnreadCount();
        if (target === "chats") {
            toggleMainHeader(true, `Wechat (${unread})`);
        } else if (target === "moments") {
            toggleMainHeader(true, "朋友圈");
        } else if (target === "wallet") {
            toggleMainHeader(true, "钱包");
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

    if (momentComposerActions) {
        const visWrap = document.createElement("div");
        visWrap.className = "moment-visibility-row";
        const label = document.createElement("span");
        label.className = "moment-visibility-label";
        label.textContent = "可见天数";
        const select = document.createElement("select");
        select.className = "moment-visibility-select";
        visibilityOptions.forEach(opt => {
            const option = document.createElement("option");
            option.value = String(opt.value);
            option.textContent = opt.label;
            select.appendChild(option);
        });
        select.value = String(momentVisibilityDays);
        select.addEventListener("change", () => {
            const raw = select.value;
            momentVisibilityDays = raw === "self" ? "self" : Number(raw) || 7;
            updateState("momentVisibilityDays", momentVisibilityDays);
            moments.forEach(m => setMomentVisibility(m.id, momentVisibilityDays));
            renderMoments();
        });
        visWrap.appendChild(label);
        visWrap.appendChild(select);
        momentComposerActions.insertBefore(visWrap, momentComposerActions.firstChild);
    }

    function openChat(id) {
        const c = getAllChats().find(x => x.id === id);
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
        c.log.forEach((m, idx) => {
            const b = document.createElement("div");
            const kindClass = m.kind ? ` ${m.kind}` : "";
            const isTip = m.from === "system" || m.kind === "notice" || m.kind === "tip";
            b.className = (isTip ? "chat-tip-bubble" : "chat-bubble " + (m.from === "in" ? "in" : "out") + kindClass);
            b.textContent = formatChatText(m);
            if (m.recalled) b.classList.add("chat-recalled");
            const row = document.createElement("div");
            row.className = "chat-row " + (isTip ? "system-tip" : (m.from === "system" ? "system" : (m.from === "in" ? "in" : "out")));
            row.dataset.chatId = c.id;
            row.dataset.msgIndex = idx;
            row.dataset.from = m.from;
            if (m.recalled) row.dataset.recalled = "1";
            if (!isTip && m.from !== "system") {
                const avatar = document.createElement("div");
                avatar.className = "chat-avatar";
                avatar.textContent = m.from === "in" ? "◻" : "▣";
                row.appendChild(avatar);
            }
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
        toggleMainHeader(false);
        setWeChatMode("chat");
        // keep the top title showing total/unread when list is visible; chat title lives inside header
        if (chatTitle) chatTitle.textContent = c.name;
        if (chatHeadControls) chatHeadControls.style.display = "flex";
        renderChats();
        updateChatActionControls(c);
        toggleAddFriendButton(false);
    }

    function setChatActions(open) {
        if (!chatActionsPanel || !chatActionsToggle) return;
        const shouldOpen = typeof open === "boolean" ? open : !chatActionsOpen;
        chatActionsOpen = shouldOpen;
        chatActionsPanel.classList.toggle("open", chatActionsOpen);
        chatActionsToggle.classList.toggle("active", chatActionsOpen);
        if (!chatActionsOpen) closeChatActionForm();
    }

    function ensureChatActionInput() {
        if (chatActionDisplay && chatActionDisplay.tagName === "INPUT") return;
        const replacement = document.createElement("input");
        replacement.type = "number";
        replacement.step = "0.01";
        replacement.min = "0";
        replacement.id = "chat-action-display";
        replacement.className = "chat-action-display";
        replacement.placeholder = "金额";
        replacement.addEventListener("input", () => {
            const num = parseFloat(replacement.value);
            chatActionValue = Number.isNaN(num) ? "" : replacement.value;
        });
        if (chatActionDisplay && chatActionDisplay.parentNode) {
            chatActionDisplay.parentNode.replaceChild(replacement, chatActionDisplay);
        }
        chatActionDisplay = replacement;
    }

    function openChatActionForm(type) {
        if (!chatActionForm || !chatActionsButtons) return;
        const preset = ACTION_PRESETS[type];
        if (!preset) return;
        ensureChatActionInput();
        currentChatAction = { ...preset };
        chatActionValue = "";
        chatActionsButtons.style.display = "none";
        chatActionForm.classList.add("show");
        updateChatActionDisplay();
        setChatActions(true);
        chatActionDisplay?.focus();
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
        const formatted = !Number.isNaN(num) ? num.toFixed(2) : "";
        if (chatActionDisplay.tagName === "INPUT") {
            chatActionDisplay.value = formatted;
        } else {
            chatActionDisplay.textContent = formatted ? `¥${formatted}` : "金额";
        }
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
        const isSystemLike = msg?.kind === "tip" || msg?.kind === "notice" || msg?.from === "system";
        if (chat.blocked && !isSystemLike) {
            appendSystemMessage(chat.id, "你已屏蔽该联系人，消息不会出现在对话中。", { kind: "tip" });
            renderChats();
            return;
        }
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
        if (active) {
            openChat(chat.id);
        } else {
            renderChats();
        }
    }

    async function sendChat(textOverride, kindOverride, meta = {}) {
        if (!chatWindow || !chatInput) return;
        const id = chatWindow.dataset.chat;
        const c = getAllChats().find(x => x.id === id);
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
    if (chatLog) {
        let activeRow = null;
        const handlePointerDown = (event) => {
            const row = event.target.closest(".chat-row");
            if (!row || row.dataset.from !== "out") return;
            activeRow = row;
            const { clientX, clientY } = event.touches?.[0] || event;
            contextTimer = window.setTimeout(() => {
                showChatContextMenuAt(row, clientX, clientY);
            }, 520);
        };
        const clearPointerTimer = () => {
            if (contextTimer) {
                clearTimeout(contextTimer);
                contextTimer = null;
            }
            activeRow = null;
        };
        chatLog.addEventListener("contextmenu", event => {
            attemptContextMenu(event);
        });
        chatLog.addEventListener("pointerdown", handlePointerDown);
        chatLog.addEventListener("pointerup", clearPointerTimer);
        chatLog.addEventListener("pointerleave", clearPointerTimer);
        chatLog.addEventListener("touchstart", handlePointerDown, { passive: false });
        chatLog.addEventListener("touchend", clearPointerTimer);
        chatLog.addEventListener("touchcancel", clearPointerTimer);
    }
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
    if (chatContextMenu) {
        chatContextMenu.addEventListener("click", (event) => {
            const target = event.target.closest("[data-context-action]");
            if (!target) return;
            const action = target.dataset.contextAction;
            if (action === "recall") {
                handleContextRecall();
            }
        });
    }
    window.addEventListener("click", (event) => {
        if (chatContextMenu && chatContextMenu.contains(event.target)) return;
        if (chatMenuBtn && chatMenuBtn.contains(event.target)) return;
        closeChatContextMenu();
        chatHeadMenu?.classList.remove("show");
    });
    if (chatMenuBtn) {
        chatMenuBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            chatHeadMenu?.classList.toggle("show");
        });
    }
    if (chatHeadMenu) {
        chatHeadMenu.addEventListener("click", (event) => {
            const action = event.target.closest("[data-chat-menu]")?.dataset?.chatMenu;
            if (!action) return;
            handleChatMenuAction(action);
        });
    }
    if (momentsNoticeRail) {
        momentsNoticeRail.addEventListener("click", () => {
            openMomentNoticePanel();
        });
    }
    if (momentsNoticeClose) {
        momentsNoticeClose.addEventListener("click", closeMomentNoticePanel);
    }
    if (addFriendButton) {
        addFriendButton.addEventListener("click", openAddFriendModal);
    }
    if (addFriendConfirm) {
        addFriendConfirm.addEventListener("click", submitAddFriend);
    }
    if (addFriendCancel) {
        addFriendCancel.addEventListener("click", closeAddFriendModal);
    }
    if (momentDeleteConfirm) {
        momentDeleteConfirm.addEventListener("click", confirmMomentDelete);
    }
    if (momentDeleteCancel) {
        momentDeleteCancel.addEventListener("click", closeMomentDeleteModal);
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
        toggleMainHeader(true, `Wechat (${totalUnreadCount()})`);
        hideMessageBanner();
        if (chatRecallBtn) chatRecallBtn.style.display = "none";
        updateChatActionControls(null);
        toggleAddFriendButton(true);
    });

    // chatAddBtn removed by design; add-friend handled via contacts header

    if (chatRecallBtn) {
        chatRecallBtn.addEventListener("click", () => {
            const activeId = chatWindow?.dataset?.chat;
            if (!activeId) return;
            const removed = withdrawChatMessage(activeId);
            if (removed) {
                showMessageBanner("微信", "你撤回了一条消息。", activeId);
                renderChats();
                openChat(activeId);
            }
        });
    }

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

    function getDialContacts() {
        const stored = getContactsList();
        if (stored.length) {
            return stored.map(c => ({
                name: c.name || c.id,
                tel: c.tel || "未知号码"
            }));
        }
        return [
            { name: "联系人", tel: "未保存号码" },
            { name: "室友", tel: "131****8888" },
            { name: "前台", tel: "400-800-0000" },
        ];
    }
    function renderContactsList() {
        const wrap = callPanels.contacts;
        if (!wrap) return;
        wrap.innerHTML = "";
        getDialContacts().forEach(c => {
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
        switch (path) {
            case "phone.calls":
                renderCallHistory();
                break;
            case "moments:unread":
            case "state:unreadMomentsCount":
                const next = typeof detail?.count === "number"
                    ? detail.count
                    : (getState("unreadMomentsCount") || 0);
                unreadMomentsCount = next;
                updateMomentsBadgeDisplay(unreadMomentsCount);
                break;
            case "chats:message":
            case "chats:read":
                renderChats();
                break;
            case "chats:withdraw":
                renderChats();
                if (chatWindow && chatWindow.dataset.chat === detail?.chatId) {
                    openChat(detail.chatId);
                }
                break;
            case "chats:pinned":
            case "chats:block":
                renderChats();
                updateChatActionControls(getActiveChat());
                break;
            case "moments:post":
            case "moments:comment":
            case "moments:like":
            case "moments:visibility":
                renderMoments();
                break;
            case "moments:delete":
                renderMoments();
                break;
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
        get chats() {
            return getAllChats();
        },
        moments,
        handleIncomingMessage,
        renderChats,
        renderMoments,
        renderWallet,
        refreshWallet: updateWalletDisplay,
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
    renderMomentNoticeRail();
    switchTab("chats");

    updateWalletDisplay();

    // 黑雾点击：注入消息+转账，触发岛通知
    document.querySelectorAll('.app-icon[data-target="darkfog-page"]').forEach(icon => {
        icon.addEventListener('click', () => {
        const targetChat = getAllChats().find(x => x.id === "yuan");
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

// Sync wallet display when phone resets without requiring re-open
if (typeof window !== "undefined") {
    window.addEventListener("phone-reset", () => {
        try {
            updateWalletDisplay();
        } catch {
            /* ignore */
        }
    });
}

export function refreshWeChatUI() {
    if (!weChatRuntime) return;
    weChatRuntime.renderChats();
    weChatRuntime.renderMoments();
    weChatRuntime.renderWallet?.();
}
