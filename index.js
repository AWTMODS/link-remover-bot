

/**
 * MongoDB-integrated Anti-Spam Telegram Bot (index.js)
 * Option A — FULL MongoDB version
 *
 * Features:
 * - MongoDB persistence (groups, globals, stats)
 * - HuggingFace free spam detection (mithun/spam_detector)
 * - Captcha for new members, auto-ban immediately
 * - Language filters (Chinese/Russian), 18+ filter, link filter
 * - Flood control, username spam detection
 * - Admin commands and simple Admin Dashboard (Express + Basic Auth)
 *
 * Usage:
 * - Create .env with BOT_TOKEN and MONGO_URI
 * - npm i node-telegram-bot-api mongodb express basic-auth dotenv
 * - node index.js
 *
 * Note: Make bot admin in groups you want to moderate.
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const express = require('express');
const basicAuth = require('basic-auth');

// fetch workaround (node v18+ has global fetch; otherwise try node-fetch)
let fetchFn;
try {
  fetchFn = require('node-fetch'); // for node-fetch v2
  if (fetchFn && fetchFn.default) fetchFn = fetchFn.default;
} catch (e) {
  if (global.fetch) fetchFn = global.fetch;
  else fetchFn = null;
}

if (!fetchFn) {
  console.warn('Warning: fetch not available. Install node-fetch or use Node 18+ for HuggingFace checks.');
}

// ---- Config ----
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const DASH_USER = process.env.DASHBOARD_USER || 'admin';
const DASH_PASS = process.env.DASHBOARD_PASS || 'password';
const DASH_PORT = process.env.DASHBOARD_PORT || 3000;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x => Number(x.trim())) : [];

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing in .env. Exiting.');
  process.exit(1);
}

if (!MONGO_URI) {
  console.error('MONGO_URI missing in .env. Exiting.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ---- MongoDB Setup ----
let dbClient, db, groupsCol, globalsCol, statsCol;

async function connectMongo() {
  dbClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await dbClient.connect();
  db = dbClient.db(); // default DB from URI
  groupsCol = db.collection('groups');
  globalsCol = db.collection('globals');
  statsCol = db.collection('stats');

  // ensure globals doc
  const g = await globalsCol.findOne({ _id: 'globals' });
  if (!g) await globalsCol.insertOne({ _id: 'globals', whitelist: [], blacklist: [] });



  console.log('MongoDB connected.');
}

connectMongo().catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

// ---- Helpers: DB operations ----
async function getGlobals() {
  const g = await globalsCol.findOne({ _id: 'globals' });
  return g || { whitelist: [], blacklist: [] };
}

async function getGroup(chatId) {
  const id = String(chatId);
  let g = await groupsCol.findOne({ _id: id });
  if (!g) {
    g = {
      _id: id,
      captcha: true,
      autoBan: true,
      floodLimit: 5,
      floodWindowSec: 7,
      welcome: 'Welcome! Please solve the captcha when prompted.',
      whitelist: [],
      blacklist: []
    };
    await groupsCol.insertOne(g);
  }
  return g;
}

async function upsertGroup(chatId, patch) {
  await groupsCol.updateOne({ _id: String(chatId) }, { $set: patch }, { upsert: true });
}

async function incStat(chatId, key) {
  await statsCol.updateOne({ _id: String(chatId) }, { $inc: { [key]: 1 } }, { upsert: true });
}

async function getStats(chatId) {
  return (await statsCol.findOne({ _id: String(chatId) })) || { banned: 0, kicked: 0, deleted: 0 };
}

// ---- Detectors & Patterns ----
const chineseRegex = /[\u4E00-\u9FFF]/;
const russianRegex = /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/;
const urlRegex = /(https?:\/\/|www\.)\S+/i;
const adultKeywords = ['sex', 'porn', 'xxx', '18+', 'adult', 'nude', 'hot']; // extend if needed

const usernameSpamPatterns = [
  /\d{4,}/, // many digits
  /^(free|official|freegift|giveaway)/i,
  /[_]{3,}/, // many underscores
  /(bot|b0t|promo|offer|pr0mo)/i,
  /[a-z]{1}[_\-\.]{2,}[a-z]{1,}/i,
  /^.{1,3}\d{3,}$/
];

function isUsernameSpam(username) {
  if (!username) return false;
  return usernameSpamPatterns.some(r => r.test(username));
}

// ---- HuggingFace free spam detection function ----
async function hfSpamCheck(text) {
  if (!fetchFn) return false;
  if (!text || text.trim().length === 0) return false;
  try {
    const resp = await fetchFn('https://api-inference.huggingface.co/models/mithun/spam_detector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text })
    });
    const data = await resp.json();
    // data typically looks like: [ [ { label: 'SPAM', score: 0.98 }, ... ] ]
    if (Array.isArray(data) && Array.isArray(data[0]) && data[0].length > 0) {
      const top = data[0][0];
      if (top && top.label && typeof top.label === 'string') {
        return top.label.toLowerCase().includes('spam');
      }
    }
  } catch (e) {
    // silent fail: don't block moderation if HF fails
    console.error('HF spam check error (non-fatal):', e && e.message ? e.message : e);
  }
  return false;
}

// ---- Runtime stores ----
const messageWindow = {}; // { chatId: { userId: [timestamps...] } }
const captchaStore = {};  // { `${chatId}_${userId}`: { answer, expiresAt, tries, welcomeMsgId } }

// ---- Utilities ----
function generateCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { question: `What is ${a} + ${b}?`, answer: a + b };
}

async function isUserAdmin(chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(member.status);
  } catch (e) {
    return ADMIN_IDS.includes(userId); // fallback to env-specified admin IDs
  }
}

// ---- Moderation actions ----
async function deleteAndAct(chatId, userId, messageId, reason) {
  try { await bot.deleteMessage(chatId, messageId); } catch (e) { /* ignore */ }
  const g = await getGroup(chatId);
  if (g.autoBan) {
    try { await bot.kickChatMember(chatId, userId); await incStat(chatId, 'banned'); } catch (e) { /* ignore */ }
    try {
      await bot.sendMessage(chatId, `🚫 <a href="tg://user?id=${userId}">${userId}</a> was banned for: ${reason}`, { parse_mode: 'HTML' });
    } catch (e) { /* ignore */ }
  } else {
    try {
      await bot.sendMessage(chatId, `⚠️ <a href="tg://user?id=${userId}">${userId}</a> warned for: ${reason}`, { parse_mode: 'HTML' });
    } catch (e) { /* ignore */ }
  }
}

// ---- Core moderation pipeline ----
async function moderateMessage(msg) {
  if (!msg || !msg.chat || !msg.from) return;
  const chatId = String(msg.chat.id);
  const userId = msg.from.id;

  // fetch settings
  const settings = await getGroup(chatId);
  const globals = await getGlobals();

  // skip admins & whitelisted
  if (await isUserAdmin(chatId, userId)) return;
  if ((globals.whitelist || []).includes(userId) || (settings.whitelist || []).includes(userId)) return;

  // global/group blacklists
  if ((globals.blacklist || []).includes(userId) || (settings.blacklist || []).includes(userId)) {
    try { await bot.kickChatMember(chatId, userId); await incStat(chatId, 'banned'); } catch (e) { /* ignore */ }
    return;
  }

  // username-based checks
  if (isUsernameSpam(msg.from.username)) {
    await deleteAndAct(chatId, userId, msg.message_id, 'Suspicious username');
    return;
  }

  const text = (msg.text || msg.caption || '').toString();

  // 1) HF AI spam detection (best-effort)
  if (await hfSpamCheck(text)) {
    await deleteAndAct(chatId, userId, msg.message_id, 'AI (HuggingFace) Spam Detected');
    return;
  }

  const lower = text.toLowerCase();

  // 2) language filters
  if (chineseRegex.test(lower) || russianRegex.test(lower)) {
    await deleteAndAct(chatId, userId, msg.message_id, 'Foreign language spam');
    return;
  }

  // 3) adult keywords
  if (adultKeywords.some(w => lower.includes(w))) {
    await deleteAndAct(chatId, userId, msg.message_id, 'Adult content');
    return;
  }

  // 4) link spam
  if (urlRegex.test(lower)) {
    await deleteAndAct(chatId, userId, msg.message_id, 'Link detected');
    return;
  }

  // 5) flood control
  if (settings.floodLimit && settings.floodLimit > 0) {
    messageWindow[chatId] = messageWindow[chatId] || {};
    messageWindow[chatId][userId] = messageWindow[chatId][userId] || [];

    const now = Date.now();
    messageWindow[chatId][userId].push(now);

    // purge old entries
    const cutoff = now - (settings.floodWindowSec || 7) * 1000;
    messageWindow[chatId][userId] = messageWindow[chatId][userId].filter(ts => ts > cutoff);

    if (messageWindow[chatId][userId].length > (settings.floodLimit || 5)) {
      await deleteAndAct(chatId, userId, msg.message_id, 'Flooding');
      messageWindow[chatId][userId] = [];
      return;
    }
  }
}

// ---- New member + captcha handling ----
bot.on('message', async (msg) => {
  try {
    // new members
    if (msg.new_chat_members && msg.new_chat_members.length) {
      const chatId = String(msg.chat.id);
      const settings = await getGroup(chatId);

      for (const user of msg.new_chat_members) {
        if (user.is_bot) {
          try { await bot.kickChatMember(chatId, user.id); await incStat(chatId, 'banned'); } catch (e) { /* ignore */ }
          continue;
        }

        if ((await getGlobals()).whitelist.includes(user.id) || (settings.whitelist || []).includes(user.id)) {
          // allow immediately
          continue;
        }

        if (settings.captcha) {
          // restrict and send captcha
          try { await bot.restrictChatMember(chatId, user.id, { can_send_messages: false }); } catch (e) { /* ignore */ }

          const cap = generateCaptcha();
          const key = `${chatId}_${user.id}`;
          captchaStore[key] = { answer: cap.answer, expiresAt: Date.now() + 120000, tries: 0, welcomeMsgId: null };

          try {
            const sent = await bot.sendMessage(chatId, `${settings.welcome}\n\nPlease solve this captcha within 120 seconds: ${cap.question}`);
            captchaStore[key].welcomeMsgId = sent.message_id;
          } catch (e) { /* ignore */ }

          // schedule kick if not solved
          setTimeout(async () => {
            const stored = captchaStore[key];
            if (!stored) return;
            if (Date.now() > stored.expiresAt) {
              try { await bot.kickChatMember(chatId, user.id); await incStat(chatId, 'banned'); } catch (e) { /* ignore */ }
              delete captchaStore[key];
            }
          }, 125000);
        } else {
          // allow sending immediately
          try {
            await bot.restrictChatMember(chatId, user.id, {
              can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
            });
          } catch (e) { /* ignore */ }
        }
      }
    }

    // captcha answers or normal messages
    if (msg.text) {
      const chatId = String(msg.chat.id);
      const key = `${chatId}_${msg.from.id}`;
      if (captchaStore[key]) {
        const stored = captchaStore[key];
        if (Date.now() > stored.expiresAt) { delete captchaStore[key]; return; }
        const num = parseInt(msg.text.trim());
        if (!isNaN(num) && num === stored.answer) {
          // solved
          try {
            await bot.restrictChatMember(chatId, msg.from.id, {
              can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true
            });
            await bot.sendMessage(chatId, `✅ <a href="tg://user?id=${msg.from.id}">${msg.from.first_name}</a> passed the captcha.`, { parse_mode: 'HTML' });
          } catch (e) { /* ignore */ }
          delete captchaStore[key];
          return;
        } else {
          stored.tries++;
          if (stored.tries >= 3) {
            try { await bot.kickChatMember(chatId, msg.from.id); await incStat(chatId, 'banned'); } catch (e) { /* ignore */ }
            delete captchaStore[key];
            return;
          } else {
            try { await bot.sendMessage(chatId, `❌ Wrong answer. Try again. (${3 - stored.tries} tries left)`, { reply_to_message_id: stored.welcomeMsgId }); } catch (e) { /* ignore */ }
            return;
          }
        }
      }

      // normal group message: moderate
      if (msg.chat.type && (msg.chat.type.endsWith('group') || msg.chat.type === 'supergroup')) {
        await moderateMessage(msg);
      }
    }

  } catch (err) {
    console.error('message handler error:', err && err.stack ? err.stack : err);
  }
});

// ---- Admin commands ----
bot.onText(/\/settings/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const s = await getGroup(chatId);
  const text = `Current settings:\nCaptcha: ${s.captcha}\nAutoBan: ${s.autoBan}\nFloodLimit: ${s.floodLimit} msgs / ${s.floodWindowSec}s\nWelcome: ${s.welcome}`;
  bot.sendMessage(chatId, text);
});

bot.onText(/\/setwelcome\s+([\s\S]+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const val = match[1].trim();
  await upsertGroup(chatId, { welcome: val });
  bot.sendMessage(chatId, 'Welcome message updated.');
});

bot.onText(/\/whitelist\s+(add|remove)\s+(\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const action = match[1], uid = Number(match[2]);
  const s = await getGroup(chatId);
  let arr = s.whitelist || [];
  if (action === 'add') {
    arr.push(uid); arr = Array.from(new Set(arr)); await upsertGroup(chatId, { whitelist: arr }); bot.sendMessage(chatId, 'Added to group whitelist.');
  } else {
    arr = arr.filter(x => x !== uid); await upsertGroup(chatId, { whitelist: arr }); bot.sendMessage(chatId, 'Removed from group whitelist.');
  }
});

bot.onText(/\/blacklist\s+(add|remove)\s+(\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const action = match[1], uid = Number(match[2]);
  const s = await getGroup(chatId);
  let arr = s.blacklist || [];
  if (action === 'add') {
    arr.push(uid); arr = Array.from(new Set(arr)); await upsertGroup(chatId, { blacklist: arr }); bot.sendMessage(chatId, 'Added to group blacklist.');
  } else {
    arr = arr.filter(x => x !== uid); await upsertGroup(chatId, { blacklist: arr }); bot.sendMessage(chatId, 'Removed from group blacklist.');
  }
});

bot.onText(/\/ban\s+(\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const uid = Number(match[1]);
  try { await bot.kickChatMember(chatId, uid); await incStat(chatId, 'banned'); bot.sendMessage(chatId, 'User banned.'); } catch (e) { bot.sendMessage(chatId, 'Failed to ban. Make sure I have admin rights.'); }
});

bot.onText(/\/unban\s+(\d+)/, async (msg, match) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const uid = Number(match[1]);
  try { await bot.unbanChatMember(chatId, uid); bot.sendMessage(chatId, 'User unbanned.'); } catch (e) { bot.sendMessage(chatId, 'Failed to unban.'); }
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = String(msg.chat.id);
  if (!await isUserAdmin(chatId, msg.from.id) && !ADMIN_IDS.includes(msg.from.id)) return;
  const st = await getStats(chatId);
  bot.sendMessage(chatId, `Stats: banned=${st.banned||0} kicked=${st.kicked||0} deleted=${st.deleted||0}`);
});

// ---- Simple Admin Dashboard ----
const app = express();

function checkAuth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== DASH_USER || user.pass !== DASH_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

app.get('/', checkAuth, async (req, res) => {
  try {
    const globals = await getGlobals();
    const groups = await groupsCol.find({}).limit(200).toArray();
    const stats = await statsCol.find({}).limit(200).toArray();
    res.send(`<h2>Bot Admin Dashboard</h2><pre>Globals: ${JSON.stringify(globals,null,2)}</pre><pre>Groups (sample): ${JSON.stringify(groups,null,2)}</pre><pre>Stats (sample): ${JSON.stringify(stats,null,2)}</pre>`);
  } catch (e) {
    res.status(500).send('Error fetching dashboard data');
  }
});

app.listen(DASH_PORT, () => console.log(`Admin dashboard running at http://localhost:${DASH_PORT} (user: ${DASH_USER})`));

// ---- Graceful shutdown ----
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try { if (dbClient) await dbClient.close(); } catch (e) {}
  process.exit();
});
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  try { if (dbClient) await dbClient.close(); } catch (e) {}
  process.exit();
});

console.log('Bot started (MongoDB + HuggingFace AI + Captcha + Moderation).');
