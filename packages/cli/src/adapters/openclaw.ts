import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { AgentAdapter, type AdapterConfig, type SessionHandle } from './base.js';
import { log } from '../utils/logger.js';

/**
 * OpenClaw Gateway Protocol v3 types (local to adapter)
 */
interface ConnectRequest {
  type: 'req';
  id: string;
  method: 'connect';
  params: {
    minProtocol: number;
    maxProtocol: number;
    client: {
      id: string;
      displayName: string;
      version: string;
      platform: string;
      mode: string;
    };
    role: string;
    scopes: string[];
    caps: string[];
    commands: string[];
    permissions: Record<string, unknown>;
    auth: { token: string };
  };
}

interface AgentRequest {
  type: 'req';
  id: string;
  method: 'agent';
  params: {
    message: string;
    sessionKey: string;
    idempotencyKey: string;
  };
}

interface OpenClawMessage {
  type: 'res' | 'event' | 'error';
  id?: string;
  ok?: boolean;
  event?: string;
  payload?: {
    type?: string;
    status?: string;
    response?: string;
    stream?: string;
    data?: { text?: string; phase?: string };
  };
  error?: { code: string; message: string };
  message?: string;
}

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789';

class OpenClawSession implements SessionHandle {
  private chunkCallbacks: ((delta: string) => void)[] = [];
  private doneCallbacks: (() => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private fullText = '';
  private ws: WebSocket | null = null;
  private isConnected = false;
  private gatewayUrl: string;
  private gatewayToken: string;
  private sessionKey: string;

  constructor(
    sessionId: string,
    private config: AdapterConfig
  ) {
    this.gatewayUrl = config.gatewayUrl || DEFAULT_GATEWAY_URL;
    this.gatewayToken = config.gatewayToken || '';
    this.sessionKey = `bridge:${sessionId}`;
  }

  send(message: string): void {
    // If we already have a connected WS, reuse it to send
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
      this.sendAgentRequest(message);
      return;
    }

    // Otherwise establish new connection
    this.fullText = '';
    this.connectAndSend(message);
  }

  onChunk(cb: (delta: string) => void): void {
    this.chunkCallbacks.push(cb);
  }

  onDone(cb: () => void): void {
    this.doneCallbacks.push(cb);
  }

  onError(cb: (error: Error) => void): void {
    this.errorCallbacks.push(cb);
  }

  kill(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private connectAndSend(message: string): void {
    try {
      this.ws = new WebSocket(this.gatewayUrl);
    } catch (err) {
      this.emitError(new Error(`Failed to connect to OpenClaw: ${err}`));
      return;
    }

    this.ws.on('open', () => {
      log.debug(`OpenClaw WS connected to ${this.gatewayUrl}`);
      const connectMsg: ConnectRequest = {
        type: 'req',
        id: randomUUID(),
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            displayName: 'Agent Bridge CLI',
            version: '0.1.0',
            platform: 'node',
            mode: 'backend',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          auth: { token: this.gatewayToken },
        },
      };
      this.ws!.send(JSON.stringify(connectMsg));
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString(), message);
    });

    this.ws.on('error', (err) => {
      this.emitError(new Error(`OpenClaw WebSocket error: ${err.message}`));
    });

    this.ws.on('close', () => {
      this.isConnected = false;
    });
  }

  private handleMessage(raw: string, pendingMessage?: string): void {
    let msg: OpenClawMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Ignore non-agent events (e.g. connect.challenge)
    if (msg.type === 'event' && msg.event !== 'agent') {
      return;
    }

    // Handle connect response (hello-ok)
    if (msg.type === 'res' && !this.isConnected) {
      if (msg.ok && msg.payload?.type === 'hello-ok') {
        this.isConnected = true;
        log.debug('OpenClaw handshake complete');
        if (pendingMessage) {
          this.sendAgentRequest(pendingMessage);
        }
      } else {
        this.emitError(
          new Error(`OpenClaw auth failed: ${msg.error?.message || 'unknown'}`)
        );
        this.ws?.close();
      }
      return;
    }

    // Handle agent streaming events
    if (msg.type === 'event' && msg.event === 'agent' && msg.payload) {
      const { stream, data } = msg.payload;

      // assistant stream: cumulative text
      if (stream === 'assistant' && data?.text) {
        const prevLen = this.fullText.length;
        this.fullText = data.text;
        if (this.fullText.length > prevLen) {
          const delta = this.fullText.slice(prevLen);
          for (const cb of this.chunkCallbacks) cb(delta);
        }
      }

      // lifecycle end: done
      if (stream === 'lifecycle' && data?.phase === 'end') {
        for (const cb of this.doneCallbacks) cb();
      }
      return;
    }

    // Handle agent response (accepted / error)
    if (msg.type === 'res' && this.isConnected) {
      if (msg.ok && msg.payload) {
        if (msg.payload.status === 'accepted') {
          return; // wait for streaming events
        }
        // Non-streaming direct response
        if (msg.payload.response) {
          for (const cb of this.chunkCallbacks) cb(msg.payload.response);
        }
        for (const cb of this.doneCallbacks) cb();
      } else {
        this.emitError(
          new Error(`OpenClaw error: ${msg.error?.message || 'unknown'}`)
        );
      }
      return;
    }

    // Handle error messages
    if (msg.type === 'error') {
      this.emitError(new Error(`OpenClaw error: ${msg.message || 'unknown'}`));
    }
  }

  private sendAgentRequest(message: string): void {
    const req: AgentRequest = {
      type: 'req',
      id: randomUUID(),
      method: 'agent',
      params: {
        message,
        sessionKey: this.sessionKey,
        idempotencyKey: `idem-${Date.now()}-${randomUUID().slice(0, 8)}`,
      },
    };
    this.ws!.send(JSON.stringify(req));
  }

  private emitError(err: Error): void {
    if (this.errorCallbacks.length > 0) {
      for (const cb of this.errorCallbacks) cb(err);
    } else {
      log.error(err.message);
    }
  }
}

export class OpenClawAdapter extends AgentAdapter {
  readonly type = 'openclaw';
  readonly displayName = 'OpenClaw Gateway';

  private sessions = new Map<string, OpenClawSession>();
  private config: AdapterConfig;

  constructor(config: AdapterConfig = {}) {
    super();
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    const url = this.config.gatewayUrl || DEFAULT_GATEWAY_URL;
    return new Promise((resolve) => {
      let ws: WebSocket;
      const timer = setTimeout(() => {
        ws?.close();
        resolve(false);
      }, 5000);

      try {
        ws = new WebSocket(url);
      } catch {
        clearTimeout(timer);
        resolve(false);
        return;
      }

      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  createSession(id: string, config: AdapterConfig): SessionHandle {
    const merged = { ...this.config, ...config };
    const session = new OpenClawSession(id, merged);
    this.sessions.set(id, session);
    return session;
  }

  destroySession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
    }
  }
}
