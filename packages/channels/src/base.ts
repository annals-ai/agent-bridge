export interface IncomingMessage {
  channelId: string;
  userId: string;
  text: string;
  platform: string;
}

export interface ChannelConfig {
  token: string;
  [key: string]: unknown;
}

export abstract class ChannelAdapter {
  abstract readonly type: string;
  abstract readonly displayName: string;
  abstract start(config: ChannelConfig): Promise<void>;
  abstract stop(): Promise<void>;
  abstract sendMessage(channelId: string, text: string): Promise<void>;
  abstract onMessage(cb: (msg: IncomingMessage) => void): void;
}
