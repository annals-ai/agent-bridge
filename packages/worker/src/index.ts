/**
 * Bridge Worker — Cloudflare Worker entry point.
 *
 * Routes:
 *   GET  /ws?agent_id=<id>        → WebSocket upgrade → Durable Object
 *   GET  /health                   → Health check
 *   GET  /api/agents/:id/status    → Agent online status (via DO)
 *   POST /api/relay                → Relay message to agent (via DO)
 *
 * Architecture:
 *   Each agent gets a Durable Object (AgentSession) keyed by agent_id.
 *   The DO holds the WebSocket and handles relay in the same instance.
 */

export { AgentSession } from './agent-session.js';

interface Env {
  AGENT_SESSIONS: DurableObjectNamespace;
  BRIDGE_KV: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  PLATFORM_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Health check (no auth)
    if (path === '/health' && request.method === 'GET') {
      return jsonResponse(200, { status: 'ok' });
    }

    // WebSocket upgrade — route to Durable Object
    if (path === '/ws') {
      const agentId = url.searchParams.get('agent_id');
      if (!agentId) {
        return jsonResponse(400, { error: 'missing_agent_id', message: 'WebSocket URL must include ?agent_id=<uuid>' });
      }
      if (!isValidAgentId(agentId)) {
        return jsonResponse(400, { error: 'invalid_agent_id', message: 'agent_id must be a valid UUID' });
      }

      const id = env.AGENT_SESSIONS.idFromName(agentId);
      const stub = env.AGENT_SESSIONS.get(id);
      return stub.fetch(new Request(`${url.origin}/ws`, {
        headers: request.headers,
      }));
    }

    // All API routes require platform auth
    if (!authenticatePlatform(request, env)) {
      return jsonResponse(401, { error: 'auth_failed', message: 'Invalid or missing X-Platform-Secret' });
    }

    // Agent status — route to Durable Object
    const statusMatch = path.match(/^\/api\/agents\/([^/]+)\/status$/);
    if (statusMatch && request.method === 'GET') {
      const agentId = statusMatch[1];
      if (!isValidAgentId(agentId)) {
        return jsonResponse(400, { error: 'invalid_agent_id', message: 'agent_id must be a valid UUID' });
      }
      const id = env.AGENT_SESSIONS.idFromName(agentId);
      const stub = env.AGENT_SESSIONS.get(id);
      return stub.fetch(new Request(`${url.origin}/status`));
    }

    // Relay — route to Durable Object
    if (path === '/api/relay' && request.method === 'POST') {
      let body: { agent_id?: string };
      try {
        body = await request.clone().json() as typeof body;
      } catch {
        return jsonResponse(400, { error: 'invalid_message', message: 'Invalid JSON body' });
      }

      if (!body.agent_id) {
        return jsonResponse(400, { error: 'invalid_message', message: 'Missing agent_id' });
      }
      if (!isValidAgentId(body.agent_id)) {
        return jsonResponse(400, { error: 'invalid_agent_id', message: 'agent_id must be a valid UUID' });
      }

      const id = env.AGENT_SESSIONS.idFromName(body.agent_id);
      const stub = env.AGENT_SESSIONS.get(id);
      return stub.fetch(new Request(`${url.origin}/relay`, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      }));
    }

    return jsonResponse(404, { error: 'not_found', message: 'Route not found' });
  },
} satisfies ExportedHandler<Env>;

function authenticatePlatform(request: Request, env: Env): boolean {
  const secret = request.headers.get('X-Platform-Secret');
  if (!secret || !env.PLATFORM_SECRET || secret.length === 0 || env.PLATFORM_SECRET.length === 0) {
    return false;
  }
  return secret === env.PLATFORM_SECRET;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidAgentId(id: string): boolean {
  return UUID_RE.test(id);
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Platform-Secret',
  };
}
