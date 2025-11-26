module.exports = function (bot, db, moderator, adminIds) {

    async function isAdmin(chatId, userId) {
        return await moderator.isUserAdmin(bot, chatId, userId, adminIds);
    }

    bot.onText(/\/settings/, async (msg) => {
        const chatId = String(msg.chat.id);
        if (!await isAdmin(chatId, msg.from.id)) return;
        const s = await db.getGroup(chatId);
        const text = `Current settings:\nCaptcha: ${s.captcha}\nAutoBan: ${s.autoBan}\nFloodLimit: ${s.floodLimit} msgs / ${s.floodWindowSec}s\nWelcome: ${s.welcome}`;
        bot.sendMessage(chatId, text);
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
        try { await bot.kickChatMember(chatId, uid); await db.incStat(chatId, 'banned'); bot.sendMessage(chatId, 'User banned.'); } catch (e) { bot.sendMessage(chatId, 'Failed to ban. Make sure I have admin rights.'); }
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
                await bot.kickChatMember(chatId, targetId);
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
};
