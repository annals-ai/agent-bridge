import type { Bot, Context } from "grammy";
import { ChannelAdapter, type ChannelConfig, type IncomingMessage } from "./base.js";

export class TelegramChannel extends ChannelAdapter {
  readonly type = "telegram";
  readonly displayName = "Telegram";

  private bot: Bot<Context> | null = null;
  private messageCallback: ((msg: IncomingMessage) => void) | null = null;

  async start(config: ChannelConfig): Promise<void> {
    // TODO: Phase 5 implementation
    // const { Bot } = await import("grammy");
    // this.bot = new Bot(config.token);
    // this.bot.on("message:text", (ctx) => {
    //   this.messageCallback?.({
    //     channelId: String(ctx.chat.id),
    //     userId: String(ctx.from.id),
    //     text: ctx.message.text,
    //     platform: this.type,
    //   });
    // });
    // await this.bot.start();
    throw new Error("TelegramChannel not yet implemented");
  }

  async stop(): Promise<void> {
    // TODO: this.bot?.stop();
    this.bot = null;
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    // TODO: this.bot?.api.sendMessage(Number(channelId), text);
    throw new Error("TelegramChannel.sendMessage not yet implemented");
  }

  onMessage(cb: (msg: IncomingMessage) => void): void {
    this.messageCallback = cb;
  }
}
