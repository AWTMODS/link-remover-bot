# 🛡️ Link Remover & Anti-Spam Bot

A powerful, modular Telegram bot designed to keep your groups clean and safe. Features advanced spam detection, captcha verification, media filters, and a user-friendly admin dashboard.

## ✨ Features

### 🤖 **Advanced Spam Protection**
- **AI-Powered Detection**: Uses HuggingFace AI to detect and delete spam messages.
- **Link Remover**: Automatically deletes messages with links (unless whitelisted).
- **Flood Control**: Prevents users from spamming multiple messages in a short time.
- **Keyword Blacklist**: Automatically deletes messages containing forbidden words.
- **Foreign Language Filter**: Blocks Chinese and Russian characters (configurable).

### 🔐 **Security & Verification**
- **Button Captcha**: New members must solve a math equation (via inline buttons) to chat.
- **Auto-Ban**: Automatically bans users after 3 warnings or repeated violations.
- **User Whitelist/Blacklist**: Exempt specific users from checks or permanently block them.

### 🚫 **Media Filters**
- **Block Stickers**: Prevent users from sending stickers.
- **Block GIFs**: Prevent users from sending GIFs.
- **Block Voice Notes**: Prevent users from sending voice messages.

### ⚙️ **Management & Configuration**
- **DM Admin Dashboard**: Configure group settings privately via DM.
- **Custom Welcome Message**: Set a personalized welcome message with placeholders.
- **Reporting System**: Users can report messages to admins.
- **Logging**: Logs moderation actions to a specified Telegram channel.

---

## 🛠️ Commands

### **Admin Commands (Group)**
| Command | Description |
| :--- | :--- |
| `/settings` | View current group settings. |
| `/warn <user_id> [reason]` | Warn a user. (3 warnings = Ban) |
| `/mute <user_id> [minutes]` | Mute a user for X minutes (default: 60). |
| `/unmute <user_id>` | Unmute a user. |
| `/ban <user_id>` | Ban a user manually. |
| `/unban <user_id>` | Unban a user manually. |
| `/info [reply/id]` | View user info and warning count. |
| `/setwelcome <text>` | Set welcome message. Supports `{name}`, `{username}`, `{id}`, `{group}`. |
| `/linkwhitelist add/remove <domain>` | Allow specific domains (e.g., `youtube.com`). |
| `/badword add/remove <word>` | Add/remove words from the blacklist. |
| `/badwords` | List all blacklisted words. |
| `/whitelist add/remove <user_id>` | Exempt a user from all checks. |
| `/blacklist add/remove <user_id>` | Permanently block a user. |
| `/toggle <sticker|gif|voice> <on|off>` | Enable/Disable media blocks. |
| `/stats` | View moderation statistics for the group. |

### **User Commands**
| Command | Description |
| :--- | :--- |
| `/report` | Reply to a message to report it to group admins. |

### **DM Dashboard (Private)**
Send `/settings` to the bot in a **Private Message** to open the interactive dashboard. You can toggle:
- Captcha
- Auto-Ban
- Sticker/GIF/Voice Blocks

---

## 🚀 Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/AWTMODS/link-remover-bot.git
    cd link-remover-bot
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    Create a `.env` file in the root directory:
    ```env
    BOT_TOKEN=your_telegram_bot_token
    MONGO_URI=your_mongodb_connection_string
    ADMIN_IDS=123456789,987654321
    LOG_CHANNEL_ID=-100xxxxxxxxxx  # Optional
    
    # Default Settings for New Groups
    DEFAULT_CAPTCHA=true
    DEFAULT_AUTO_BAN=true
    DEFAULT_FLOOD_LIMIT=5
    DEFAULT_BLOCK_STICKERS=false
    DEFAULT_BLOCK_GIFS=false
    DEFAULT_BLOCK_VOICE=false
    ```

4.  **Start the Bot**:
    ```bash
    npm start
    ```

## 📝 License
This project is licensed under the MIT License.
