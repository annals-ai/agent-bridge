import type { Client, GatewayIntentBits } from "discord.js";
import { ChannelAdapter, type ChannelConfig, type IncomingMessage } from "./base.js";

export class DiscordChannel extends ChannelAdapter {
  readonly type = "discord";
  readonly displayName = "Discord";

  private client: Client | null = null;
  private messageCallback: ((msg: IncomingMessage) => void) | null = null;

  async start(config: ChannelConfig): Promise<void> {
    // TODO: Phase 5 implementation
    // const { Client, GatewayIntentBits } = await import("discord.js");
    // this.client = new Client({
    //   intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    // });
    // this.client.on("messageCreate", (message) => {
    //   if (message.author.bot) return;
    //   this.messageCallback?.({
    //     channelId: message.channelId,
    //     userId: message.author.id,
    //     text: message.content,
    //     platform: this.type,
    //   });
    // });
    // await this.client.login(config.token);
    throw new Error("DiscordChannel not yet implemented");
  }

  async stop(): Promise<void> {
    // TODO: this.client?.destroy();
    this.client = null;
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    // TODO: const channel = await this.client?.channels.fetch(channelId);
    // if (channel?.isTextBased()) await channel.send(text);
    throw new Error("DiscordChannel.sendMessage not yet implemented");
  }

  onMessage(cb: (msg: IncomingMessage) => void): void {
    this.messageCallback = cb;
  }
}
