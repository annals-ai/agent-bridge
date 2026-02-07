# Agent Bridge — 统一 Agent 连接器

Skills.Hot 平台的开源组件，让各类 AI Agent (OpenClaw, Claude Code, Codex, Gemini) 通过统一的 Bridge Protocol 接入 SaaS 平台，用户可以把本地 Agent 变成在线服务出租。

## 仓库结构

pnpm monorepo，4 个包：

```
agent-bridge/
├── packages/
│   ├── protocol/       # @skills-hot/bridge-protocol — 消息类型定义与错误码
│   ├── cli/            # agent-bridge CLI — 连接本地 Agent 到平台
│   ├── worker/         # bridge-worker — Cloudflare Worker 中继服务
│   └── channels/       # @skills-hot/bridge-channels — Telegram/Discord/Slack 渠道 (stub)
├── scripts/
│   └── test-openclaw.mjs   # E2E 测试脚本 (直连 Mac Mini Gateway)
├── vitest.config.ts
└── package.json
```

## Bridge Protocol v1

协议版本: `BRIDGE_PROTOCOL_VERSION = 1`

### CLI → Worker (上行)

| 消息类型     | 说明                     | 关键字段                                |
|------------|------------------------|-----------------------------------------|
| `register` | WS 连接后立即发送，认证注册     | `agent_id`, `token`, `agent_type`, `capabilities` |
| `chunk`    | 流式文本增量               | `session_id`, `request_id`, `delta`      |
| `done`     | Agent 回复完成             | `session_id`, `request_id`               |
| `error`    | Agent 报错               | `code` (BridgeErrorCode), `message`      |
| `heartbeat`| 定时心跳                  | `active_sessions`, `uptime_ms`           |

### Worker → CLI (下行)

| 消息类型       | 说明                | 关键字段                                 |
|--------------|--------------------|-----------------------------------------|
| `registered` | 注册确认              | `status` ('ok' / 'error')               |
| `message`    | 转发用户消息给 Agent    | `session_id`, `request_id`, `content`, `attachments` |
| `cancel`     | 取消进行中的请求        | `session_id`, `request_id`               |

### Relay API (平台 ↔ Worker HTTP)

- `POST /api/relay` — 平台向 Agent 发消息，返回 SSE 流
- `GET /api/agents/:id/status` — 查询 Agent 在线状态
- `GET /health` — 健康检查
- 认证: `X-Platform-Secret` header

### 错误码

`timeout`, `adapter_crash`, `agent_busy`, `auth_failed`, `agent_offline`, `invalid_message`, `session_not_found`, `rate_limited`, `internal_error`

## Agent 适配器

所有适配器继承 `AgentAdapter` 抽象类 (`packages/cli/src/adapters/base.ts`):
- `isAvailable()` — 检测 Agent 是否可用
- `createSession(id, config)` → `SessionHandle` (send / onChunk / onDone / onError / kill)
- `destroySession(id)` — 销毁会话

### OpenClaw (已实现)

- 协议: OpenClaw Gateway Protocol v3, JSON-RPC over WebSocket
- 默认地址: `ws://127.0.0.1:18789`
- 流程: `connect` 握手 → `agent` 请求 → `event(agent)` 流式响应
- 流式处理: `assistant` stream 累积文本 + `lifecycle end` 结束
- `idempotencyKey` 必须提供

### Claude Code (已实现)

- 协议: `claude --output-format stream-json --input-format stream-json`
- 通过 stdin 发送 NDJSON，stdout 读取流式事件
- 事件: `assistant/text_delta` 增量 → `result` 或 `assistant/end` 结束
- 每条消息 spawn 新进程，5 分钟空闲超时自动 kill
- 可用性检测: 检查 `claude` 命令是否在 PATH 中

### Codex (stub)

- 计划: MCP over stdio
- 状态: `isAvailable()` 返回 false

### Gemini (stub)

- 状态: `isAvailable()` 返回 false

## 关键约束

- **OpenClaw Client ID**: Gateway 只接受特定 client ID — `gateway-client`, `openclaw-probe`, `cli`, `openclaw-control-ui`。当前适配器使用 `gateway-client`
- **非本地连接**: 需要在 openclaw.json 配置 `trustedProxies` 或使用设备签名
- **协议版本锁定**: OpenClaw 适配器硬编码 `minProtocol: 3, maxProtocol: 3`
- **Worker 认证**: API 端点需 `X-Platform-Secret` header (WebSocket 和 health 除外)

## 渠道接入 (channels)

`packages/channels/` 提供消息渠道抽象:
- `TelegramChannel` — Telegram Bot
- `DiscordChannel` — Discord Bot
- `SlackChannel` — Slack App

目前均为 stub 实现，Phase 5 计划。

## CLI 命令

```bash
# 登录平台
agent-bridge login

# 连接 Agent
agent-bridge connect <type> --agent-id <id> [options]

# type: openclaw | claude | codex | gemini
# --project <path>          # Claude 适配器的项目路径
# --gateway-url <url>       # OpenClaw Gateway 地址
# --gateway-token <token>   # OpenClaw Gateway token
# --bridge-url <url>        # Bridge Worker WS 地址 (默认 wss://bridge.skills.hot/ws)

# 查看状态
agent-bridge status
```

## 开发指南

```bash
# 安装依赖
pnpm install

# 全量构建
pnpm build          # tsup 构建各包

# 运行测试
pnpm test           # vitest run (根目录 vitest.config.ts, tests/**/*)

# E2E 测试 (直连 OpenClaw Gateway)
node scripts/test-openclaw.mjs [gateway-url] [token]
```

### 包依赖关系

```
protocol ← cli
protocol ← worker
           channels (独立)
```

## 部署

### Worker → bridge.skills.hot

```bash
cd packages/worker
npx wrangler deploy
```

- 路由: `bridge.skills.hot/*`
- KV: `BRIDGE_KV` (Agent 注册信息)
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PLATFORM_SECRET`

### CLI → npm

```bash
cd packages/cli
npm publish
```

## 平台集成 (skills-hot 仓库)

agent-bridge 与 skills-hot 主平台的集成点:

- `src/lib/bridge-client.ts` — `sendToBridge()` + `checkBridgeAgentHealth()`
- Chat route — 双通道路由: `connection_mode` = `gateway` 走 OpenClaw 直连, `bridge` 走 Bridge Worker relay
- `agents` 表 — `agent_type`, `connection_mode`, `bridge_connected_at` 字段
- Developer API — 注册 Agent 时指定 `agent_type` + `connection_mode`
- Health cron — bridge 模式走 HTTP 检查 (`GET /api/agents/:id/status`)

## 测试规范

- 框架: vitest (根目录 `vitest.config.ts`)
- 测试文件: `tests/**/*.test.ts`
- E2E: `scripts/test-openclaw.mjs` (需要可用的 OpenClaw Gateway)
- 新功能必须有对应测试用例
