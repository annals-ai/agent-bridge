import { AgentAdapter, type AdapterConfig, type SessionHandle } from './base.js';

// TODO: Implement Codex MCP adapter
export class CodexAdapter extends AgentAdapter {
  readonly type = 'codex';
  readonly displayName = 'Codex CLI';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  createSession(_id: string, _config: AdapterConfig): SessionHandle {
    throw new Error('Codex adapter not yet implemented');
  }

  destroySession(_id: string): void {
    // no-op
  }
}
