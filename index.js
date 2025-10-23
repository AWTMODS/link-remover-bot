const { Telegraf, session, Scenes: { BaseScene, Stage } } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Bot Configuration
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const ADMIN_IDS = []; // Add admin user IDs here
const MAX_WARNINGS = 3;

// Language scripts detection
const LANGUAGE_SCRIPTS = {
    chinese: { ranges: [[0x4E00, 0x9FFF], [0x3400, 0x4DBF], [0x20000, 0x2A6DF]], name: 'Chinese' },
    arabic: { ranges: [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF]], name: 'Arabic' },
    russian: { ranges: [[0x0400, 0x04FF]], name: 'Russian' },
    japanese: { ranges: [[0x3040, 0x309F], [0x30A0, 0x30FF], [0x4E00, 0x9FFF]], name: 'Japanese' },
    korean: { ranges: [[0xAC00, 0xD7AF], [0x1100, 0x11FF]], name: 'Korean' },
    hindi: { ranges: [[0x0900, 0x097F]], name: 'Hindi' }
};

// Database setup
const db = new sqlite3.Database('group_management.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS warnings (
            user_id INTEGER,
            chat_id INTEGER,
            warnings INTEGER DEFAULT 0,
            reason TEXT,
            last_warned DATETIME,
            PRIMARY KEY (user_id, chat_id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS banned_words (
            chat_id INTEGER,
            words TEXT,
            PRIMARY KEY (chat_id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS banned_languages (
            chat_id INTEGER,
            languages TEXT,
            PRIMARY KEY (chat_id)
        )
    `);
    
    db.run(`
        CREATE TABLE IF NOT EXISTS user_mutes (
            user_id INTEGER,
            chat_id INTEGER,
            unmute_time DATETIME,
            PRIMARY KEY (user_id, chat_id)
        )
    `);
});

class GroupManagerBot {
    constructor() {
        this.bot = new Telegraf(BOT_TOKEN);
        this.setupHandlers();
    }
    
    setupHandlers() {
        // Admin commands
        this.bot.command('start', (ctx) => this.startCommand(ctx));
        this.bot.command('warn', (ctx) => this.warnUser(ctx));
        this.bot.command('ban', (ctx) => this.banUser(ctx));
        this.bot.command('unban', (ctx) => this.unbanUser(ctx));
        this.bot.command('mute', (ctx) => this.muteUser(ctx));
        this.bot.command('unmute', (ctx) => this.unmuteUser(ctx));
        this.bot.command('addbannedwords', (ctx) => this.addBannedWords(ctx));
        this.bot.command('removebannedwords', (ctx) => this.removeBannedWords(ctx));
        this.bot.command('addbannedlang', (ctx) => this.addBannedLanguages(ctx));
        this.bot.command('removebannedlang', (ctx) => this.removeBannedLanguages(ctx));
        this.bot.command('listbannedlang', (ctx) => this.listBannedLanguages(ctx));
        this.bot.command('warnings', (ctx) => this.checkWarnings(ctx));
        this.bot.command('resetwarnings', (ctx) => this.resetWarnings(ctx));
        
        // Message handler
        this.bot.on('text', (ctx) => this.handleMessage(ctx));
        
        // Error handler
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
        });
    }
    
    async startCommand(ctx) {
        const welcomeText = `
🤖 *Group Management Bot*

*Admin Commands:*
/warn @username - Warn a user
/ban @username - Ban a user
/unban @username - Unban a user
/mute @username - Mute a user
/unmute @username - Unmute a user
/warnings @username - Check user warnings
/resetwarnings @username - Reset user warnings
/addbannedwords words - Add banned words
/removebannedwords words - Remove banned words
/addbannedlang lang1 lang2 - Add banned languages
/removebannedlang lang1 lang2 - Remove banned languages
/listbannedlang - List banned languages

*Available Languages:* chinese, arabic, russian, japanese, korean, hindi

*Auto Features:*
- Link detection & deletion
- Banned words detection
- Banned languages detection
- Warning system (${MAX_WARNINGS} warnings = ban)
        `;
        
        await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
    }
    
    async handleMessage(ctx) {
        const message = ctx.message;
        const user = message.from;
        const chatId = message.chat.id;
        const text = message.text;
        
        // Skip if message is from admin
        if (await this.isAdmin(ctx)) {
            return;
        }
        
        // Check for links
        if (this.containsLinks(text)) {
            await this.handleRuleViolation(ctx, "Link sharing is not allowed");
            return;
        }
        
        // Check for banned words
        const bannedWords = await this.getBannedWords(chatId);
        if (bannedWords.length > 0 && this.containsBannedWords(text, bannedWords)) {
            await this.handleRuleViolation(ctx, "Banned words detected");
            return;
        }
        
        // Check for banned languages
        const bannedLanguages = await this.getBannedLanguages(chatId);
        if (bannedLanguages.length > 0) {
            const detectedLangs = this.detectLanguages(text, bannedLanguages);
            if (detectedLangs.length > 0) {
                const langNames = detectedLangs.map(lang => LANGUAGE_SCRIPTS[lang].name);
                await this.handleRuleViolation(
                    ctx, 
                    `Banned languages detected: ${langNames.join(', ')}`
                );
                return;
            }
        }
    }
    
    detectLanguages(text, bannedLanguages) {
        const detected = [];
        for (let char of text) {
            for (let lang of bannedLanguages) {
                if (LANGUAGE_SCRIPTS[lang]) {
                    for (let [start, end] of LANGUAGE_SCRIPTS[lang].ranges) {
                        const charCode = char.codePointAt(0);
                        if (charCode >= start && charCode <= end) {
                            if (!detected.includes(lang)) {
                                detected.push(lang);
                            }
                            break;
                        }
                    }
                }
            }
        }
        return detected;
    }
    
    containsLinks(text) {
        const urlPatterns = [
            /http[s]?:\/\/(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+/,
            /www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
            /t\.me\/[a-zA-Z0-9_]+/,
            /@[a-zA-Z0-9_]+/
        ];
        
        return urlPatterns.some(pattern => pattern.test(text));
    }
    
    containsBannedWords(text, bannedWords) {
        const textLower = text.toLowerCase();
        return bannedWords.some(word => textLower.includes(word.toLowerCase()));
    }
    
    async handleRuleViolation(ctx, reason) {
        const message = ctx.message;
        const user = message.from;
        const chatId = message.chat.id;
        
        // Delete the violating message
        try {
            await ctx.deleteMessage(message.message_id);
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
        
        // Add warning
        const warnings = await this.addWarning(user.id, chatId, reason);
        
        // Send warning message
        const warnMessage = `
⚠️ *Warning for* ${user.first_name}

*Reason:* ${reason}
*Warning:* ${warnings}/${MAX_WARNINGS}

Please follow group rules. ${MAX_WARNINGS - warnings} warnings left before ban.
        `;
        
        const sentMessage = await ctx.reply(warnMessage, { 
            parse_mode: 'Markdown',
            reply_to_message_id: message.message_id
        });
        
        // Ban user if max warnings reached
        if (warnings >= MAX_WARNINGS) {
            await this.banUserAuto(ctx, user.id, "Max warnings reached");
            
            // Delete warning message after 5 seconds
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(sentMessage.message_id);
                } catch (error) {
                    console.error('Failed to delete warning message:', error);
                }
            }, 5000);
        }
    }
    
    async banUserAuto(ctx, userId, reason) {
        try {
            await ctx.banChatMember(userId);
            
            const banMessage = `
🚫 *User Banned*

*User ID:* \`${userId}\`
*Reason:* ${reason}
*Time:* ${new Date().toLocaleString()}
            `;
            
            await ctx.reply(banMessage, { parse_mode: 'Markdown' });
            
            // Reset warnings after ban
            await this.resetUserWarnings(userId, ctx.chat.id);
            
        } catch (error) {
            console.error(`Failed to ban user ${userId}:`, error);
        }
    }
    
    // Language Management Methods
    async getBannedLanguages(chatId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT languages FROM banned_languages WHERE chat_id = ?',
                [chatId],
                (err, row) => {
                    if (err) reject(err);
                    if (row && row.languages) {
                        resolve(JSON.parse(row.languages));
                    } else {
                        resolve([]);
                    }
                }
            );
        });
    }
    
    async setBannedLanguages(chatId, languages) {
        const validLanguages = languages.filter(lang => LANGUAGE_SCRIPTS[lang]);
        
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT OR REPLACE INTO banned_languages (chat_id, languages) VALUES (?, ?)',
                [chatId, JSON.stringify(validLanguages)],
                (err) => {
                    if (err) reject(err);
                    resolve(validLanguages);
                }
            );
        });
    }
    
    async addBannedLanguages(ctx) {
        if (!await this.isAdmin(ctx)) {
            await ctx.reply("❌ Only admins can use this command.");
            return;
        }
        
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            await ctx.reply(
                "Usage: /addbannedlang lang1 lang2 lang3\n\n" +
                "Available languages: chinese, arabic, russian, japanese, korean, hindi"
            );
            return;
        }
        
        const chatId = ctx.chat.id;
        const currentLangs = await this.getBannedLanguages(chatId);
        const newLangs = args.map(lang => lang.toLowerCase());
        
        const validLangs = newLangs.filter(lang => LANGUAGE_SCRIPTS[lang]);
        const invalidLangs = newLangs.filter(lang => !LANGUAGE_SCRIPTS[lang]);
        
        const updatedLangs = [...new Set([...currentLangs, ...validLangs])];
        const addedLangs = await this.setBannedLanguages(chatId, updatedLangs);
        
        let response = `✅ Added ${addedLangs.length} languages to banned list.\n`;
        response += `Banned languages: ${addedLangs.join(', ')}\n`;
        
        if (invalidLangs.length > 0) {
            response += `❌ Invalid languages: ${invalidLangs.join(', ')}`;
        }
        
        await ctx.reply(response);
    }
    
    async removeBannedLanguages(ctx) {
        if (!await this.isAdmin(ctx)) {
            await ctx.reply("❌ Only admins can use this command.");
            return;
        }
        
        const args = ctx.message.text.split(' ').slice(1);
        if (args.length === 0) {
            await ctx.reply("Usage: /removebannedlang lang1 lang2 lang3");
            return;
        }
        
        const chatId = ctx.chat.id;
        const currentLangs = await this.getBannedLanguages(chatId);
        const removeLangs = args.map(lang => lang.toLowerCase());
        
        const updatedLangs = currentLangs.filter(lang => !removeLangs.includes(lang));
        await this.setBannedLanguages(chatId, updatedLangs);
        
        await ctx.reply(
            `✅ Removed ${removeLangs.length} languages from banned list.\n` +
            `Current banned languages: ${updatedLangs.length > 0 ? updatedLangs.join(', ') : 'None'}`
        );
    }
    
    async listBannedLanguages(ctx) {
        const chatId = ctx.chat.id;
        const bannedLangs = await this.getBannedLanguages(chatId);
        
        if (bannedLangs.length > 0) {
            const langNames = bannedLangs.map(lang => LANGUAGE_SCRIPTS[lang].name);
            await ctx.reply(
                `🚫 *Banned Languages:*\n${langNames.join(', ')}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.reply("✅ No languages are currently banned.");
        }
    }
    
    // Database methods
    async addWarning(userId, chatId, reason) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO warnings (user_id, chat_id, warnings, reason, last_warned)
                 VALUES (?, ?, COALESCE((SELECT warnings FROM warnings WHERE user_id = ? AND chat_id = ?), 0) + 1, ?, ?)`,
                [userId, chatId, userId, chatId, reason, new Date().toISOString()],
                function(err) {
                    if (err) reject(err);
                    
                    db.get(
                        'SELECT warnings FROM warnings WHERE user_id = ? AND chat_id = ?',
                        [userId, chatId],
                        (err, row) => {
                            if (err) reject(err);
                            resolve(row ? row.warnings : 0);
                        }
                    );
                }
            );
        });
    }
    
    async getBannedWords(chatId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT words FROM banned_words WHERE chat_id = ?',
                [chatId],
                (err, row) => {
                    if (err) reject(err);
                    if (row && row.words) {
                        resolve(JSON.parse(row.words));
                    } else {
                        resolve([]);
                    }
                }
            );
        });
    }
    
    async resetUserWarnings(userId, chatId) {
        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM warnings WHERE user_id = ? AND chat_id = ?',
                [userId, chatId],
                (err) => {
                    if (err) reject(err);
                    resolve();
                }
            );
        });
    }
    
    async isAdmin(ctx) {
        const user = ctx.from;
        if (ADMIN_IDS.includes(user.id)) {
            return true;
        }
        
        try {
            const chatMember = await ctx.getChatMember(user.id);
            return ['administrator', 'creator'].includes(chatMember.status);
        } catch (error) {
            return false;
        }
    }
    
    run() {
        console.log('Bot is running...');
        this.bot.launch();
        
        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}

// Create and run bot
const bot = new GroupManagerBot();
bot.run();
