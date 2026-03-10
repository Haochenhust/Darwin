# Darwin架构设计调研

## 概览

Darwin是一个部署在 Macmini上的个人superAgent助手，它可以24/7不间断运行，随时接受任务并执行。通过飞书IM可以与Darwin聊天。
设计哲学：Skills first. Skills over features.

## 飞书接入方案

支持三种飞书聊天方式：私聊、普通群、话题群
- 私聊：与Bot的闲聊、布置定时任务等等；
- 普通群：以一个主题为核心的群聊，比如健康管理群、投资研究群等；
- 话题群：每次与Bot的聊天都是以一个话题为主线；
这里有一个关键的工程细节需要注意：

| 维度            | 私聊 (P2P)                 | 普通群 (Group)                    | 话题群 (Thread Group)         |
|-----------------|---------------------------|-----------------------------------|-------------------------------|
| **receive_id_type** | open_id / user_id            | chat_id                           | chat_id                       |
| **消息可见性**        | Bot看到所有消息                | 默认需 @Bot 才触发                   | 默认需 @Bot 才触发                 |
| **回复方式**         | 直接回复                      | 群中发送                             | 必须指定 root_id 回复到正确话题         |
| **核心坑点**         | 无                           | 需处理 @Bot 的触发判断                  | root_id + parent_id 的线程关系管理      |


消息通道实现方式：WebSocket 长连接 + 飞书 Node.js SDK(@larksuiteoapi/node-sdk)
理由：
1. Mac mini 没有公网 IP，WebSocket 长连接是唯一免公网方案
2. 只用飞书、只有自建应用，完美匹配长连接的限制条件
3. Node.js SDK 内置了长连接支持，与你的 TypeScript 技术栈一致
4. 断线重连 SDK 已内置处理

文档 / 日历 / 知识库操作：飞书 Node.js SDK 直接调 API + 封装为 MCP Tool

```
用户飞书消息 --> WebSocket --> 你的编排器 --> Claude Agent (带飞书 MCP Tools)
                                                  |
                                                  ├── mcp__feishu__create_document
                                                  ├── mcp__feishu__query_calendar
                                                  ├── mcp__feishu__search_wiki
                                                  └── ...
```
这完美契合 "Skills-first" 哲学：飞书的 API 能力作为 MCP Tools 注入 Agent，核心编排器不需要知道飞书 API 的任何细节。
话题群的处理建议：
把话题群的 thread 管理逻辑放在消息通道层，而不是让 Agent 操心 root_id。通道层负责：
1. 收到消息时，记录 message_id → root_id 的映射
2. Agent 回复时，自动附上正确的 root_id
3. Agent 只看到 "这是某个群里某个话题下的一条消息"，不需要知道底层的线程 ID 管理

## Claude Code 作为 Agent Runtime 的使用方式

### 使用 claude-agent-sdk
```
方案（2 步）:
  用户消息 → 宿主进程 → query()
  query() 结果 → 直接处理 → Channel 发送
  Agent 要发消息 → MCP Tool 直接调用宿主函数 → Channel 发送
```

### agent-runner 中有四个设计极其精妙
① MessageStream（push-based async iterable）
```
class MessageStream {private queue: SDKUserMessage[] = [];private waiting: (() => void) | null = null;private done = false;push(text: string): void { /* 推入新消息 */ }end(): void { /* 结束流 */ }
  async *[Symbol.asyncIterator]() { /* 消费消息 */ }}
```
**为什么需要它?**
Claude Agent SDK 的 query() 接受两种 prompt 格式：
- string — 单次请求，Agent 执行完就结束（isSingleUserTurn = true）
- AsyncIterable — 持续流式输入，Agent 可以在运行期间接收新消息
如果用 string 模式，Agent 执行完一轮就退出 query() 循环，你需要重新调用 query() + resume。而用 MessageStream 可以在 Agent 还在运行时注入新的用户消息，实现真正的多轮对话而不频繁重启 Agent。
使用场景： 当飞书 WebSocket 收到新消息时，直接 stream.push(text) 注入到正在运行的 Agent 中，无需等 Agent 完成当前任务再开新会话。这对用户体验至关重要 — 用户可以随时追加消息，Agent 会看到。

② Session 管理：resume + resumeSessionAt
```
const queryResult = await runQuery(prompt, sessionId, ...);if (queryResult.newSessionId) sessionId = queryResult.newSessionId;if (queryResult.lastAssistantUuid) resumeAt = queryResult.lastAssistantUuid;// 下次调用时：query({
  prompt: stream,
  options: {resume: sessionId,
    resumeSessionAt: resumeAt,  // 精确续接到上一条 assistant 消息}})
```
为什么 resumeSessionAt 很重要？
如果只用 resume: sessionId，SDK 默认从 session 末尾继续。但如果上一次 query 是异常退出的（比如超时），session 末尾可能停留在一个不完整的状态。resumeSessionAt: lastAssistantUuid 确保续接到最后一条完整的 assistant 回复之后，避免上下文污染。
这也是之前遇到 compacting 上下文混淆的一个潜在原因 — 如果没有正确 resume，可能会重复注入历史消息或从错误的位置续接。

③ PreCompact Hook：对话归档
```
hooks: {
  PreCompact: [{ hooks: [createPreCompactHook(assistantName)] }],}
```
在 compacting 发生前，把完整的对话记录存档为 Markdown 文件到 conversations/ 目录。这是一个数据保险机制 — compacting 会丢失细节，但原始记录被保留了。
增强方向：
- 归档后可以把摘要写入 CLAUDE.md 的 "历史对话摘要" 部分(TODO: 待进一步设计)

④ 双层 System Prompt
```
systemPrompt: globalClaudeMd
  ? { type: 'preset', preset: 'claude_code', append: globalClaudeMd }: undefined,
settingSources: ['project', 'user'],  // 加载 per-group CLAUDE.md
```
用了两层注入：
- 全局指令：通过 systemPrompt.append 追加全局 CLAUDE.md（所有 Group 共享的行为规范）
- 分组指令：通过 settingSources: ['project']，SDK 自动加载 cwd（即 /workspace/group）下的 CLAUDE.md
为什么不全放 system prompt？ 因为 settingSources 加载的 CLAUDE.md 在每次请求时自动重新注入，不受 compacting 影响。而 systemPrompt.append 只在 session 创建时设置一次。所以：
**关键原则：所有不能丢失的指令（人格、行为规范、工具使用说明）放 CLAUDE.md（通过 settingSources 加载），临时性的上下文放 prompt。**

### MCP Tools设计

进程内 MCP Server 的实现方式
Claude Agent SDK 提供了 createSdkMcpServer() 用于创建进程内 MCP Server，不需要启动独立子进程：
```
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";import { z } from "zod";// 创建进程内 MCP Server（不是独立进程，不需要 stdio transport）const clawbotMcp = createSdkMcpServer({
  name: "clawbot",
  version: "1.0.0",
  tools: [tool("send_message", "发送消息到当前群组", {
      text: z.string(),}, async (args) => {// 直接调用 Channel 函数，无需 IPC 文件await channel.sendMessage(currentChatJid, args.text);return { content: [{ type: "text", text: "消息已发送" }] };}),tool("schedule_task", "创建定时任务", {
      prompt: z.string(),
      schedule_type: z.enum(["cron", "interval", "once"]),
      schedule_value: z.string(),}, async (args) => {// 直接操作数据库，无需 IPC
      db.createTask({ ... });return { content: [{ type: "text", text: `任务已创建` }] };}),// ... 飞书 MCP Tools]});
```
然后传入 query() 的 mcpServers 选项：
```
for await (const message of query({
  prompt: stream,
  options: {
    mcpServers: {
      clawbot: clawbotMcp,           // 进程内 MCP（send_message, schedule_task 等）
      feishu: feishuMcpServer,       // 进程内 MCP（飞书 API）},
    allowedTools: [// 内置工具'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep','WebSearch', 'WebFetch','Task', 'TodoWrite', 'Skill',// Agent Teams'TeamCreate', 'TeamDelete', 'SendMessage',// 自定义 MCP 全部放行'mcp__clawbot__*','mcp__feishu__*',],// ...}}))
```
### query的循环设计
每个 Group 的 Agent 生命周期：
1. 收到该 Group 的第一条消息
2. 创建 MessageStream
3. stream.push(firstMessage)
4. 启动 query({ prompt: stream, options: { ... } })
5. 处理 query 的流式输出（发回飞书）
6. 期间如果飞书又来新消息 → stream.push(newMessage)
7. Agent 处理完所有 pending 消息后进入"空闲"
8. 一段时间（如 5 分钟）无新消息 → stream.end() → query() 退出
9. 保存 sessionId + lastAssistantUuid
10. 下次来消息 → resume session → 回到步骤 2

## Graceful Shutdown & Recovery

Darwin 是 24/7 运行的单进程服务，进程退出（有意 or 崩溃）和重启后的状态恢复是生产可用的必要条件。

### 两类退出场景

| 场景 | 触发方式 | 目标 |
|------|---------|------|
| **Graceful Shutdown** | `SIGTERM` / `SIGINT`（launchd 停止、手动 Ctrl+C） | 有序保存状态，零数据丢失 |
| **Crash Recovery** | 未捕获异常、OOM、强杀（`SIGKILL`） | launchd 重启后自动从上次断点续接 |

---

### Graceful Shutdown 流程

收到 `SIGTERM` / `SIGINT` 后，按以下顺序有序关闭：

```
SIGTERM
  │
  ├─ 1. Channel 停止接收新消息（关闭飞书 WebSocket，不再 push 入 GroupQueue）
  │
  ├─ 2. Scheduler 停止轮询（不再触发新的定时任务）
  │
  ├─ 3. 等待 GroupQueue drain（所有正在运行的 Agent query() 自然结束）
  │      超时上限：30 秒，超时后强制 stream.end() 所有活跃 stream
  │
  ├─ 4. 对每个活跃 Group 执行 checkpoint：
  │      - 持久化 sessionId + lastAssistantUuid → session-repo
  │      - 持久化 MessageStream 中尚未处理的 pending 消息 → message-repo（status = 'pending'）
  │
  ├─ 5. 关闭 SQLite 连接（flush WAL）
  │
  └─ 6. 进程退出（exit code 0）
```

**关键：pending 消息持久化**
飞书消息在收到时立刻写入 `messages` 表（`status = 'received'`），推入 `GroupQueue` 后标记为 `status = 'processing'`，Agent 回复成功后标记为 `status = 'done'`。进程退出时，所有 `status != 'done'` 的消息在下次启动时会被重新捡起处理。

---

### Crash Recovery 流程

launchd `KeepAlive = true` 保证崩溃后自动重启。重启时 `src/index.ts` 执行以下恢复逻辑：

```
进程启动
  │
  ├─ 1. 数据库连接恢复（SQLite WAL 自动回滚未提交事务）
  │
  ├─ 2. 扫描 messages 表，捡起 status = 'received' | 'processing' 的遗留消息
  │      按 Group 分组，重新推入对应 GroupQueue
  │      （飞书消息已落库，不会丢失；重复推送靠 message_id 去重）
  │
  ├─ 3. 扫描 sessions 表，恢复每个 Group 的 sessionId + lastAssistantUuid
  │      下次 query() 时使用 resume + resumeSessionAt 精确续接
  │      （崩溃前 session 末尾可能有残缺状态，resumeSessionAt 确保从最后完整回复续接）
  │
  ├─ 4. 重新建立飞书 WebSocket 长连接
  │
  └─ 5. 恢复完成，正常消息循环
```

---

### SQLite 数据一致性保障

单进程 + SQLite，数据一致性靠以下三点：

| 机制 | 作用 |
|------|------|
| **WAL 模式**（`PRAGMA journal_mode=WAL`） | 崩溃后自动回滚未提交事务，不会出现半写状态 |
| **消息状态机**（`received → processing → done`） | 重启后可精确识别需要重处理的消息，天然幂等 |
| **`withTx()` 事务包装**（db.ts） | 跨表写入（如"标记消息 + 更新 Group 状态"）要么全成功要么全回滚 |

---

### 在 index.ts 中的注册方式

```typescript
// src/index.ts
const shutdown = async (signal: string) => {
  logger.info(`收到 ${signal}，开始 Graceful Shutdown...`);
  await channelRegistry.stopAll();        // Step 1
  scheduler.stop();                       // Step 2
  await groupQueue.drain(30_000);         // Step 3：30s 超时
  await sessionManager.checkpointAll();  // Step 4
  db.close();                             // Step 5
  logger.info('Shutdown 完成');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// 未捕获异常：记录日志后让 launchd 重启，不尝试恢复（恢复逻辑在启动时）
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '未捕获异常，进程即将退出');
  db.close();
  process.exit(1);
});
```

---

## 参考项目
- NanoClaw: https://github.com/Haochenhust/ClawPartner/tree/feat/chenhao;
- GraceBot: https://github.com/Haochenhust/GraceBot;
- OpenClaw: https://github.com/openclaw/openclaw;
- agentara: https://github.com/MagicCube/agentara;