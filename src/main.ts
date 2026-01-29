import { Bot, Context, Keyboard, MemorySessionStorage, session, SessionFlavor } from "grammy";
import type { ChatMember } from "grammy/types";
import { Menu } from "@grammyjs/menu";
import { chatMembers, ChatMembersFlavor } from "@grammyjs/chat-members";

type SessionData = {
  visits: number;
};

type BotContext = Context & SessionFlavor<SessionData> & ChatMembersFlavor;

const token = process.env.BOT_TOKEN ?? "";
if (!token) {
  throw new Error("Missing BOT_TOKEN. Set it in your environment before starting the bot.");
}

const bot = new Bot<BotContext>(token);

// Simple in-memory session to demonstrate plugin wiring.
bot.use(
  session({
    initial: (): SessionData => ({ visits: 0 }),
  }),
);

// Store chat members in memory.
const chatMemberAdapter = new MemorySessionStorage<ChatMember>();
bot.use(chatMembers(chatMemberAdapter));

const mainMenu = new Menu<BotContext>("main")
  .text((ctx) => `Visits: ${ctx.session.visits}`, async (ctx) => {
    ctx.session.visits += 1;
    await ctx.menu.update();
  })
  .row()
  .text("Ping", async (ctx) => {
    await ctx.reply("Pong!");
  });

bot.use(mainMenu);

bot.command("start", async (ctx) => {
  ctx.session.visits += 1;
  await ctx.reply("Seiri Bot is running. Use the menu below.", {
    reply_markup: mainMenu,
  });
});

bot.command("keyboard", async (ctx) => {
  const kb = new Keyboard()
    .text("Ping")
    .row()
    .text("Menu")
    .resized();

  await ctx.reply("Reply keyboard enabled.", { reply_markup: kb });
});

bot.hears("Ping", (ctx) => ctx.reply("Pong!"));
bot.hears("Menu", (ctx) => ctx.reply("Menu:", { reply_markup: mainMenu }));

bot.catch((err) => {
  console.error("[bot] Unhandled error:", err.error);
});

bot.start({
  allowed_updates: ["message", "callback_query", "chat_member"],
});
