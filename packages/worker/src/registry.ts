/**
 * KV-based agent registry for tracking online agents.
 */

export interface AgentRegistration {
  agent_id: string;
  agent_type: string;
  capabilities: string[];
  connected_at: string;
  last_heartbeat: string;
  active_sessions: number;
}

const KV_PREFIX = 'agent:';
/** TTL for KV entries - auto-expire if no heartbeat in 5 minutes */
const KV_TTL_SECONDS = 300;

export async function set(
  kv: KVNamespace,
  agentId: string,
  registration: AgentRegistration,
): Promise<void> {
  await kv.put(
    `${KV_PREFIX}${agentId}`,
    JSON.stringify(registration),
    { expirationTtl: KV_TTL_SECONDS },
  );
}

export async function get(
  kv: KVNamespace,
  agentId: string,
): Promise<AgentRegistration | null> {
  const raw = await kv.get(`${KV_PREFIX}${agentId}`);
  if (!raw) return null;
  return JSON.parse(raw) as AgentRegistration;
}

export async function remove(
  kv: KVNamespace,
  agentId: string,
): Promise<void> {
  await kv.delete(`${KV_PREFIX}${agentId}`);
}
