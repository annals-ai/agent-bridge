import { AgentAdapter, type AdapterConfig, type SessionHandle } from './base.js';
import { spawnAgent } from '../utils/process.js';
import { log } from '../utils/logger.js';
import { createInterface } from 'node:readline';
import { which } from '../utils/which.js';

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

interface ClaudeStreamEvent {
  type: string;
  content_block?: { type: string; text?: string };
  delta?: { type: string; text?: string };
  result?: { type: string };
  subtype?: string;
  message?: { content?: { type: string; text?: string }[] };
}

class ClaudeSession implements SessionHandle {
  private chunkCallbacks: ((delta: string) => void)[] = [];
  private doneCallbacks: (() => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private process: ReturnType<typeof spawnAgent> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private config: AdapterConfig;

  constructor(
    private sessionId: string,
    config: AdapterConfig
  ) {
    this.config = config;
  }

  send(message: string, _attachments?: { name: string; url: string; type: string }[]): void {
    // Note: Claude Code CLI does not support file attachments via stdin.
    // Attachments are silently ignored for now.
    this.resetIdleTimer();

    // Spawn a new claude process for each message
    const args = ['--output-format', 'stream-json', '--input-format', 'stream-json'];
    if (this.config.project) {
      args.push('--project', this.config.project);
    }

    try {
      this.process = spawnAgent('claude', args);
    } catch (err) {
      this.emitError(new Error(`Failed to spawn claude: ${err}`));
      return;
    }

    const rl = createInterface({ input: this.process.stdout });

    rl.on('line', (line) => {
      this.resetIdleTimer();
      if (!line.trim()) return;

      try {
        const event = JSON.parse(line) as ClaudeStreamEvent;
        this.handleEvent(event);
      } catch {
        log.debug(`Claude non-JSON line: ${line}`);
      }
    });

    this.process.stderr.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) log.debug(`Claude stderr: ${text}`);
    });

    this.process.child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        this.emitError(new Error(`Claude process exited with code ${code}`));
      }
    });

    // Send the message via stdin as NDJSON
    const input = JSON.stringify({ type: 'user', content: message }) + '\n';
    this.process.stdin.write(input);
    this.process.stdin.end();
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
    this.clearIdleTimer();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private handleEvent(event: ClaudeStreamEvent): void {
    // Handle assistant text deltas
    if (event.type === 'assistant' && event.subtype === 'text_delta' && event.delta?.text) {
      for (const cb of this.chunkCallbacks) cb(event.delta.text);
      return;
    }

    // Handle content block deltas (alternative format)
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta?.text) {
      for (const cb of this.chunkCallbacks) cb(event.delta.text);
      return;
    }

    // Handle message result / completion
    if (event.type === 'result' || (event.type === 'assistant' && event.subtype === 'end')) {
      for (const cb of this.doneCallbacks) cb();
      return;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      log.warn(`Claude session ${this.sessionId} idle timeout, killing process`);
      this.kill();
    }, IDLE_TIMEOUT);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private emitError(err: Error): void {
    if (this.errorCallbacks.length > 0) {
      for (const cb of this.errorCallbacks) cb(err);
    } else {
      log.error(err.message);
    }
  }
}

export class ClaudeAdapter extends AgentAdapter {
  readonly type = 'claude';
  readonly displayName = 'Claude Code';

  private sessions = new Map<string, ClaudeSession>();
  private config: AdapterConfig;

  constructor(config: AdapterConfig = {}) {
    super();
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    return !!(await which('claude'));
  }

  createSession(id: string, config: AdapterConfig): SessionHandle {
    const merged = { ...this.config, ...config };
    const session = new ClaudeSession(id, merged);
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
