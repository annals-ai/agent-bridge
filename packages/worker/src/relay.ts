/**
 * Message relay logic.
 *
 * Routes user messages to connected agents via WebSocket and returns
 * a ReadableStream of SSE events with the agent's streamed response.
 */

import type {
  Message,
  Chunk,
  Done,
  BridgeError,
  BridgeToWorkerMessage,
  Attachment,
} from '@skills-hot/bridge-protocol';

/** Map of agent_id → WebSocket server instance */
export const agentConnections = new Map<string, WebSocket>();

interface PendingRelay {
  controller: ReadableStreamDefaultController;
  timer: ReturnType<typeof setTimeout>;
}

/** Map of request_id → pending relay stream controller */
const pendingRelays = new Map<string, PendingRelay>();

const RELAY_TIMEOUT_MS = 120_000;

/**
 * Send a JSON message to a connected agent.
 */
export function sendToAgent(agentId: string, message: Message): boolean {
  const ws = agentConnections.get(agentId);
  if (!ws) return false;

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch {
    agentConnections.delete(agentId);
    return false;
  }
}

/**
 * Handle an incoming message from an agent (Chunk / Done / Error).
 * Routes the message to the corresponding pending relay stream.
 */
export function handleAgentMessage(msg: BridgeToWorkerMessage): void {
  if (msg.type !== 'chunk' && msg.type !== 'done' && msg.type !== 'error') {
    return;
  }

  const pending = pendingRelays.get(msg.request_id);
  if (!pending) return;

  const { controller, timer } = pending;

  try {
    if (msg.type === 'chunk') {
      const event = JSON.stringify({ type: 'chunk', delta: (msg as Chunk).delta });
      controller.enqueue(`data: ${event}\n\n`);
    } else if (msg.type === 'done') {
      const event = JSON.stringify({ type: 'done' });
      controller.enqueue(`data: ${event}\n\n`);
      clearTimeout(timer);
      pendingRelays.delete(msg.request_id);
      controller.close();
    } else if (msg.type === 'error') {
      const err = msg as BridgeError;
      const event = JSON.stringify({ type: 'error', code: err.code, message: err.message });
      controller.enqueue(`data: ${event}\n\n`);
      clearTimeout(timer);
      pendingRelays.delete(msg.request_id);
      controller.close();
    }
  } catch {
    // Controller may have been closed already
    clearTimeout(timer);
    pendingRelays.delete(msg.request_id);
  }
}

/**
 * Handle a relay request: forward user message to agent, return SSE stream.
 */
export function handleRelayRequest(
  agentId: string,
  sessionId: string,
  requestId: string,
  content: string,
  attachments: Attachment[],
): ReadableStream<string> | null {
  const message: Message = {
    type: 'message',
    session_id: sessionId,
    request_id: requestId,
    content,
    attachments,
  };

  const sent = sendToAgent(agentId, message);
  if (!sent) return null;

  const stream = new ReadableStream<string>({
    start(controller) {
      const timer = setTimeout(() => {
        try {
          const event = JSON.stringify({
            type: 'error',
            code: 'timeout',
            message: 'Agent did not respond within 120 seconds',
          });
          controller.enqueue(`data: ${event}\n\n`);
          controller.close();
        } catch {
          // already closed
        }
        pendingRelays.delete(requestId);
      }, RELAY_TIMEOUT_MS);

      pendingRelays.set(requestId, { controller, timer });
    },
    cancel() {
      const pending = pendingRelays.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRelays.delete(requestId);
      }
      // Optionally send cancel to agent
      const ws = agentConnections.get(agentId);
      if (ws) {
        try {
          ws.send(JSON.stringify({
            type: 'cancel',
            session_id: sessionId,
            request_id: requestId,
          }));
        } catch {
          // ignore
        }
      }
    },
  });

  return stream;
}
