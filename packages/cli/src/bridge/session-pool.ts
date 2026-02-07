import type { SessionHandle } from '../adapters/base.js';
import { log } from '../utils/logger.js';

interface PoolEntry {
  sessionId: string;
  handle: SessionHandle;
  createdAt: number;
  lastActiveAt: number;
}

export class SessionPool {
  private sessions = new Map<string, PoolEntry>();

  get(sessionId: string): SessionHandle | undefined {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastActiveAt = Date.now();
    }
    return entry?.handle;
  }

  set(sessionId: string, handle: SessionHandle): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      handle,
      createdAt: now,
      lastActiveAt: now,
    });
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }

  clear(): void {
    for (const [id, entry] of this.sessions) {
      log.debug(`Cleaning up session ${id}`);
      entry.handle.kill();
    }
    this.sessions.clear();
  }

  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }
}
