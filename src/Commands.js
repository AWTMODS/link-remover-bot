module.exports = function (bot, db, moderator, captcha, adminIds) {

    async function isAdmin(chatId, userId) {
        return await moderator.isUserAdmin(bot, chatId, userId, adminIds);
    }

    // ---- Commands ----

    bot.onText(/\/settings/, async (msg) => {
        const chatId = String(msg.chat.id);
        const userId = msg.from.id;

        if (msg.chat.type === 'private') {
            // DM Dashboard
            const allGroups = await db.groupsCol.find({}).toArray();
            const userGroups = [];

            for (const g of allGroups) {
                try {
                    if (await isAdmin(g._id, userId)) {
                        const chat = await bot.getChat(g._id);
                        userGroups.push({ id: g._id, title: chat.title || 'Unknown Group' });
                    }
                } catch (e) { /* Bot might be kicked */ }
            }

            if (userGroups.length === 0) {
                return bot.sendMessage(chatId, 'You do not appear to be an admin of any groups I am in.');
            }

            const buttons = userGroups.map(g => [{ text: g.title, callback_data: `DASH_SEL_${g.id}` }]);
            bot.sendMessage(chatId, 'Select a group to configure:', {
                reply_markup: { inline_keyboard: buttons }
            });

        } else {
            // Group Settings View
            if (!await isAdmin(chatId, userId)) return;
            const s = await db.getGroup(chatId);
            const text = `Current settings:\nCaptcha: ${s.captcha}\nAutoBan: ${s.autoBan}\nFloodLimit: ${s.floodLimit} msgs / ${s.floodWindowSec}s\nWelcome: ${s.welcome}`;
            bot.sendMessage(chatId, text);
        }
    });

    bot.onText(/\/setwelcome\s+([\s\S]+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const val = match[1].trim();
        await db.upsertGroup(chatId, { welcome: val });
        bot.sendMessage(chatId, 'Welcome message updated.');
    });

    bot.onText(/\/whitelist\s+(add|remove)\s+(\d+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const action = match[1], uid = Number(match[2]);
        const s = await db.getGroup(chatId);
        let arr = s.whitelist || [];
        if (action === 'add') {
            arr.push(uid); arr = Array.from(new Set(arr)); await db.upsertGroup(chatId, { whitelist: arr }); bot.sendMessage(chatId, 'Added to group whitelist.');
        } else {
            arr = arr.filter(x => x !== uid); await db.upsertGroup(chatId, { whitelist: arr }); bot.sendMessage(chatId, 'Removed from group whitelist.');
        }
    });

    bot.onText(/\/blacklist\s+(add|remove)\s+(\d+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const action = match[1], uid = Number(match[2]);
        const s = await db.getGroup(chatId);
        let arr = s.blacklist || [];
        if (action === 'add') {
            arr.push(uid); arr = Array.from(new Set(arr)); await db.upsertGroup(chatId, { blacklist: arr }); bot.sendMessage(chatId, 'Added to group blacklist.');
        } else {
            arr = arr.filter(x => x !== uid); await db.upsertGroup(chatId, { blacklist: arr }); bot.sendMessage(chatId, 'Removed from group blacklist.');
        }
    });

    bot.onText(/\/ban\s+(\d+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const uid = Number(match[1]);
        try { await bot.banChatMember(chatId, uid); await db.incStat(chatId, 'banned'); bot.sendMessage(chatId, 'User banned.'); } catch (e) { bot.sendMessage(chatId, 'Failed to ban. Make sure I have admin rights.'); }
    });

    bot.onText(/\/unban\s+(\d+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const uid = Number(match[1]);
        try { await bot.unbanChatMember(chatId, uid); bot.sendMessage(chatId, 'User unbanned.'); } catch (e) { bot.sendMessage(chatId, 'Failed to unban.'); }
    });

    bot.onText(/\/stats/, async (msg) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const st = await db.getStats(chatId);
        bot.sendMessage(chatId, `Stats: banned=${st.banned || 0} kicked=${st.kicked || 0} deleted=${st.deleted || 0}`);
    });

    bot.onText(/\/warn\s+(\d+)(?:\s+(.+))?/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const targetId = Number(match[1]);
        const reason = match[2] || 'No reason provided';

        const count = await db.addWarning(chatId, targetId, reason);
        await db.logAction(bot, chatId, 'WARN', `Target: ${targetId}\nReason: ${reason}\nCount: ${count}`);

        if (count >= 3) {
            try {
                await bot.banChatMember(chatId, targetId);
                await db.incStat(chatId, 'banned');
                await db.clearWarnings(chatId, targetId);
                bot.sendMessage(chatId, `🚫 <a href="tg://user?id=${targetId}">${targetId}</a> banned after 3 warnings.`, { parse_mode: 'HTML' });
                await db.logAction(bot, chatId, 'BAN_AUTO', `Target: ${targetId}\nReason: 3 Warnings`);
            } catch (e) {
                bot.sendMessage(chatId, `Failed to ban ${targetId}: ${e.message}`);
            }
        } else {
            bot.sendMessage(chatId, `⚠️ <a href="tg://user?id=${targetId}">${targetId}</a> warned (${count}/3).\nReason: ${reason}`, { parse_mode: 'HTML' });
        }
    });

    bot.onText(/\/mute\s+(\d+)(?:\s+(\d+))?/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const targetId = Number(match[1]);
        const minutes = Number(match[2]) || 60;

        try {
            const until = Math.floor(Date.now() / 1000) + (minutes * 60);
            await bot.restrictChatMember(chatId, targetId, {
                until_date: until,
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            });
            bot.sendMessage(chatId, `🔇 <a href="tg://user?id=${targetId}">${targetId}</a> muted for ${minutes} minutes.`, { parse_mode: 'HTML' });
            await db.logAction(bot, chatId, 'MUTE', `Target: ${targetId}\nDuration: ${minutes}m`);
        } catch (e) {
            bot.sendMessage(chatId, `Failed to mute: ${e.message}`);
        }
    });

    bot.onText(/\/unmute\s+(\d+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const targetId = Number(match[1]);

        try {
            await bot.restrictChatMember(chatId, targetId, {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            });
            bot.sendMessage(chatId, `🔊 <a href="tg://user?id=${targetId}">${targetId}</a> unmuted.`, { parse_mode: 'HTML' });
            await db.logAction(bot, chatId, 'UNMUTE', `Target: ${targetId}`);
        } catch (e) {
            bot.sendMessage(chatId, `Failed to unmute: ${e.message}`);
        }
    });

    bot.onText(/\/linkwhitelist\s+(add|remove)\s+(.+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const action = match[1];
        const domain = match[2].trim().toLowerCase();
        const s = await db.getGroup(chatId);
        let arr = s.whitelistDomains || [];

        if (action === 'add') {
            arr.push(domain); arr = Array.from(new Set(arr));
            await db.upsertGroup(chatId, { whitelistDomains: arr });
            bot.sendMessage(chatId, `Added ${domain} to link whitelist.`);
        } else {
            arr = arr.filter(d => d !== domain);
            await db.upsertGroup(chatId, { whitelistDomains: arr });
            bot.sendMessage(chatId, `Removed ${domain} from link whitelist.`);
        }
    });

    bot.onText(/\/toggle\s+(sticker|gif|voice)\s+(on|off)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const type = match[1].toLowerCase();
        const state = match[2].toLowerCase() === 'on';

        const patch = {};
        if (type === 'sticker') patch.blockStickers = state;
        if (type === 'gif') patch.blockGifs = state;
        if (type === 'voice') patch.blockVoice = state;

        await db.upsertGroup(chatId, patch);
        bot.sendMessage(chatId, `Blocking ${type}s is now ${state ? 'ENABLED' : 'DISABLED'}.`);
    });

    bot.onText(/\/report/, async (msg) => {
        const chatId = String(msg.chat.id);
        if (!msg.reply_to_message) {
            return bot.sendMessage(chatId, 'Reply to a message to report it.');
        }

        const reportedMsg = msg.reply_to_message;
        const reporter = msg.from;
        const reportedUser = reportedMsg.from;

        const reportText = `🚨 <b>REPORT</b> 🚨\n\n<b>Group:</b> ${msg.chat.title}\n<b>Reporter:</b> <a href="tg://user?id=${reporter.id}">${reporter.first_name}</a>\n<b>Reported User:</b> <a href="tg://user?id=${reportedUser.id}">${reportedUser.first_name}</a>\n<b>Message:</b> ${reportedMsg.text || '[Media]'}\n<a href="https://t.me/c/${chatId.replace('-100', '')}/${reportedMsg.message_id}">Link to message</a>`;

        try {
            const admins = await bot.getChatAdministrators(chatId);
            for (const admin of admins) {
                if (!admin.user.is_bot) {
                    try {
                        await bot.sendMessage(admin.user.id, reportText, { parse_mode: 'HTML' });
                    } catch (e) { }
                }
            }
            bot.sendMessage(chatId, 'Report sent to admins.', { reply_to_message_id: msg.message_id });
            await db.logAction(bot, chatId, 'REPORT', `Reporter: ${reporter.id}\nTarget: ${reportedUser.id}`);
        } catch (e) {
            console.error('Report error:', e.message);
            bot.sendMessage(chatId, 'Failed to send report.');
        }
    });

    bot.onText(/\/badword\s+(add|remove)\s+(.+)/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const action = match[1];
        const word = match[2].trim().toLowerCase();
        const s = await db.getGroup(chatId);
        let arr = s.blacklistWords || [];

        if (action === 'add') {
            arr.push(word); arr = Array.from(new Set(arr));
            await db.upsertGroup(chatId, { blacklistWords: arr });
            bot.sendMessage(chatId, `Added "${word}" to keyword blacklist.`);
        } else {
            arr = arr.filter(w => w !== word);
            await db.upsertGroup(chatId, { blacklistWords: arr });
            bot.sendMessage(chatId, `Removed "${word}" from keyword blacklist.`);
        }
    });

    bot.onText(/\/badwords/, async (msg) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const s = await db.getGroup(chatId);
        const words = s.blacklistWords || [];
        bot.sendMessage(chatId, `Blacklisted Words:\n${words.join(', ') || 'None'}`);
    });

    bot.onText(/\/info(?:\s+(\d+|@\w+))?/, async (msg, match) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;

        let targetId;
        if (msg.reply_to_message) {
            targetId = msg.reply_to_message.from.id;
        } else if (match[1]) {
            if (match[1].startsWith('@')) {
                return bot.sendMessage(chatId, 'Please reply to a message or provide a User ID (username resolution not implemented yet).');
            }
            targetId = Number(match[1]);
        } else {
            return bot.sendMessage(chatId, 'Please reply to a user or provide their ID.');
        }

        try {
            const member = await bot.getChatMember(chatId, targetId);
            const warningDoc = await db.getWarning(chatId, targetId);
            const warningCount = warningDoc ? warningDoc.count : 0;
            const lastReason = warningDoc ? warningDoc.reason : 'N/A';

            const info = `
👤 <b>User Info</b>
<b>ID:</b> <code>${targetId}</code>
<b>Name:</b> ${member.user.first_name} ${member.user.last_name || ''}
<b>Username:</b> @${member.user.username || 'None'}
<b>Status:</b> ${member.status}
<b>Warnings:</b> ${warningCount}/3
<b>Last Warning:</b> ${lastReason}
      `;
            bot.sendMessage(chatId, info, { parse_mode: 'HTML' });
        } catch (e) {
            bot.sendMessage(chatId, 'User not found or error fetching info.');
        }
    });

    // ---- Callback Query Handler ----
    bot.on('callback_query', async (query) => {
        const { data, message, from } = query;

        // 1. Captcha Handler
        if (data.startsWith('CAPTCHA_')) {
            const chatId = String(message.chat.id);
            const parts = data.split('_');
            const targetUserId = Number(parts[1]);
            const selectedAnswer = Number(parts[2]);

            if (from.id !== targetUserId) {
                return bot.answerCallbackQuery(query.id, { text: 'This captcha is not for you!', show_alert: true });
            }

            const stored = captcha.get(chatId, targetUserId);
            if (!stored) {
                return bot.answerCallbackQuery(query.id, { text: 'Captcha expired or invalid.', show_alert: true });
            }

            if (selectedAnswer === stored.answer) {
                // Correct
                try {
                    await bot.restrictChatMember(chatId, targetUserId, {
                        can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
                    });
                    await bot.deleteMessage(chatId, message.message_id);
                    await bot.sendMessage(chatId, `✅ <a href="tg://user?id=${targetUserId}">${from.first_name}</a> passed the captcha.`, { parse_mode: 'HTML' });
                } catch (e) { }
                captcha.delete(chatId, targetUserId);
            } else {
                // Wrong
                stored.tries++;
                if (stored.tries >= 3) {
                    try {
                        await bot.banChatMember(chatId, targetUserId);
                        await db.incStat(chatId, 'banned');
                        await bot.deleteMessage(chatId, message.message_id);
                    } catch (e) { }
                    captcha.delete(chatId, targetUserId);
                } else {
                    bot.answerCallbackQuery(query.id, { text: `Wrong answer! ${3 - stored.tries} tries left.`, show_alert: true });
                }
            }
            return;
        }

        // 2. Dashboard Handler
        if (data.startsWith('DASH_')) {
            const userId = from.id;

            if (data.startsWith('DASH_SEL_')) {
                const groupId = data.split('_')[2];
                if (!await isAdmin(groupId, userId)) return bot.answerCallbackQuery(query.id, { text: 'You are not an admin there.' });

                const s = await db.getGroup(groupId);
                const chat = await bot.getChat(groupId);

                const text = `⚙️ <b>Settings for ${chat.title}</b>\n\n` +
                    `🛡️ <b>Security</b>\n` +
                    `Captcha: ${s.captcha ? '✅' : '❌'}\n` +
                    `AutoBan: ${s.autoBan ? '✅' : '❌'}\n` +
                    `Raid Mode: ${s.raidMode ? '🚨 ON' : 'Off'}\n\n` +
                    `🚫 <b>Filters</b>\n` +
                    `Anti-Forward: ${s.blockForwards ? '✅' : '❌'}\n` +
                    `Link Filter: <b>${(s.linkFilterLevel || 'whitelist').toUpperCase()}</b>\n` +
                    `Stickers: ${s.blockStickers ? '🚫' : '✅'}\n` +
                    `GIFs: ${s.blockGifs ? '🚫' : '✅'}\n` +
                    `Voice: ${s.blockVoice ? '🚫' : '✅'}\n\n` +
                    `🌊 <b>Flood Control</b>\n` +
                    `Limit: ${s.floodLimit || 5} msgs / ${s.floodWindowSec || 7}s`;

                const kb = [
                    [
                        { text: `Captcha ${s.captcha ? '✅' : '❌'}`, callback_data: `DASH_TOG_${groupId}_captcha` },
                        { text: `AutoBan ${s.autoBan ? '✅' : '❌'}`, callback_data: `DASH_TOG_${groupId}_autoBan` }
                    ],
                    [
                        { text: `🚨 Raid Mode ${s.raidMode ? 'ON' : 'OFF'}`, callback_data: `DASH_TOG_${groupId}_raidMode` }
                    ],
                    [
                        { text: `Anti-Fwd ${s.blockForwards ? '✅' : '❌'}`, callback_data: `DASH_TOG_${groupId}_blockForwards` },
                        { text: `Links: ${s.linkFilterLevel || 'whitelist'}`, callback_data: `DASH_CYC_${groupId}_linkFilterLevel` }
                    ],
                    [
                        { text: `Stickers ${s.blockStickers ? '🚫' : '✅'}`, callback_data: `DASH_TOG_${groupId}_blockStickers` },
                        { text: `GIFs ${s.blockGifs ? '🚫' : '✅'}`, callback_data: `DASH_TOG_${groupId}_blockGifs` }
                    ],
                    [
                        { text: `Voice ${s.blockVoice ? '🚫' : '✅'}`, callback_data: `DASH_TOG_${groupId}_blockVoice` }
                    ],
                    [
                        { text: 'Flood -1', callback_data: `DASH_FLD_${groupId}_dec` },
                        { text: `Limit: ${s.floodLimit || 5}`, callback_data: 'noop' },
                        { text: 'Flood +1', callback_data: `DASH_FLD_${groupId}_inc` }
                    ],
                    [{ text: '« Back', callback_data: 'DASH_BACK' }]
                ];

                bot.editMessageText(text, { chat_id: message.chat.id, message_id: message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
            }

            else if (data.startsWith('DASH_TOG_')) {
                const parts = data.split('_');
                const groupId = parts[2];
                const key = parts[3];

                if (!await isAdmin(groupId, userId)) return bot.answerCallbackQuery(query.id, { text: 'You are not an admin there.' });

                const s = await db.getGroup(groupId);
                const newVal = !s[key];
                await db.upsertGroup(groupId, { [key]: newVal });

                // Refresh
                const newQuery = { ...query, data: `DASH_SEL_${groupId}` };
                bot.emit('callback_query', newQuery);
            }

            else if (data.startsWith('DASH_CYC_')) {
                const parts = data.split('_');
                const groupId = parts[2];
                // const key = parts[3]; // always linkFilterLevel for now

                if (!await isAdmin(groupId, userId)) return bot.answerCallbackQuery(query.id, { text: 'You are not an admin there.' });

                const s = await db.getGroup(groupId);
                const current = s.linkFilterLevel || 'whitelist';
                const next = current === 'whitelist' ? 'strict' : (current === 'strict' ? 'off' : 'whitelist');

                await db.upsertGroup(groupId, { linkFilterLevel: next });

                // Refresh
                const newQuery = { ...query, data: `DASH_SEL_${groupId}` };
                bot.emit('callback_query', newQuery);
            }

            else if (data.startsWith('DASH_FLD_')) {
                const parts = data.split('_');
                const groupId = parts[2];
                const action = parts[3];

                if (!await isAdmin(groupId, userId)) return bot.answerCallbackQuery(query.id, { text: 'You are not an admin there.' });

                const s = await db.getGroup(groupId);
                let val = s.floodLimit || 5;
                if (action === 'inc') val++;
                if (action === 'dec') val = Math.max(1, val - 1);

                await db.upsertGroup(groupId, { floodLimit: val });

                // Refresh
                const newQuery = { ...query, data: `DASH_SEL_${groupId}` };
                bot.emit('callback_query', newQuery);
            }

            else if (data === 'DASH_BACK') {
                // Show list again
                const allGroups = await db.groupsCol.find({}).toArray();
                const userGroups = [];
                for (const g of allGroups) {
                    try {
                        if (await isAdmin(g._id, userId)) {
                            const chat = await bot.getChat(g._id);
                            userGroups.push({ id: g._id, title: chat.title || 'Unknown Group' });
                        }
                    } catch (e) { }
                }
                const buttons = userGroups.map(g => [{ text: g.title, callback_data: `DASH_SEL_${g.id}` }]);
                bot.editMessageText('Select a group to configure:', { chat_id: message.chat.id, message_id: message.message_id, reply_markup: { inline_keyboard: buttons } });
            }
        }
    });
};
