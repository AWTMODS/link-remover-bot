const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.logChannelId = process.env.LOG_CHANNEL_ID || null;

        // Defaults
        this.defaults = {
            captcha: true,
            autoBan: false,
            floodLimit: 5,
            blockStickers: false,
            blockGifs: false,
            blockVoice: false
        };
    }

    async connect(uri) {
        this.client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await this.client.connect();
        this.db = this.client.db();
        this.groupsCol = this.db.collection('groups');
        this.globalsCol = this.db.collection('globals');
        this.statsCol = this.db.collection('stats');
        this.warningsCol = this.db.collection('warnings');
        this.usersCol = this.db.collection('users'); // Global reputation
        this.rolesCol = this.db.collection('roles'); // Custom roles

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
                blockVoice: this.defaults.blockVoice,
                blockForwards: false,
                raidMode: false,
                linkFilterLevel: 'whitelist', // 'strict', 'whitelist', 'off'
                ocrEnabled: false,
                reputationEnabled: true,
                language: 'en'
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

    async updateReputation(userId, change) {
        await this.usersCol.updateOne(
            { _id: Number(userId) },
            { $inc: { reputation: change }, $setOnInsert: { lastSeen: Date.now() } },
            { upsert: true }
        );
    }

    async getReputation(userId) {
        const u = await this.usersCol.findOne({ _id: Number(userId) });
        return u ? (u.reputation || 0) : 0;
    }

    async setRole(chatId, userId, role) {
        await this.rolesCol.updateOne(
            { chatId: String(chatId), userId: Number(userId) },
            { $set: { role } },
            { upsert: true }
        );
    }

    async getRole(chatId, userId) {
        const r = await this.rolesCol.findOne({ chatId: String(chatId), userId: Number(userId) });
        return r ? r.role : null;
    }

    // --- Phase 3: Global Intelligence & UX ---

    async logAppeal(chatId, userId, reason) {
        await this.db.collection('appeals').insertOne({
            chatId: String(chatId),
            userId: Number(userId),
            reason,
            timestamp: Date.now(),
            status: 'pending'
        });
    }

    async addBan(chatId, userId, duration = null) {
        const until = duration ? Date.now() + duration : null;
        await this.db.collection('bans').updateOne(
            { chatId: String(chatId), userId: Number(userId) },
            { $set: { until, timestamp: Date.now() } },
            { upsert: true }
        );
    }

    async removeBan(chatId, userId) {
        await this.db.collection('bans').deleteOne({ chatId: String(chatId), userId: Number(userId) });
    }

    async getActiveBans() {
        // Return bans that have an expiry date
        return await this.db.collection('bans').find({ until: { $ne: null } }).toArray();
    }

    // --- Phase 2: Analytics & Automation ---

    async logActivity(chatId, userId, action, details = '') {
        try {
            await this.db.collection('activity_logs').insertOne({
                chatId: String(chatId),
                userId: Number(userId),
                action,
                details,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error('Failed to log activity:', e.message);
        }
    }

    async getChatStats(chatId, days = 1) {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const logs = await this.db.collection('activity_logs').find({
            chatId: String(chatId),
            timestamp: { $gt: cutoff }
        }).toArray();

        const stats = {
            messages: logs.filter(l => l.action === 'MESSAGE').length,
            bans: logs.filter(l => l.action === 'BAN').length,
            spam: logs.filter(l => l.action === 'DELETE').length,
            activeUsers: new Set(logs.map(l => l.userId)).size,
            topUsers: []
        };

        // Calculate top users
        const userCounts = {};
        logs.filter(l => l.action === 'MESSAGE').forEach(l => {
            userCounts[l.userId] = (userCounts[l.userId] || 0) + 1;
        });
        stats.topUsers = Object.entries(userCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([uid, count]) => ({ userId: uid, count }));

        return stats;
    }

    async addPendingDomain(domain, userId) {
        await this.db.collection('pending_domains').updateOne(
            { domain: domain.toLowerCase() },
            { $set: { suggestedBy: Number(userId), timestamp: Date.now() } },
            { upsert: true }
        );
    }

    async getPendingDomains() {
        return await this.db.collection('pending_domains').find({}).toArray();
    }

    async approveDomain(domain) {
        await this.db.collection('pending_domains').deleteOne({ domain });
        const globals = await this.getGlobals();
        const arr = globals.whitelistDomains || [];
        arr.push(domain);
        await this.globalsCol.updateOne({}, { $set: { whitelistDomains: Array.from(new Set(arr)) } });
    }

    async denyPendingDomain(domain) {
        await this.db.collection('pending_domains').deleteOne({ domain });
    }
}

module.exports = Database;
