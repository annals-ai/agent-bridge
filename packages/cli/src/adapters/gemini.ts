import { AgentAdapter, type AdapterConfig, type SessionHandle } from './base.js';

// TODO: Implement Gemini CLI adapter
export class GeminiAdapter extends AgentAdapter {
  readonly type = 'gemini';
  readonly displayName = 'Gemini CLI';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  createSession(_id: string, _config: AdapterConfig): SessionHandle {
    throw new Error('Gemini adapter not yet implemented');
  }

  destroySession(_id: string): void {
    // no-op
  }
}
