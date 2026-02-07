/**
 * Bridge Worker — Cloudflare Worker entry point.
 *
 * Routes:
 *   GET  /ws                    → WebSocket upgrade (agent-bridge CLI connections)
 *   GET  /health                → Health check
 *   GET  /api/agents/:id/status → Check if agent is online
 *   POST /api/relay             → Relay message to agent, return SSE stream
 */

import type { RelayRequest } from '@skills-hot/bridge-protocol';
import { handleWebSocket, type Env } from './ws-handler.js';
import * as registry from './registry.js';
import { handleRelayRequest, agentConnections } from './relay.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for API endpoints
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // WebSocket upgrade
    if (path === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return jsonResponse(426, { error: 'Expected WebSocket upgrade' });
      }
      return handleWebSocket(env);
    }

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return jsonResponse(200, {
        status: 'ok',
        connected_agents: agentConnections.size,
      });
    }

    // All other API routes require platform auth
    if (!authenticatePlatform(request, env)) {
      return jsonResponse(401, { error: 'auth_failed', message: 'Invalid or missing X-Platform-Secret' });
    }

    // Agent status
    const statusMatch = path.match(/^\/api\/agents\/([^/]+)\/status$/);
    if (statusMatch && request.method === 'GET') {
      const agentId = statusMatch[1];
      const reg = await registry.get(env.BRIDGE_KV, agentId);
      if (!reg) {
        return jsonResponse(200, { online: false });
      }
      return jsonResponse(200, {
        online: true,
        agent_type: reg.agent_type,
        capabilities: reg.capabilities,
        connected_at: reg.connected_at,
        last_heartbeat: reg.last_heartbeat,
        active_sessions: reg.active_sessions,
      });
    }

    // Relay message to agent
    if (path === '/api/relay' && request.method === 'POST') {
      let body: RelayRequest;
      try {
        body = await request.json() as RelayRequest;
      } catch {
        return jsonResponse(400, { error: 'invalid_message', message: 'Invalid JSON body' });
      }

      if (!body.agent_id || !body.session_id || !body.request_id || !body.content) {
        return jsonResponse(400, {
          error: 'invalid_message',
          message: 'Missing required fields: agent_id, session_id, request_id, content',
        });
      }

      // Check agent is connected in this worker instance
      if (!agentConnections.has(body.agent_id)) {
        // Check KV to see if agent is online on another instance
        const reg = await registry.get(env.BRIDGE_KV, body.agent_id);
        if (reg) {
          return jsonResponse(502, {
            error: 'agent_busy',
            message: 'Agent is connected to a different worker instance',
          });
        }
        return jsonResponse(404, {
          error: 'agent_offline',
          message: 'Agent is not connected',
        });
      }

      const stream = handleRelayRequest(
        body.agent_id,
        body.session_id,
        body.request_id,
        body.content,
        body.attachments ?? [],
      );

      if (!stream) {
        return jsonResponse(502, {
          error: 'agent_offline',
          message: 'Failed to send message to agent',
        });
      }

      // Return SSE stream — pipe string chunks to encoded bytes
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(encoder.encode(value));
            }
          } catch {
            // Stream error
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          ...corsHeaders(),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    return jsonResponse(404, { error: 'not_found', message: 'Route not found' });
  },
} satisfies ExportedHandler<Env>;

// ============================================================
// Helpers
// ============================================================

function authenticatePlatform(request: Request, env: Env): boolean {
  const secret = request.headers.get('X-Platform-Secret');
  return !!secret && secret === env.PLATFORM_SECRET;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Platform-Secret',
  };
}
