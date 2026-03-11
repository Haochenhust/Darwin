# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Darwin is a personal AI assistant (superAgent) that runs 24/7 on a Mac mini. It communicates via Feishu (Lark) IM and uses the Claude Agent SDK for intelligent task execution. The design philosophy is "Skills first" — capabilities are added via MCP Tools rather than features.

## Development Commands

```bash
# Development (hot reload via nodemon + tsx)
npm run dev

# Type check without emitting
npm run typecheck

# Build for production (outputs to dist/)
npm run build

# Run a single test file
npx vitest run tests/unit/agent/message-stream.test.ts

# Run all tests
npx vitest run

# Run tests in watch mode
npx vitest
```

## Architecture (Four Layers)

```
┌─────────────────────────────────────┐
│  Layer 1: Channels (消息通道层)      │  Feishu WebSocket (planned: Telegram/Slack)
├─────────────────────────────────────┤
│  Layer 2: Orchestrator (编排层)      │  Message routing, GroupQueue, Session mgmt, Scheduler
├─────────────────────────────────────┤
│  Layer 3: Agent (智能体层)           │  Claude Agent SDK query(), MessageStream, Hooks
├─────────────────────────────────────┤
│  Layer 4: Tools / MCP (能力层)       │  Feishu API, file ops, custom MCP Tools
└─────────────────────────────────────┘
```

### Key Architectural Decisions

- **Single process, no Docker**: Direct macOS integration (osascript, pbcopy) with lower latency
- **SQLite with better-sqlite3**: Synchronous API matches Node.js single-thread model; WAL mode for crash safety
- **WebSocket long connection**: Used because the Mac mini has no public IP; Feishu SDK handles reconnection
- **In-process MCP Server**: Uses `createSdkMcpServer()` from Claude Agent SDK — no separate process needed
- **Per-group sessions**: Each Feishu chat (private/group/thread) has isolated context in `groups/<folder>/`

### Message Flow

```
User Message → Feishu WebSocket → Channel → DB (messages table) → GroupQueue → Agent
                                                      ↑
Scheduler (cron) ─────────────────────────────────────┘
```

## Project Structure

| Path | Purpose |
|------|---------|
| `src/index.ts` | Main entry: initializes all layers, starts channels, registers shutdown hooks |
| `src/config.ts` | Environment variable parsing and validation (reads from `.env`) |
| `src/logger.ts` | Pino logger with layer-based child loggers |
| `src/channels/` | IM platform integrations (currently Feishu only) |
| `src/channels/feishu/` | WebSocket client, message handler, thread manager, card builder |
| `src/orchestrator/` | GroupQueue (per-group concurrency), session management, scheduler |
| `src/agent/` | Claude Agent SDK wrapper, MessageStream (push-based async iterable), hooks |
| `src/tools/` | MCP Tool definitions organized by domain: `core/`, `feishu/`, `general/` |
| `src/storage/` | better-sqlite3 connection, repositories (one per table), archive logic |
| `groups/` | Per-group data: `main/` (private chat), others created dynamically |
| `groups/<name>/CLAUDE.md` | Group-specific context loaded via `settingSources: ['project']` |
| `launchd/` | macOS service definition for auto-start and crash recovery |
| `scripts/` | Operational scripts: setup, migrate, health-check |

## Environment Configuration

Required in `.env`:

```bash
# Feishu credentials (required for Feishu channel)
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_DOMAIN=feishu          # or 'lark' for international version
FEISHU_ENCRYPT_KEY=           # optional
FEISHU_VERIFICATION_TOKEN=    # optional

# Logging
LOG_LEVEL=info                # fatal|error|warn|info|debug|trace|silent
LOG_PRETTY=true               # human-readable logs in development
```

## Key Implementation Details

### Channel System (`src/channels/`)

Channels implement a common interface: `connect()`, `disconnect()`, `sendMessage()`, `isConfigured()`. The `ChannelRegistry` auto-discovers configured channels at startup. Feishu channel handles three chat types: private (P2P), normal group, and thread group — with thread-manager.ts isolating the complexity of root_id tracking.

### MessageStream (`src/agent/message-stream.ts`)

Push-based async iterable that allows injecting new messages into a running Agent session. When Feishu receives a new message while the Agent is processing, it calls `stream.push()` instead of starting a new session. Essential for true multi-turn conversations without frequent session restarts.

### Session Management

Sessions are persisted with `sessionId` + `lastAssistantUuid`. When resuming, use `resumeSessionAt` to ensure precise continuation from the last complete assistant message, avoiding context pollution from incomplete states.

### Graceful Shutdown & Recovery

On `SIGTERM`/`SIGINT`:
1. Stop channel message intake (close WebSocket)
2. Stop scheduler
3. Wait for GroupQueue to drain (30s timeout)
4. Checkpoint all sessions
5. Close SQLite (flush WAL)

On crash recovery (`launchd KeepAlive`):
1. SQLite WAL auto-rollback uncommitted transactions
2. Scan messages table for `status != 'done'`, re-queue them
3. Restore sessions from session-repo
4. Reconnect WebSocket

### Adding a New MCP Tool

1. Create file in appropriate subdirectory: `src/tools/<domain>/<tool-name>.ts`
2. Define Zod schema for parameters and implement handler
3. Export from `src/tools/index.ts` to register with `createSdkMcpServer()`
4. Add to `allowedTools` in agent query options if restricted

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 22 LTS (see `.nvmrc`) |
| Language | TypeScript | ^5.9 |
| Module | ESM | `"type": "module"` |
| Feishu SDK | @larksuiteoapi/node-sdk | ^1.54 |
| Logging | pino + pino-pretty | ^10.0 |
| Dev Runner | nodemon + tsx | — |
| Testing | vitest | (configured in `vitest.config.ts`) |

## Code Conventions

- **ESM only**: All imports use `.js` extensions (TypeScript requirement with `NodeNext` moduleResolution)
- **Strict TypeScript**: All compiler strict flags enabled
- **Repository pattern**: One file per table in `src/storage/repositories/`
- **Layer-based logging**: Use `createLayerLogger(layerName, context)` for consistent log structure
