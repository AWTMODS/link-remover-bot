# 🛡️ Advanced Telegram Anti-Spam Bot

A comprehensive, production-ready Telegram bot for group moderation and spam prevention with advanced security features, analytics, and a powerful DM-based admin dashboard.

## ✨ Features

### 🔒 Core Security
- **AI-Powered Spam Detection**: Hugging Face integration for intelligent spam filtering
- **OCR Image Scanning**: Detect spam text in images using Tesseract.js
- **Multi-Language Filtering**: Block Chinese and Russian spam
- **Adult Content Filter**: Keyword-based detection
- **Username Spam Detection**: Pattern-based suspicious username filtering
- **Link Management**: Whitelist/strict/off modes with auto-learning
- **Anti-Forward**: Block forwarded messages
- **Flood Control**: Configurable message rate limiting with critical alerts

### 👥 User Management
- **Reputation System**: Global trust scores across groups
- **Temporary Bans**: Ban users for specific durations (minutes/hours/days)
- **Appeal System**: Banned users can appeal via DM
- **Warning System**: 3-strike auto-ban
- **Whitelist/Blacklist**: Per-group and global lists
- **Role-Based Permissions**: Owner/Admin/Mod hierarchy

### 📊 Analytics & Automation
- **Activity Logging**: Persistent user activity tracking
- **Advanced Statistics**: Daily activity, spam counts, top users
- **Auto-Learning Whitelist**: High-reputation users suggest safe domains
- **Critical Alerts**: Admin notifications for severe spam events
- **Automated Cleanup**: Daily removal of old logs (>30 days)

### 🌍 User Experience
- **Multi-Language Support**: i18n system (currently English)
- **DM Admin Dashboard**: Complete bot control via inline buttons
- **Adaptive Captcha**: Difficulty adjusts based on spam levels
- **Raid Mode**: Emergency lockdown for mass spam attacks
- **Backup/Restore**: Export/import group configurations

### 🎛️ DM Dashboard Features
Access via `/settings` in DM with the bot:
- Toggle all features (Captcha, AutoBan, Raid Mode, etc.)
- Manage users (whitelist/blacklist)
- Manage domains (whitelist)
- Manage keywords (blacklist)
- Approve/deny pending domains
- View statistics
- User info lookup

### 🚀 Production Features
- **Rate Limiting**: 5 commands/minute per user
- **Error Handling**: Comprehensive try-catch blocks
- **State Management**: Persistent user interaction states
- **Scheduled Tasks**: Auto-cleanup and ban expiry checks

## 📋 Commands

### Admin Commands
- `/settings` - Open DM dashboard (DM only)
- `/ban <user_id> [duration]` - Ban user (e.g., `/ban 123456 1h`)
- `/unban <user_id>` - Unban user
- `/warn <user_id> [reason]` - Warn user (3 warnings = auto-ban)
- `/stats` - View advanced statistics
- `/setlang <code>` - Set language (en/es/fr/de/ru)
- `/backup` - Export group configuration
- `/restore` - Import configuration (reply to backup file)
- `/promote <user_id> <role>` - Promote to admin/mod
- `/demote <user_id>` - Remove role

### User Commands
- `/appeal <reason>` - Appeal ban (DM only)
- `/myrep` - Check your reputation score

## 🔧 Configuration

### Environment Variables
Create a `.env` file:
```env
BOT_TOKEN=your_telegram_bot_token
MONGO_URI=your_mongodb_connection_string
ADMIN_IDS=123456789,987654321
LOG_CHANNEL_ID=-1001234567890  # Optional
```

### Group Settings (via Dashboard)
- **Captcha**: Enable/disable new member verification
- **AutoBan**: Automatically ban spammers vs. just delete
- **Flood Limit**: Messages per 7 seconds (default: 5)
- **Link Filter**: `whitelist` (default), `strict`, or `off`
- **Block Forwards**: Prevent forwarded messages
- **Block Stickers/GIFs/Voice**: Media restrictions
- **Raid Mode**: Emergency lockdown
- **OCR Enabled**: Scan images for spam text
- **Reputation Enabled**: Track user trust scores

## 🚀 Installation

### Prerequisites
- Node.js 16+
- MongoDB database
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### Setup
```bash
# Clone repository
git clone https://github.com/AWTMODS/link-remover-bot.git
cd link-remover-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Start bot
npm start
```

### Dependencies
```json
{
  "node-telegram-bot-api": "^0.64.0",
  "mongodb": "^6.3.0",
  "dotenv": "^16.3.1",
  "node-fetch": "^2.7.0",
  "tesseract.js": "^5.0.4"
}
```

## 📖 Usage Guide

### Initial Setup
1. Add bot to your group
2. Promote bot to admin with delete/ban permissions
3. Send `/settings` to bot in DM
4. Configure your group settings via dashboard

### Managing Users
**Via Dashboard:**
1. `/settings` in DM → Select group
2. Click "👥 Manage Users"
3. Click "➕ Add to Whitelist/Blacklist"
4. Send user ID

**Via Commands:**
```
/ban 123456789 2h    # Ban for 2 hours
/warn 123456789 spam # Warn user
/unban 123456789     # Unban user
```

### Managing Domains
1. `/settings` → Select group → "🌐 Manage Domains"
2. Click "➕ Add Domain"
3. Send domain (e.g., `example.com`)

### Approving Auto-Learned Domains
High-reputation users (>50) who post links trigger auto-learning:
1. `/settings` → "⏳ Pending Domains"
2. Click ✅ to approve or ❌ to deny

### Viewing Statistics
**Via Dashboard:** `/settings` → "📊 View Stats"

**Via Command:** `/stats` in group

## 🔐 Security Features

### Spam Detection Layers
1. **AI Detection**: Hugging Face spam classifier
2. **Pattern Matching**: Username, language, keywords
3. **Link Filtering**: Whitelist-based with auto-learning
4. **OCR Scanning**: Image text analysis
5. **Flood Control**: Rate limiting with critical alerts
6. **Reputation System**: Trust-based filtering

### Raid Protection
Enable "🚨 Raid Mode" to:
- Auto-ban all new members
- Maximum security during spam attacks
- Toggle off when threat passes

## 📊 Analytics

### Activity Tracking
- All messages logged with timestamps
- User activity timelines
- Spam event tracking
- Ban/delete statistics

### Statistics Dashboard
- Last 24h activity summary
- Top active users
- Spam counts
- All-time totals

## 🌍 Localization

Currently supports English. To add languages:
1. Create `locales/<lang>.json`
2. Copy structure from `locales/en.json`
3. Translate strings
4. Use `/setlang <lang>` in group

## 🛠️ Development

### Project Structure
```
link-remover-bot/
├── index.js              # Main entry point
├── src/
│   ├── Database.js       # MongoDB operations
│   ├── Moderator.js      # Spam detection logic
│   ├── Captcha.js        # Captcha generation
│   └── Commands.js       # Command handlers & dashboard
├── locales/
│   └── en.json          # English translations
└── .env                 # Configuration
```

### Adding Features
1. Update `Database.js` for new data models
2. Add logic to `Moderator.js` for filtering
3. Create commands in `Commands.js`
4. Update dashboard UI as needed

## 🐛 Troubleshooting

### Bot not responding
- Check bot has admin permissions
- Verify `BOT_TOKEN` in `.env`
- Check MongoDB connection

### Captcha not working
- Ensure bot can restrict members
- Check bot is admin with appropriate permissions

### Dashboard not showing groups
- You must be admin in the group
- Bot must be added to group

## 📝 License

MIT License - feel free to use and modify

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation

## 🎯 Roadmap

- [ ] Global ban synchronization
- [ ] Web-based admin panel
- [ ] More language translations
- [ ] Advanced ML spam detection
- [ ] Webhook support

---

**Made with ❤️ for safer Telegram communities**
