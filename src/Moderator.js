// fetch workaround
let fetchFn;
try {
    fetchFn = require('node-fetch');
    if (fetchFn && fetchFn.default) fetchFn = fetchFn.default;
} catch (e) {
    if (global.fetch) fetchFn = global.fetch;
    else fetchFn = null;
}

class Moderator {
    constructor(db) {
        this.db = db;
        this.messageWindow = {}; // { chatId: { userId: [timestamps...] } }

        // Patterns
        this.chineseRegex = /[\u4E00-\u9FFF]/;
        this.russianRegex = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
        this.urlRegex = /((https?:\/\/|www\.)\S+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/?)/i;
        this.adultKeywords = ['sex', 'porn', 'xxx', '18+', 'adult', 'nude', 'hot'];
        this.usernameSpamPatterns = [
            /\d{4,}/,
            /^(free|official|freegift|giveaway)/i,
            /[_]{3,}/,
            /(bot|b0t|promo|offer|pr0mo)/i,
            /[a-z]{1}[_\-\.]{2,}[a-z]{1,}/i,
            /^.{1,3}\d{3,}$/
        ];
    }

    isUsernameSpam(username) {
        if (!username) return false;
        return this.usernameSpamPatterns.some(r => r.test(username));
    }

    async hfSpamCheck(text) {
        if (!fetchFn) return false;
        if (!text || text.trim().length === 0) return false;
        try {
            const resp = await fetchFn('https://api-inference.huggingface.co/models/mithun/spam_detector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: text })
            });
            const data = await resp.json();
            if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
                const top = data[0][0];
                if (top && top.label && typeof top.label === 'string') {
                    return top.label.toLowerCase().includes('spam');
                }
            }
        } catch (e) {
            console.error('HF spam check error (non-fatal):', e && e.message ? e.message : e);
        }
        return false;
    }

    async deleteAndAct(bot, chatId, userId, messageId, reason) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) { console.error(`Failed to delete msg ${messageId}:`, e.message); }
        await this.db.logAction(bot, chatId, 'DELETE', `User: ${userId}\nReason: ${reason}`);

        const g = await this.db.getGroup(chatId);
        if (g.autoBan) {
            try { await bot.banChatMember(chatId, userId); await this.db.incStat(chatId, 'banned'); } catch (e) { console.error('Error:', e.message); }
            ```
// fetch workaround
let fetchFn;
try {
    fetchFn = require('node-fetch');
    if (fetchFn && fetchFn.default) fetchFn = fetchFn.default;
} catch (e) {
    if (global.fetch) fetchFn = global.fetch;
    else fetchFn = null;
}

class Moderator {
    constructor(db) {
        this.db = db;
        this.messageWindow = {}; // { chatId: { userId: [timestamps...] } }

        // Patterns
        this.chineseRegex = /[\u4E00-\u9FFF]/;
        this.russianRegex = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
        this.urlRegex = /((https?:\/\/|www\.)\S+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/?)/i;
        this.adultKeywords = ['sex', 'porn', 'xxx', '18+', 'adult', 'nude', 'hot'];
        this.usernameSpamPatterns = [
            /\d{4,}/,
            /^(free|official|freegift|giveaway)/i,
            /[_]{3,}/,
            /(bot|b0t|promo|offer|pr0mo)/i,
            /[a-z]{1}[_\-\.]{2,}[a-z]{1,}/i,
            /^.{1,3}\d{3,}$/
        ];
    }

    isUsernameSpam(username) {
        if (!username) return false;
        return this.usernameSpamPatterns.some(r => r.test(username));
    }

    async hfSpamCheck(text) {
        if (!fetchFn) return false;
        if (!text || text.trim().length === 0) return false;
        try {
            const resp = await fetchFn('https://api-inference.huggingface.co/models/mithun/spam_detector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: text })
            });
            const data = await resp.json();
            if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
                const top = data[0][0];
                if (top && top.label && typeof top.label === 'string') {
                    return top.label.toLowerCase().includes('spam');
                }
            }
```
            // fetch workaround
            let fetchFn;
            try {
                fetchFn = require('node-fetch');
                if (fetchFn && fetchFn.default) fetchFn = fetchFn.default;
            } catch (e) {
                if (global.fetch) fetchFn = global.fetch;
                else fetchFn = null;
            }

            class Moderator {
                constructor(db) {
                    this.db = db;
                    this.messageWindow = {}; // { chatId: { userId: [timestamps...] } }

                    // Patterns
                    this.chineseRegex = /[\u4E00-\u9FFF]/;
                    this.russianRegex = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
                    this.urlRegex = /((https?:\/\/|www\.)\S+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/?)/i;
                    this.adultKeywords = ['sex', 'porn', 'xxx', '18+', 'adult', 'nude', 'hot'];
                    this.usernameSpamPatterns = [
                        /\d{4,}/,
                        /^(free|official|freegift|giveaway)/i,
                        /[_]{3,}/,
                        /(bot|b0t|promo|offer|pr0mo)/i,
                        /[a-z]{1}[_\-\.]{2,}[a-z]{1,}/i,
                        /^.{1,3}\d{3,}$/
                    ];
                }

                isUsernameSpam(username) {
                    if (!username) return false;
                    return this.usernameSpamPatterns.some(r => r.test(username));
                }

                async hfSpamCheck(text) {
                    if (!fetchFn) return false;
                    if (!text || text.trim().length === 0) return false;
                    try {
                        const resp = await fetchFn('https://api-inference.huggingface.co/models/mithun/spam_detector', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ inputs: text })
                        });
                        const data = await resp.json();
                        if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
                            const top = data[0][0];
                            if (top && top.label && typeof top.label === 'string') {
                                return top.label.toLowerCase().includes('spam');
                            }
                        }
                    } catch (e) {
                        console.error('HF spam check error (non-fatal):', e && e.message ? e.message : e);
                    }
                    return false;
                }

                // Helper for localization
                async getMsg(chatId, key, params = {}) {
                    const settings = await this.db.getGroup(chatId);
                    const lang = settings.language || 'en';
                    let text;
                    try {
                        const locales = require(`../locales/${lang}.json`);
                        text = locales[key] || key;
                    } catch (e) {
                        text = key;
                    }

                    for (const [k, v] of Object.entries(params)) {
                        text = text.replace(`{${k}}`, v);
                    }
                    return text;
                }

                async deleteAndAct(bot, chatId, userId, messageId, reason) {
                    try { await bot.deleteMessage(chatId, messageId); } catch (e) { console.error(`Failed to delete msg ${messageId}:`, e.message); }
                    await this.db.logAction(bot, chatId, 'DELETE', `User: ${userId}\nReason: ${reason}`);

                    const g = await this.db.getGroup(chatId);
                    if (g.autoBan) {
                        try { await bot.banChatMember(chatId, userId); await this.db.incStat(chatId, 'banned'); } catch (e) { console.error('Error:', e.message); }
                        try {
                            const text = await this.getMsg(chatId, 'ban_success', { userId });
                            await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
                        } catch (e) { console.error('Error:', e.message); }
                    } else {
                        try {
                            const text = await this.getMsg(chatId, 'spam_deleted', { reason });
                            await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
                        } catch (e) { console.error('Error:', e.message); }
                    }
                }

                async isUserAdmin(bot, chatId, userId, adminIds) {
                    try {
                        const member = await bot.getChatMember(chatId, userId);
                        return ['administrator', 'creator'].includes(member.status);
                    } catch (e) {
                        return adminIds.includes(userId);
                    }
                }

                async moderate(bot, msg, adminIds) {
                    if (!msg || !msg.chat || !msg.from) return;
                    const chatId = String(msg.chat.id);
                    const userId = msg.from.id;

                    // fetch settings
                    const settings = await this.db.getGroup(chatId);
                    const globals = await this.db.getGlobals();

                    // skip admins & whitelisted
                    if (await this.isUserAdmin(bot, chatId, userId, adminIds)) return;
                    if ((globals.whitelist || []).includes(userId) || (settings.whitelist || []).includes(userId)) return;

                    // global/group blacklists
                    if ((globals.blacklist || []).includes(userId) || (settings.blacklist || []).includes(userId)) {
                        try { await bot.banChatMember(chatId, userId); await this.db.incStat(chatId, 'banned'); } catch (e) { console.error('Error:', e.message); }
                        return;
                    }

                    // username-based checks
                    if (this.isUsernameSpam(msg.from.username)) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Suspicious username');
                        return;
                    }

                    const text = (msg.text || msg.caption || '').toString();

                    // 1) HF AI spam detection
                    if (await this.hfSpamCheck(text)) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'AI (HuggingFace) Spam Detected');
                        return;
                    }

                    const lower = text.toLowerCase();

                    // 2) language filters
                    if (this.chineseRegex.test(lower) || this.russianRegex.test(lower)) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Foreign language spam');
                        return;
                    }

                    // 3) adult keywords
                    if (this.adultKeywords.some(w => lower.includes(w))) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Adult content');
                        return;
                    }

                    // 3.5) Anti-Forward
                    if (settings.blockForwards && (msg.forward_date || msg.forward_from || msg.forward_from_chat)) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Forwarded message blocked');
                        return;
                    }

                    // 4) link spam
                    if (this.urlRegex.test(lower)) {
                        const level = settings.linkFilterLevel || 'whitelist';

                        if (level === 'off') {
                            // Do nothing, links allowed
                        } else if (level === 'strict') {
                            await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Links are strictly prohibited');
                            return;
                        } else {
                            // Whitelist mode (default)
                            const allowedDomains = settings.whitelistDomains || [];
                            const isWhitelisted = allowedDomains.some(d => lower.includes(d.toLowerCase()));

                            if (!isWhitelisted) {
                                // Auto-Learning Whitelist (Phase 2)
                                const rep = await this.db.getReputation(userId);
                                if (rep > 50) {
                                    const match = lower.match(this.urlRegex);
                                    if (match && match[0]) {
                                        const domain = match[0].replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
                                        await this.db.addPendingDomain(domain, userId);
                                        console.log(`Auto-Learning: Pending domain ${domain} from user ${userId} (Rep: ${rep})`);
                                        // Optional: Notify admin here
                                    }
                                }

                                await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Link detected');
                                return;
                            }
                        }
                    }

                    // 5) Keyword Blacklist
                    if (settings.blacklistWords && settings.blacklistWords.length > 0) {
                        const found = settings.blacklistWords.some(word => lower.includes(word.toLowerCase()));
                        if (found) {
                            await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Blacklisted word detected');
                            return;
                        }
                    }

                    // 6) Media Filters
                    if (settings.blockStickers && msg.sticker) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Stickers not allowed');
                        return;
                    }
                    if (settings.blockGifs && (msg.animation || (msg.document && msg.document.mime_type === 'video/mp4'))) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'GIFs not allowed');
                        return;
                    }
                    if (settings.blockVoice && msg.voice) {
                        await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Voice notes not allowed');
                        return;
                    }

                    // 7) flood control
                    if (settings.floodLimit && settings.floodLimit > 0) {
                        this.messageWindow[chatId] = this.messageWindow[chatId] || {};
                        this.messageWindow[chatId][userId] = this.messageWindow[chatId][userId] || [];

                        const now = Date.now();
                        this.messageWindow[chatId][userId].push(now);

                        const cutoff = now - (settings.floodWindowSec || 7) * 1000;
                        this.messageWindow[chatId][userId] = this.messageWindow[chatId][userId].filter(ts => ts > cutoff);

                        console.log(`Flood check for ${userId}: ${this.messageWindow[chatId][userId].length} msgs in window.`);

                        if (this.messageWindow[chatId][userId].length > (settings.floodLimit || 5)) {
                            console.log(`Flood detected for ${userId}. Limit: ${settings.floodLimit}`);

                            // Critical Alert (Phase 2)
                            if (this.messageWindow[chatId][userId].length > (settings.floodLimit * 2)) {
                                await this.db.logAction(bot, chatId, 'ALERT', `CRITICAL: User ${userId} is mass flooding!`);
                            }

                            await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Flooding');
                            this.messageWindow[chatId][userId] = [];
                            // Reputation penalty
                            if (settings.reputationEnabled) await this.db.updateReputation(userId, -5);
                            return;
                        }
                    }

                    // 8) OCR Scanning (Phase 1)
                    if (settings.ocrEnabled && msg.photo) {
                        try {
                            const Tesseract = require('tesseract.js');
                            const fileId = msg.photo[msg.photo.length - 1].file_id;
                            const fileLink = await bot.getFileLink(fileId);

                            console.log(`Scanning image from ${userId}...`);
                            const { data: { text } } = await Tesseract.recognize(fileLink, 'eng');
                            const ocrText = text.toLowerCase();
                            console.log(`OCR Result: ${ocrText.substring(0, 50)}...`);

                            // Check OCR text against filters
                            if (this.adultKeywords.some(w => ocrText.includes(w)) ||
                                (settings.blacklistWords && settings.blacklistWords.some(w => ocrText.includes(w.toLowerCase())))) {

                                await this.deleteAndAct(bot, chatId, userId, msg.message_id, 'Spam text in image (OCR)');
                                if (settings.reputationEnabled) await this.db.updateReputation(userId, -10);
                                return;
                            }
                        } catch (e) {
                            console.error('OCR Error:', e.message);
                        }
                    }

                    // Persistent Logging (Phase 2)
                    await this.db.logActivity(chatId, userId, 'MESSAGE');

                    // Reputation Reward (Small)
                    if (settings.reputationEnabled) {
                        // 10% chance to gain 1 rep for a safe message
                        if (Math.random() < 0.1) await this.db.updateReputation(userId, 1);
                    }
                }
            }

            module.exports = Moderator;
            ```
