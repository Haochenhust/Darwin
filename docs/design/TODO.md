模块开发顺序：

Step 1：项目骨架 + 日志系统
文件：package.json / tsconfig.json / .env / src/config.ts / src/logger.ts（pino + pino-pretty）
✅ 验证：npm run dev 启动不报错，终端打印带 layer 标签的结构化日志

Step 2：飞书 WebSocket 连接 + Channel 注册表
文件：channels/feishu/client.ts + channels/feishu/index.ts + channels/feishu/constants.ts + channels/registry.ts
说明：registry.ts 实现工厂模式，后续新增 Telegram 等 Channel 无需改 index.ts
✅ 验证：飞书后台显示 Bot 在线，终端日志出现"WebSocket connected"

Step 3：消息收发 Echo（不接 Agent）
文件：channels/feishu/message-handler.ts（解析消息体，处理私聊触发），index.ts 临时内联回复
✅ 验证：私聊发"你好"，Darwin 回"你好"，收发链路通了

Step 4：存储层
文件：storage/db.ts + storage/migrations/001_init.sql + storage/repositories/（message-repo / group-repo / session-repo / state-repo）+ scripts/migrate.ts
说明：state-repo 是 KV 表，供后续模块存任意键值状态；migrate.ts 负责按序执行 SQL 迁移文件
✅ 验证：发一条消息，sqlite3 data/darwin.db "SELECT * FROM messages" 看到记录落库

Step 5：Agent 接入（含输出解析，临时内联路由）
文件：agent/message-stream.ts + agent/index.ts + agent/prompt-builder.ts + agent/output-parser.ts + 全局 CLAUDE.md
说明：output-parser.ts 必须在此步加入——处理 <internal> 块过滤、超长消息分割（飞书单条上限约 4096 字符）；
index.ts 此时仍使用临时内联路由：飞书消息 → 直接调用 agent.query() → 回复，下一步替换
✅ 验证：私聊发消息，Darwin 用 Claude 智能回复；发一条能触发长回复的问题，验证消息被正确分割

Step 6：正式编排层替换临时路由 + Group 自动 Onboarding
文件：orchestrator/group-queue.ts + orchestrator/router.ts + orchestrator/session-manager.ts + orchestrator/group-manager.ts
说明：此步核心是"替换"——用 GroupQueue + Router 替换 Step 5 的临时内联路由，行为不变但架构正确；
group-manager.ts 实现陌生 chat_id 的 Onboarding 流程（Darwin 提问 → 用户回答 → 创建 groups/<folder>/CLAUDE.md）
✅ 验证：第一次私聊时，Darwin 主动问用途，回答后 groups/main/CLAUDE.md 自动生成，后续对话从该文件加载群上下文

Step 7：PreCompact Hook + 对话归档
文件：agent/hooks.ts（PreCompact / PreToolUse / Stop）+ storage/archive.ts
说明：PreCompact 触发时将完整原始对话写入 groups/<folder>/conversations/<timestamp>.md；
这是 Darwin 记忆体系的基础设施，C 类主动提议（观察历史模式）依赖此归档
✅ 验证：手动触发或等待 compacting，groups/main/conversations/ 下出现完整对话的 Markdown 文件

Step 8：Core MCP Tools（编排器能力暴露给 Agent）
文件：tools/index.ts + tools/core/send-message.ts + tools/core/manage-groups.ts + tools/core/manage-sessions.ts + tools/core/debug-status.ts
说明：manage-groups.ts 供 Darwin 调用以创建群文件夹；debug-status.ts 返回活跃 Session / 待处理消息 / 定时任务列表等状态
✅ 验证：
  - 让 Darwin "用工具主动发一条消息给我"，观察 MCP Tool 调用日志
  - 问 Darwin "你现在状态如何"，收到结构化状态报告

Step 9：Scheduler + schedule-task Tool（MVP2）
文件：orchestrator/scheduler/index.ts + orchestrator/scheduler/task-runner.ts + orchestrator/scheduler/types.ts + tools/core/schedule-task.ts + storage/repositories/task-repo.ts
✅ 验证：对 Darwin 说"1分钟后提醒我喝水"，1分钟后收到飞书消息

Step 10：通用工具 tools/general/
文件：tools/general/notification.ts + tools/general/system-info.ts + tools/general/file-manager.ts + tools/general/clipboard.ts
说明：notification.ts（macOS 系统弹窗）在 Scheduler 任务触发时可作为备用通知手段；system-info.ts 为 debug-status 提供磁盘/内存数据
✅ 验证：让 Darwin 弹一个 macOS 系统通知

Step 11：飞书 MCP Tools（按需逐个加）
文件：tools/feishu/docs.ts / calendar.ts / wiki.ts / sheets.ts ...
✅ 验证：每加一个工具，让 Darwin 调用一次验证

Step 12：Graceful Shutdown + Crash Recovery + launchd
文件：src/index.ts 信号处理（SIGTERM/SIGINT）+ 启动时 Crash Recovery 逻辑（扫描 received/processing 状态消息重新处理）+ launchd/com.darwin.agent.plist + launchd/install.sh
说明：Crash Recovery 在进程重启时自动扫描 messages 表，捡起未完成消息重新推入 GroupQueue；KeepAlive=true 保证崩溃后 launchd 自动重启
✅ 验证：强制 kill 进程，重启后未完成的消息被重新处理；重启 Mac mini，Darwin 开机自动恢复

---
