import type { BridgeErrorCode } from './errors.js';

// ============================================================
// Bridge → Platform (sent by agent-bridge CLI to Bridge Worker)
// ============================================================

/** Sent immediately after WebSocket connection to authenticate */
export interface Register {
  type: 'register';
  agent_id: string;
  token: string;
  bridge_version: string;
  agent_type: 'openclaw' | 'claude' | 'codex' | 'gemini' | string;
  capabilities: string[];
}

/** Incremental text chunk from agent */
export interface Chunk {
  type: 'chunk';
  session_id: string;
  request_id: string;
  delta: string;
}

/** Agent finished responding */
export interface Done {
  type: 'done';
  session_id: string;
  request_id: string;
}

/** Agent encountered an error */
export interface BridgeError {
  type: 'error';
  session_id: string;
  request_id: string;
  code: BridgeErrorCode | string;
  message: string;
}

/** Periodic heartbeat from bridge CLI */
export interface Heartbeat {
  type: 'heartbeat';
  active_sessions: number;
  uptime_ms: number;
}

/** All messages sent from Bridge CLI to Worker */
export type BridgeToWorkerMessage = Register | Chunk | Done | BridgeError | Heartbeat;

// ============================================================
// Platform → Bridge (sent by Bridge Worker to agent-bridge CLI)
// ============================================================

/** Registration acknowledgment */
export interface Registered {
  type: 'registered';
  status: 'ok' | 'error';
  error?: string;
}

/** User message forwarded to agent */
export interface Message {
  type: 'message';
  session_id: string;
  request_id: string;
  content: string;
  attachments: Attachment[];
}

/** Cancel an in-progress request */
export interface Cancel {
  type: 'cancel';
  session_id: string;
  request_id: string;
}

/** All messages sent from Worker to Bridge CLI */
export type WorkerToBridgeMessage = Registered | Message | Cancel;

// ============================================================
// Shared types
// ============================================================

export interface Attachment {
  name: string;
  url: string;
  type: string;
}

/** Any Bridge Protocol message */
export type BridgeMessage = BridgeToWorkerMessage | WorkerToBridgeMessage;

// ============================================================
// Relay API types (Platform ↔ Bridge Worker HTTP)
// ============================================================

/** POST /api/relay request body */
export interface RelayRequest {
  agent_id: string;
  session_id: string;
  request_id: string;
  content: string;
  attachments?: Attachment[];
}

/** SSE event from relay endpoint */
export interface RelayChunkEvent {
  type: 'chunk';
  delta: string;
}

export interface RelayDoneEvent {
  type: 'done';
}

export interface RelayErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type RelayEvent = RelayChunkEvent | RelayDoneEvent | RelayErrorEvent;
