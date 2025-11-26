const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.groupsCol = null;
        this.globalsCol = null;
        this.statsCol = null;
        this.warningsCol = null;

        // Defaults
        this.defaults = {
            captcha: process.env.DEFAULT_CAPTCHA === 'false' ? false : true,
            autoBan: process.env.DEFAULT_AUTO_BAN === 'false' ? false : true,
            floodLimit: parseInt(process.env.DEFAULT_FLOOD_LIMIT || '5'),
            blockStickers: process.env.DEFAULT_BLOCK_STICKERS === 'true',
            blockGifs: process.env.DEFAULT_BLOCK_GIFS === 'true',
            blockVoice: process.env.DEFAULT_BLOCK_VOICE === 'true'
        };

        this.logChannelId = process.env.LOG_CHANNEL_ID;
    }

    async connect(uri) {
        this.client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await this.client.connect();
        this.db = this.client.db();
        this.groupsCol = this.db.collection('groups');
        this.globalsCol = this.db.collection('globals');
        this.statsCol = this.db.collection('stats');
        this.warningsCol = this.db.collection('warnings');

        // Ensure globals
        const g = await this.globalsCol.findOne({ _id: 'globals' });
        if (!g) await this.globalsCol.insertOne({ _id: 'globals', whitelist: [], blacklist: [] });

        console.log('MongoDB connected.');
    }

    async close() {
        if (this.client) await this.client.close();
    }

    async getGlobals() {
        const g = await this.globalsCol.findOne({ _id: 'globals' });
        return g || { whitelist: [], blacklist: [] };
    }

    async getGroup(chatId) {
        const id = String(chatId);
        let g = await this.groupsCol.findOne({ _id: id });
        if (!g) {
            g = {
                _id: id,
                captcha: this.defaults.captcha,
                autoBan: this.defaults.autoBan,
                floodLimit: this.defaults.floodLimit,
                floodWindowSec: 7,
                welcome: 'Welcome! Please solve the captcha when prompted.',
                whitelist: [],
                blacklist: [],
                whitelistDomains: [],
                blacklistWords: [],
                blockStickers: this.defaults.blockStickers,
                blockGifs: this.defaults.blockGifs,
                blockVoice: this.defaults.blockVoice
            };
            await this.groupsCol.insertOne(g);
        }
        return g;
    }

    async upsertGroup(chatId, patch) {
        await this.groupsCol.updateOne({ _id: String(chatId) }, { $set: patch }, { upsert: true });
    }

    async incStat(chatId, key) {
        await this.statsCol.updateOne({ _id: String(chatId) }, { $inc: { [key]: 1 } }, { upsert: true });
    }

    async getStats(chatId) {
        return (await this.statsCol.findOne({ _id: String(chatId) })) || { banned: 0, kicked: 0, deleted: 0 };
    }

    async addWarning(chatId, userId, reason) {
        const key = `${chatId}_${userId}`;
        await this.warningsCol.updateOne(
            { _id: key },
            { $inc: { count: 1 }, $set: { lastWarning: Date.now(), reason } },
            { upsert: true }
        );
        const doc = await this.warningsCol.findOne({ _id: key });
        return doc.count;
    }

    async clearWarnings(chatId, userId) {
        await this.warningsCol.deleteOne({ _id: `${chatId}_${userId}` });
    }

    async getWarning(chatId, userId) {
        return await this.warningsCol.findOne({ _id: `${chatId}_${userId}` });
    }

    async logAction(bot, chatId, action, details) {
        const msg = `#${action}\nChat: ${chatId}\n${details}`;
        console.log(msg);
        if (this.logChannelId) {
            try { await bot.sendMessage(this.logChannelId, msg); } catch (e) { console.error('Failed to log to channel:', e.message); }
        }
    }
}

module.exports = Database;
