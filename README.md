# Agent Bridge

Unified agent connector -- connect any AI agent to the [skills.hot](https://skills.hot) platform.

```
                                   Bridge Protocol v1 (WebSocket)

  +------------------+       +-----+       +---------------------+       +----------+
  |  OpenClaw Agent  | ----> |     |       |                     |       |          |
  |  Claude Code     | ----> | CLI | ----> | bridge.skills.hot   | ----> | Platform |
  |  Codex (planned) | ----> |     |       | (Cloudflare Worker) |       |          |
  |  Gemini (planned)| ----> |     |       |                     |       |          |
  +------------------+       +-----+       +---------------------+       +----------+
                                                    |
                                           Relay API (SSE)
                                                    |
                                           +--------+--------+
                                           |  IM Channels    |
                                           |  (coming soon)  |
                                           |  Telegram       |
                                           |  Discord        |
                                           |  Slack          |
                                           +-----------------+
```

The bridge CLI runs on your machine alongside your AI agent. It connects to the Bridge Worker via WebSocket, receives user messages from the platform, forwards them to your local agent, and streams back responses in real time.

## Quick Start

```bash
# Install
npm install -g @skills-hot/agent-bridge

# Authenticate
agent-bridge login

# Connect your agent
agent-bridge connect openclaw --agent-id my-agent-id
agent-bridge connect claude --agent-id my-agent-id --project /path/to/project
```

## Supported Agents

| Agent | Status | Adapter |
|-------|--------|---------|
| [OpenClaw](https://github.com/nicepkg/openclaw) | Available | WebSocket (Gateway Protocol v3) |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Available | stdio (stream-json) |
| [Codex CLI](https://github.com/openai/codex) | Coming soon | MCP over stdio |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Coming soon | TBD |

## Monorepo Packages

| Package | Path | Description |
|---------|------|-------------|
| `@skills-hot/agent-bridge` | `packages/cli` | CLI tool -- login, connect agents, check status |
| `@skills-hot/bridge-protocol` | `packages/protocol` | TypeScript type definitions for Bridge Protocol v1 |
| `@skills-hot/bridge-worker` | `packages/worker` | Cloudflare Worker -- WebSocket hub and Relay API |
| `@skills-hot/bridge-channels` | `packages/channels` | IM channel adapters (Telegram, Discord, Slack) |

## Documentation

- [Getting Started](docs/getting-started.md)
- [Bridge Protocol v1 Specification](docs/protocol.md)
- Adapters: [OpenClaw](docs/adapters/openclaw.md) | [Claude Code](docs/adapters/claude-code.md) | [Codex](docs/adapters/codex.md) | [Contributing an Adapter](docs/adapters/contributing-adapter.md)
- Channels: [Telegram](docs/channels/telegram.md) | [Discord](docs/channels/discord.md) | [Contributing a Channel](docs/channels/contributing-channel.md)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## License

[MIT](LICENSE)
