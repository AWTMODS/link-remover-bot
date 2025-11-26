/**
 * MongoDB-integrated Anti-Spam Telegram Bot (Refactored)
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./src/Database');
const Moderator = require('./src/Moderator');
const Captcha = require('./src/Captcha');
const registerCommands = require('./src/Commands');

// ---- Config ----
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x => Number(x.trim())) : [];

if (!BOT_TOKEN || !MONGO_URI) {
  console.error('Missing BOT_TOKEN or MONGO_URI in .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const db = new Database();
const captcha = new Captcha();
const moderator = new Moderator(db);

// ---- Initialization ----
async function start() {
  try {
    await db.connect(MONGO_URI);

    // Register Commands
    registerCommands(bot, db, moderator, ADMIN_IDS);

    console.log('Bot started (Modular Version).');
  } catch (e) {
    console.error('Failed to start:', e);
    process.exit(1);
  }
}

start();

// ---- Main Message Handler ----
bot.on('message', async (msg) => {
  try {
    // 1. New Members
    if (msg.new_chat_members && msg.new_chat_members.length) {
      const chatId = String(msg.chat.id);
      const settings = await db.getGroup(chatId);
      const globals = await db.getGlobals();

      for (const user of msg.new_chat_members) {
        if (user.is_bot) {
          try { await bot.kickChatMember(chatId, user.id); await db.incStat(chatId, 'banned'); } catch (e) { }
          continue;
        }

        if (globals.whitelist.includes(user.id) || (settings.whitelist || []).includes(user.id)) continue;

        if (settings.captcha) {
          try { await bot.restrictChatMember(chatId, user.id, { can_send_messages: false }); } catch (e) { }

          const cap = captcha.create(chatId, user.id, null);

          try {
            let welcomeText = settings.welcome
              .replace('{name}', user.first_name)
              .replace('{username}', user.username || 'No Username')
              .replace('{id}', user.id)
              .replace('{group}', msg.chat.title);

            const sent = await bot.sendMessage(chatId, `${welcomeText}\n\nPlease solve this captcha within 120 seconds: ${cap.question}`);
            // Update stored captcha with message ID
            const stored = captcha.get(chatId, user.id);
            if (stored) stored.welcomeMsgId = sent.message_id;
          } catch (e) { }

          // Timeout
          setTimeout(async () => {
            const stored = captcha.get(chatId, user.id);
            if (!stored) return;
            if (Date.now() > stored.expiresAt) {
              try { await bot.kickChatMember(chatId, user.id); await db.incStat(chatId, 'banned'); } catch (e) { }
              captcha.delete(chatId, user.id);
            }
          }, 125000);
        } else {
          try {
            await bot.restrictChatMember(chatId, user.id, {
              can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
            });
          } catch (e) { }
        }
      }
    }

    // 2. Captcha Answers or Normal Messages
    if (msg.text) {
      const chatId = String(msg.chat.id);
      const userId = msg.from.id;
      const stored = captcha.get(chatId, userId);

      if (stored) {
        if (Date.now() > stored.expiresAt) { captcha.delete(chatId, userId); return; }
        const num = parseInt(msg.text.trim());

        if (!isNaN(num) && num === stored.answer) {
          // Solved
          try {
            await bot.restrictChatMember(chatId, userId, {
              can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
            });
            await bot.sendMessage(chatId, `✅ <a href="tg://user?id=${userId}">${msg.from.first_name}</a> passed the captcha.`, { parse_mode: 'HTML' });
          } catch (e) { }
          captcha.delete(chatId, userId);
          return;
        } else {
          // Wrong answer
          stored.tries++;
          if (stored.tries >= 3) {
            try { await bot.kickChatMember(chatId, userId); await db.incStat(chatId, 'banned'); } catch (e) { }
            captcha.delete(chatId, userId);
            return;
          } else {
            try { await bot.sendMessage(chatId, `❌ Wrong answer. Try again. (${3 - stored.tries} tries left)`, { reply_to_message_id: stored.welcomeMsgId }); } catch (e) { }
            return;
          }
        }
      }

      // 3. Normal Moderation
      if (msg.chat.type && (msg.chat.type.endsWith('group') || msg.chat.type === 'supergroup')) {
        await moderator.moderate(bot, msg, ADMIN_IDS);
      }
    }

  } catch (err) {
    console.error('Message handler error:', err);
  }
});

// ---- Graceful Shutdown ----
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit();
});
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit();
});
