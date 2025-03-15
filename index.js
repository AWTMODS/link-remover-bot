require("dotenv").config();
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

const bot = new Telegraf(process.env.BOT_TOKEN);

// User schema for tracking warnings
const userSchema = new mongoose.Schema({
  userId: Number,
  warnings: { type: Number, default: 0 },
  mutedUntil: { type: Date, default: null },
});

const User = mongoose.model("User", userSchema);

// Function to check if the message contains a URL
function containsUrl(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
}

// Function to auto-delete bot messages after 30 minutes
async function autoDeleteMessage(ctx, messageId) {
  setTimeout(async () => {
    try {
      await ctx.deleteMessage(messageId);
    } catch (error) {
      console.error("❌ Failed to delete message:", error);
    }
  }, 30 * 60 * 1000); // 30 minutes
}

// Middleware to handle messages
bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name;

  if (ctx.message.text && containsUrl(ctx.message.text)) {
    try {
      let user = await User.findOne({ userId });

      if (!user) {
        user = new User({ userId });
      }

      user.warnings += 1;

      if (user.warnings < 3) {
        await ctx.deleteMessage(); // Delete the message
        const warningMsg = await ctx.reply(
          `⚠️ ${userName}, you are not allowed to send links! Warning ${user.warnings}/3. After 3 warnings, you will be muted for 1 hour.`
        );

        autoDeleteMessage(ctx, warningMsg.message_id); // Auto-delete warning message
      } else {
        const muteUntil = new Date(Date.now() + 3600 * 1000); // 1 hour
        user.mutedUntil = muteUntil;

        await ctx.telegram.restrictChatMember(chatId, userId, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(muteUntil.getTime() / 1000),
        });

        const muteMsg = await ctx.reply(
          `🔇 ${userName} has been muted for 1 hour due to repeated rule violations.`
        );

        autoDeleteMessage(ctx, muteMsg.message_id); // Auto-delete mute message

        user.warnings = 0; // Reset warnings after mute
      }

      await user.save();
    } catch (error) {
      console.error("Database Error:", error);
    }
  }
});

bot.launch();
console.log("🚀 Bot is running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
