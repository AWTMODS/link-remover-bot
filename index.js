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
    registerCommands(bot, db, moderator, captcha, ADMIN_IDS);

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
      console.log(`New members in ${chatId}:`, msg.new_chat_members.map(u => u.id));
      const settings = await db.getGroup(chatId);
      console.log(`Settings for ${chatId}: captcha=${settings.captcha}`);
      const globals = await db.getGlobals();

      for (const user of msg.new_chat_members) {
        if (user.is_bot) {
          try { await bot.banChatMember(chatId, user.id); await db.incStat(chatId, 'banned'); } catch (e) { console.error('Bot ban error:', e.message); }
          continue;
        }

        if (globals.whitelist.includes(user.id) || (settings.whitelist || []).includes(user.id)) {
          console.log(`User ${user.id} is whitelisted.`);
          continue;
        }

        if (settings.captcha) {
          console.log(`Initiating captcha for ${user.id}`);
          try { await bot.restrictChatMember(chatId, user.id, { can_send_messages: false }); } catch (e) { console.error('Restrict error:', e.message); }

          const cap = captcha.create(chatId, user.id, null);
          console.log(`Captcha created:`, cap);

          try {
            let welcomeText = settings.welcome
              .replace('{name}', user.first_name)
              .replace('{username}', user.username || 'No Username')
              .replace('{id}', user.id)
              .replace('{group}', msg.chat.title);

            const opts = {
              reply_markup: {
                inline_keyboard: [
                  cap.options.map(opt => ({ text: String(opt), callback_data: `CAPTCHA_${user.id}_${opt}` }))
                ]
              }
            };

            const sent = await bot.sendMessage(chatId, `${welcomeText}\n\nPlease solve this captcha within 120 seconds: ${cap.question}`, opts);
            console.log('Captcha message sent:', sent.message_id);
            // Update stored captcha with message ID
            const stored = captcha.get(chatId, user.id);
            if (stored) stored.welcomeMsgId = sent.message_id;
          } catch (e) { console.error('Captcha send error:', e.message); }

          // Timeout
          setTimeout(async () => {
            const stored = captcha.get(chatId, user.id);
            if (!stored) return;
            if (Date.now() > stored.expiresAt) {
              console.log(`Captcha timeout for ${user.id}`);
              try { await bot.banChatMember(chatId, user.id); await db.incStat(chatId, 'banned'); } catch (e) { console.error('Timeout ban error:', e.message); }
              captcha.delete(chatId, user.id);
            }
          }, 125000);
        } else {
          try {
            await bot.restrictChatMember(chatId, user.id, {
              can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
            });
          } catch (e) { console.error('Unrestrict error:', e.message); }
        }
      }
    }

    // 2. Normal Messages (Captcha text fallback removed, only buttons now)
    if (msg.text) {
      const chatId = String(msg.chat.id);

      // 3. Normal Moderation
      if (msg.chat.type && (msg.chat.type.endsWith('group') || msg.chat.type === 'supergroup')) {
        await moderator.moderate(bot, msg, ADMIN_IDS);
      }
    }
  } catch (err) {
    console.error('Message handler error:', err);
  }
});
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit();
});
