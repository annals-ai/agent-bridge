/**
 * WebSocket connection handler for agent-bridge.
 *
 * Manages the lifecycle of WebSocket connections from bridge CLI instances:
 * authenticate → register → relay messages → heartbeat → disconnect.
 */

import type {
  Register,
  Registered,
  BridgeToWorkerMessage,
} from '@skills-hot/bridge-protocol';
import { agentConnections, handleAgentMessage } from './relay.js';
import * as registry from './registry.js';
import type { AgentRegistration } from './registry.js';

export interface Env {
  BRIDGE_KV: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  PLATFORM_SECRET: string;
}

/**
 * Handle a WebSocket upgrade request.
 * Returns a Response with status 101 (switching protocols).
 */
export function handleWebSocket(env: Env): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];

  server.accept();

  let authenticated = false;
  let agentId = '';

  server.addEventListener('message', async (event) => {
    let msg: BridgeToWorkerMessage;
    try {
      const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      msg = JSON.parse(data) as BridgeToWorkerMessage;
    } catch {
      server.send(JSON.stringify({ type: 'registered', status: 'error', error: 'Invalid JSON' } satisfies Registered));
      server.close(1008, 'Invalid JSON');
      return;
    }

    // First message must be Register
    if (!authenticated) {
      if (msg.type !== 'register') {
        server.send(JSON.stringify({ type: 'registered', status: 'error', error: 'First message must be register' } satisfies Registered));
        server.close(1008, 'Expected register');
        return;
      }

      const registerMsg = msg as Register;
      const valid = await validateToken(registerMsg.token, registerMsg.agent_id, env);

      if (!valid) {
        server.send(JSON.stringify({ type: 'registered', status: 'error', error: 'Authentication failed' } satisfies Registered));
        server.close(1008, 'Auth failed');
        return;
      }

      // Successful registration
      authenticated = true;
      agentId = registerMsg.agent_id;

      // Close existing connection for same agent if any
      const existing = agentConnections.get(agentId);
      if (existing) {
        try {
          existing.close(1000, 'Replaced by new connection');
        } catch {
          // ignore
        }
      }

      agentConnections.set(agentId, server);

      const now = new Date().toISOString();
      const registration: AgentRegistration = {
        agent_id: agentId,
        agent_type: registerMsg.agent_type,
        capabilities: registerMsg.capabilities,
        connected_at: now,
        last_heartbeat: now,
        active_sessions: 0,
      };
      await registry.set(env.BRIDGE_KV, agentId, registration);

      server.send(JSON.stringify({ type: 'registered', status: 'ok' } satisfies Registered));
      return;
    }

    // Authenticated messages
    switch (msg.type) {
      case 'heartbeat': {
        if (!agentId) break;
        const existing = await registry.get(env.BRIDGE_KV, agentId);
        if (existing) {
          existing.last_heartbeat = new Date().toISOString();
          existing.active_sessions = msg.active_sessions;
          await registry.set(env.BRIDGE_KV, agentId, existing);
        }
        break;
      }

      case 'chunk':
      case 'done':
      case 'error': {
        handleAgentMessage(msg);
        break;
      }

      default:
        // Unknown message type, ignore
        break;
    }
  });

  server.addEventListener('close', async () => {
    if (agentId !== '') {
      agentConnections.delete(agentId);
      await registry.remove(env.BRIDGE_KV, agentId);
    }
  });

  server.addEventListener('error', async () => {
    if (agentId !== '') {
      agentConnections.delete(agentId);
      await registry.remove(env.BRIDGE_KV, agentId);
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}

/**
 * Validate a CLI token by checking against Supabase.
 *
 * The token can be either:
 * 1. A Supabase JWT - verified via /auth/v1/user
 * 2. A CLI token stored in the agents table
 */
async function validateToken(token: string, agentId: string, env: Env): Promise<boolean> {
  try {
    // Try JWT verification first
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': env.SUPABASE_SERVICE_KEY,
      },
    });

    if (userRes.ok) {
      // JWT is valid - verify the user owns this agent
      const user = await userRes.json() as { id: string };
      const agentRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/agents?id=eq.${agentId}&owner_id=eq.${user.id}&select=id`,
        {
          headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (agentRes.ok) {
        const agents = await agentRes.json() as { id: string }[];
        return agents.length > 0;
      }
      return false;
    }

    // Fall back to CLI token lookup: check if any agent with this ID has this token
    const tokenRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/agents?id=eq.${agentId}&bridge_token=eq.${token}&select=id`,
      {
        headers: {
          'apikey': env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );

    if (tokenRes.ok) {
      const agents = await tokenRes.json() as { id: string }[];
      return agents.length > 0;
    }

    return false;
  } catch {
    return false;
  }
}
