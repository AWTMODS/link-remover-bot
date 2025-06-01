require("dotenv").config();
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Initialize the bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// User Schema
const userSchema = new mongoose.Schema({
  userId: Number,
  warnings: { type: Number, default: 0 },
  mutedUntil: { type: Date, default: null },
});
const User = mongoose.model("User", userSchema);

// URL Detection Function
function containsUrl(text) {
  const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?(?:t\.me|wa\.me|telegram\.me|telegram\.dog|[a-z0-9-]+(?:\.[a-z]{2,}){1,})(?:\/[^\s]*)?/gi;
  return urlRegex.test(text);
}

// Admin Check
async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ["administrator", "creator"].includes(member.status);
  } catch (error) {
    console.error("❌ Error checking admin status:", error);
    return false;
  }
}

// Auto-delete warning messages after 30 minutes
async function autoDeleteMessage(ctx, messageId) {
  setTimeout(async () => {
    try {
      await ctx.deleteMessage(messageId);
    } catch (error) {
      console.error("❌ Failed to delete message:", error);
    }
  }, 30 * 60 * 1000); // 30 minutes
}

// Main message handler
bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name;

  if (ctx.message.text && containsUrl(ctx.message.text)) {
    if (await isAdmin(ctx, userId)) {
      console.log(`✅ ${userName} (admin) sent a URL - Allowed.`);
      return;
    }

    try {
      let user = await User.findOne({ userId });
      if (!user) user = new User({ userId });

      user.warnings += 1;

      if (user.warnings < 3) {
        await ctx.deleteMessage();
        const warningMsg = await ctx.reply(
          `⚠️ ${userName}, sending links is not allowed! Warning ${user.warnings}/3. After 3 warnings, you will be removed from the group.`
        );
        autoDeleteMessage(ctx, warningMsg.message_id);
      } else {
        await ctx.deleteMessage();

        await ctx.kickChatMember(userId); // Remove the user from group

        const kickMsg = await ctx.reply(`🚫 ${userName} has been removed from the group for repeatedly sending links.`);
        autoDeleteMessage(ctx, kickMsg.message_id);

        user.warnings = 0; // Reset after kick
      }

      await user.save();
    } catch (error) {
      console.error("❌ Database or Kick Error:", error);
    }
  }
});

// Launch the bot
bot.launch();
console.log("🚀 Bot is running...");

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
