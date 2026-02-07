import type { App } from "@slack/bolt";
import { ChannelAdapter, type ChannelConfig, type IncomingMessage } from "./base.js";

export interface SlackChannelConfig extends ChannelConfig {
  signingSecret: string;
  appToken: string;
}

export class SlackChannel extends ChannelAdapter {
  readonly type = "slack";
  readonly displayName = "Slack";

  private app: App | null = null;
  private messageCallback: ((msg: IncomingMessage) => void) | null = null;

  async start(config: ChannelConfig): Promise<void> {
    const slackConfig = config as SlackChannelConfig;
    // TODO: Phase 5 implementation
    // const { App } = await import("@slack/bolt");
    // this.app = new App({
    //   token: slackConfig.token,
    //   signingSecret: slackConfig.signingSecret,
    //   appToken: slackConfig.appToken,
    //   socketMode: true,
    // });
    // this.app.message(async ({ message }) => {
    //   if (message.subtype) return;
    //   this.messageCallback?.({
    //     channelId: message.channel,
    //     userId: message.user ?? "unknown",
    //     text: (message as any).text ?? "",
    //     platform: this.type,
    //   });
    // });
    // await this.app.start();
    throw new Error("SlackChannel not yet implemented");
  }

  async stop(): Promise<void> {
    // TODO: await this.app?.stop();
    this.app = null;
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    // TODO: await this.app?.client.chat.postMessage({ channel: channelId, text });
    throw new Error("SlackChannel.sendMessage not yet implemented");
  }

  onMessage(cb: (msg: IncomingMessage) => void): void {
    this.messageCallback = cb;
  }
}
