import { getState, updateState, subscribeState } from "../core/state.js";
import { askAI } from "../core/ai.js";
import {
    triggerIncomingCall as phoneTriggerIncomingCall,
    triggerOutgoingCall
} from "./phone.js";
import { openPhonePage, showPhoneFloatingAlert } from "../ui/phone.js";

let weChatRuntime = null;

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

    function syncUnreadTotals() {
        const totalUnread = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
        const unreadByApp = { ...(getState("phone.unreadByApp") || {}) };
        unreadByApp.wechat = totalUnread;
        updateState("phone.unreadByApp", unreadByApp);
        updateState("phone.unreadTotal", totalUnread);
    }

    function persistChats() {
        updateState("phone.chats", chats);
        syncUnreadTotals();
    }

    function persistMoments() {
        updateState("phone.moments", moments);
    }

    function persistWallet() {
        wallet.balance = walletBalance;
        updateState("phone.wallet", wallet);
    }

    function getCallHistory() {
        return getState("phone.calls") || [];
    }

    const momentTemplates = {
        comment: ["看见你了。", "留意安全。", "别太累。"],
        mention: ["@你 在吗？", "@你 别怕，我在。", "@你 记得回信。"]
    };

    async function addMomentComment(moment, text, type = "comment") {
        if (!moment || !text) return;
        moment.comments = moment.comments || [];
        moment.comments.push({ text, type, time: new Date() });
        persistMoments();
        if (type === "mention") {
            showPhoneFloatingAlert("@ 提醒");
        }
        renderMoments();
        try {
            const aiEcho = await askAI(`朋友圈互动：${moment.who} 发布了「${moment.text}」，请跟进一句回复。`);
            if (aiEcho) {
                moment.comments.push({ text: aiEcho, type: "ai", time: new Date() });
                persistMoments();
                renderMoments();
            }
        } catch (err) {
            console.error("AI 评论失败", err);
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
        moments.forEach(m => {
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
                    <button data-act="mention">@TA</button>
                </div>
            `;
            div.querySelector('[data-act="like"]').addEventListener("click", () => {
                m.likedByUser = !m.likedByUser;
                m.likes = Math.max(0, m.likes + (m.likedByUser ? 1 : -1));
                renderMoments();
            });
            const templatePanel = document.createElement("div");
            templatePanel.className = "moment-template-panel";
            const commentLabel = document.createElement("div");
            commentLabel.className = "section-label";
            commentLabel.textContent = "评论模版";
            const commentWrap = document.createElement("div");
            commentWrap.className = "template-chips";
            momentTemplates.comment.forEach(text => {
                const btn = document.createElement("button");
                btn.textContent = text;
                btn.addEventListener("click", () => {
                    addMomentComment(m, text, "comment").catch(err => console.error(err));
                });
                commentWrap.appendChild(btn);
            });
            const mentionLabel = document.createElement("div");
            mentionLabel.className = "section-label";
            mentionLabel.textContent = "@ 模版";
            const mentionWrap = document.createElement("div");
            mentionWrap.className = "template-chips";
            momentTemplates.mention.forEach(text => {
                const btn = document.createElement("button");
                btn.textContent = text;
                btn.addEventListener("click", () => {
                    addMomentComment(m, text, "mention").catch(err => console.error(err));
                });
                mentionWrap.appendChild(btn);
            });
            templatePanel.appendChild(commentLabel);
            templatePanel.appendChild(commentWrap);
            templatePanel.appendChild(mentionLabel);
            templatePanel.appendChild(mentionWrap);
            div.appendChild(templatePanel);
            const commentBtn = div.querySelector('[data-act="comment"]');
            const mentionBtn = div.querySelector('[data-act="mention"]');
            const togglePanel = () => {
                templatePanel.classList.toggle("show");
            };
            if (commentBtn) commentBtn.addEventListener("click", togglePanel);
            if (mentionBtn) mentionBtn.addEventListener("click", togglePanel);
            if (m.comments && m.comments.length) {
                const commentsBlock = document.createElement("div");
                commentsBlock.className = "moment-comments";
                m.comments.forEach(c => {
                    const item = document.createElement("div");
                    item.className = "moment-comment";
                    item.innerHTML = `<span>${c.type === "mention" ? "@你" : "你"}</span>${c.text}`;
                    commentsBlock.appendChild(item);
                });
                div.appendChild(commentsBlock);
            }
            wrap.appendChild(div);
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
    }

    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            switchTab(btn.dataset.wtab);
        });
    });

    function openChat(id) {
        const c = chats.find(x => x.id === id);
        if (!c || !chatWindow || !chatLog) return;
        c.unread = 0;
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

    function adjustWallet(delta) {
        walletBalance = Math.max(0, walletBalance + delta);
        persistWallet();
        updateWalletDisplay();
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
        chat.log.push(msg);
        chat.preview = formatChatText(msg);
        chat.time = "刚刚";
        const active = isChatActive(chat.id);
        if (!active) {
            chat.unread = (chat.unread || 0) + 1;
            notifyChatMessage(chat, msg);
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
        const c = chats.find(x => x.id === id);
        if (!c) return;
        const text = (textOverride != null ? textOverride : chatInput.value.trim());
        if (!text) return;
        const kind = kindOverride || "";
        const msg = {
            from: "out",
            text,
            kind,
        };
        if (meta.amount != null) msg.amount = meta.amount;
        if (meta.redeemed) msg.redeemed = true;
        c.log.push(msg);
        c.preview = text;
        c.time = "刚刚";
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
                adjustWallet(-amount);
            } else if (currentChatAction.type === "red") {
                sendChat(`红包 ¥${formatted}`, "red", { amount, redeemed: true });
                adjustWallet(-amount);
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
                    adjustWallet(msg.amount);
                }
                persistChats();
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
    subscribeState((path) => {
        if (path === "phone.calls") {
            renderCallHistory();
        }
    });
    renderContactsList();
    renderDial();
    switchCallTab("history");

    weChatRuntime = {
        chats,
        moments,
        handleIncomingMessage,
        renderChats,
        renderMoments,
        persistMoments
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
                targetChat.log.push({ from:"in", text:"黑雾覆盖：他在看你。" });
                targetChat.log.push({ from:"in", text:"红包 ¥18.00", kind:"red", amount: 18.00, redeemed: false });
                targetChat.log.push({ from:"in", text:"转账 ¥66.00", kind:"pay", amount: 66.00 });
                targetChat.preview = "转账 ¥66.00";
                targetChat.time = "刚刚";
                if (wasActive) {
                    openChat(targetChat.id);
                } else {
                    targetChat.unread = (targetChat.unread || 0) + 3;
                    notifyChatMessage(targetChat, targetChat.log[targetChat.log.length - 1]);
                }
                persistChats();
                adjustWallet(66);
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

export async function triggerMomentsNotification() {
    if (!weChatRuntime || !weChatRuntime.moments?.length) return;
    const target = weChatRuntime.moments[Math.floor(Math.random() * weChatRuntime.moments.length)];
    if (!target) return;
    try {
        const aiComment = await askAI(`朋友圈中「${target.text}」，请生成一句神秘评论。`);
        target.comments = target.comments || [];
        target.comments.push({ text: aiComment || "……", type: "ai", time: new Date() });
        weChatRuntime.persistMoments();
        weChatRuntime.renderMoments();
        showPhoneFloatingAlert("朋友圈提醒");
    } catch (err) {
        console.error("朋友圈触发失败", err);
    }
}
