import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as registry from '../../packages/worker/src/registry.js';

// Mock KVNamespace
function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

describe('registry', () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it('should set and get agent registration', async () => {
    const reg: registry.AgentRegistration = {
      agent_id: 'agent-1',
      agent_type: 'claude',
      capabilities: ['streaming'],
      connected_at: '2026-01-01T00:00:00Z',
      last_heartbeat: '2026-01-01T00:00:00Z',
      active_sessions: 0,
    };

    await registry.set(kv, 'agent-1', reg);
    const result = await registry.get(kv, 'agent-1');

    expect(result).toEqual(reg);
    expect(kv.put).toHaveBeenCalledWith(
      'agent:agent-1',
      JSON.stringify(reg),
      { expirationTtl: 300 },
    );
  });

  it('should return null for non-existent agent', async () => {
    const result = await registry.get(kv, 'non-existent');
    expect(result).toBeNull();
  });

  it('should remove agent from registry', async () => {
    const reg: registry.AgentRegistration = {
      agent_id: 'agent-1',
      agent_type: 'openclaw',
      capabilities: [],
      connected_at: '2026-01-01T00:00:00Z',
      last_heartbeat: '2026-01-01T00:00:00Z',
      active_sessions: 0,
    };

    await registry.set(kv, 'agent-1', reg);
    await registry.remove(kv, 'agent-1');

    expect(kv.delete).toHaveBeenCalledWith('agent:agent-1');
  });
});

describe('relay', () => {
  it('should import relay module without errors', async () => {
    const relay = await import('../../packages/worker/src/relay.js');
    expect(relay.agentConnections).toBeInstanceOf(Map);
    expect(typeof relay.sendToAgent).toBe('function');
    expect(typeof relay.handleAgentMessage).toBe('function');
    expect(typeof relay.handleRelayRequest).toBe('function');
  });

  it('should return null when sending to non-existent agent', async () => {
    const relay = await import('../../packages/worker/src/relay.js');
    const result = relay.handleRelayRequest(
      'non-existent-agent',
      'session-1',
      'req-1',
      'Hello',
      [],
    );
    expect(result).toBeNull();
  });

  it('should return false when sending to disconnected agent', async () => {
    const relay = await import('../../packages/worker/src/relay.js');
    const sent = relay.sendToAgent('non-existent', {
      type: 'message',
      session_id: 'session-1',
      request_id: 'req-1',
      content: 'Hello',
      attachments: [],
    });
    expect(sent).toBe(false);
  });
});
