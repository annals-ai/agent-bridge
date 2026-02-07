import type { Command } from 'commander';
import { loadToken } from '../platform/auth.js';
import { loadConfig } from '../utils/config.js';
import { BridgeWSClient } from '../platform/ws-client.js';
import { BridgeManager } from '../bridge/manager.js';
import { OpenClawAdapter } from '../adapters/openclaw.js';
import { ClaudeAdapter } from '../adapters/claude.js';
import { CodexAdapter } from '../adapters/codex.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import type { AgentAdapter, AdapterConfig } from '../adapters/base.js';
import { log } from '../utils/logger.js';

const DEFAULT_BRIDGE_URL = 'wss://bridge.skills.hot/ws';

function createAdapter(type: string, config: AdapterConfig): AgentAdapter {
  switch (type) {
    case 'openclaw':
      return new OpenClawAdapter(config);
    case 'claude':
      return new ClaudeAdapter(config);
    case 'codex':
      return new CodexAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    default:
      throw new Error(`Unknown agent type: ${type}. Supported: openclaw, claude, codex, gemini`);
  }
}

export function registerConnectCommand(program: Command): void {
  program
    .command('connect <type>')
    .description('Connect a local agent to the Skills.Hot platform')
    .option('--agent-id <id>', 'Agent ID registered on Skills.Hot')
    .option('--project <path>', 'Project path (for claude adapter)')
    .option('--gateway-url <url>', 'OpenClaw gateway URL (for openclaw adapter)')
    .option('--gateway-token <token>', 'OpenClaw gateway token')
    .option('--bridge-url <url>', 'Bridge Worker WebSocket URL')
    .action(async (type: string, opts: {
      agentId?: string;
      project?: string;
      gatewayUrl?: string;
      gatewayToken?: string;
      bridgeUrl?: string;
    }) => {
      const config = loadConfig();
      const token = loadToken();

      if (!token) {
        log.error('Not authenticated. Run `agent-bridge login` first.');
        process.exit(1);
      }

      if (!opts.agentId) {
        log.error('--agent-id is required');
        process.exit(1);
      }

      const bridgeUrl = opts.bridgeUrl || config.bridgeUrl || DEFAULT_BRIDGE_URL;

      const adapterConfig: AdapterConfig = {
        project: opts.project,
        gatewayUrl: opts.gatewayUrl || config.gatewayUrl,
        gatewayToken: opts.gatewayToken,
      };

      // Create adapter
      const adapter = createAdapter(type, adapterConfig);

      // Check availability
      log.info(`Checking ${adapter.displayName} availability...`);
      const available = await adapter.isAvailable();
      if (!available) {
        log.error(`${adapter.displayName} is not available. Make sure it is installed and running.`);
        process.exit(1);
      }
      log.success(`${adapter.displayName} is available`);

      // Connect to bridge worker
      log.info(`Connecting to bridge worker at ${bridgeUrl}...`);
      const wsClient = new BridgeWSClient({
        url: bridgeUrl,
        token,
        agentId: opts.agentId,
        agentType: type,
      });

      try {
        await wsClient.connect();
      } catch (err) {
        log.error(`Failed to connect to bridge worker: ${err}`);
        process.exit(1);
      }
      log.success(`Registered as agent "${opts.agentId}" (${type})`);

      // Start manager
      const manager = new BridgeManager({
        wsClient,
        adapter,
        adapterConfig,
      });
      manager.start();

      log.banner(`Agent bridge is running. Press Ctrl+C to stop.`);

      // Graceful shutdown
      const shutdown = () => {
        log.info('Shutting down...');
        manager.stop();
        wsClient.close();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Reconnect handler
      wsClient.on('reconnect', () => {
        manager.start();
      });
    });
}
