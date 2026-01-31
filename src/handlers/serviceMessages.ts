import type { Bot } from "grammy";
import type { Message } from "grammy/types";
import type { MyContext } from "../types";
import type { ConfigStorage } from "../config/store";
import { getGroupConfig } from "../config/store";

const SERVICE_CHAT_TYPES = new Set(["group", "supergroup"]);

export function registerServiceMessageHandler(
  bot: Bot<MyContext>,
  configStorage: ConfigStorage
): void {
  bot.on("message", async (ctx, next) => {
    if (!ctx.chat || !SERVICE_CHAT_TYPES.has(ctx.chat.type)) {
      return next();
    }

    const message = ctx.message;
    if (!message || !isServiceMessage(message)) {
      return next();
    }

    const config = await getGroupConfig(configStorage, ctx.chat.id);
    if (!config.deleteServiceMessages) {
      return next();
    }

    try {
      await ctx.api.deleteMessage(ctx.chat.id, message.message_id);
    } catch (error) {
      console.error("Failed to delete service message", error);
    }

    return next();
  });
}

function isServiceMessage(message: Message): boolean {
  return Boolean(
    message.new_chat_members ||
      message.left_chat_member ||
      message.new_chat_title ||
      message.new_chat_photo ||
      message.delete_chat_photo ||
      message.group_chat_created ||
      message.supergroup_chat_created ||
      message.channel_chat_created ||
      message.message_auto_delete_timer_changed ||
      message.pinned_message
  );
}
