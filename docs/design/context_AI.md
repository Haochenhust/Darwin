Q: 在 groups/ 目录里，每个 Group 都有独立的 CLAUDE.md 来定义该 Group 的 Agent 行为。

这些 Group 是由谁来创建的？ 是你（开发者）在本地手动创建目录 + 编写 CLAUDE.md，还是系统支持"运行时动态创建"——比如你在飞书某个群里发一条消息 @Darwin 帮我建立这个群的对话 之后，Darwin 自动创建对应的 Group 文件夹和初始 CLAUDE.md？

这个问题会直接影响 orchestrator/group-manager.ts 和 tools/core/manage-groups.ts 的实现复杂度。

# 结论
---
groups/ 目录里，每个 Group 都有独立的 CLAUDE.md，系统支持"运行时动态创建"——比如你在飞书某个群里发一条消息 @Darwin 帮我建立这个群的对话 之后，Darwin 自动创建对应的 Group 文件夹和初始 CLAUDE.md
---
全局 CLAUDE.md 写人设，Group CLAUDE.md 只写群上下文，并且由 Darwin 自己通过 MCP Tool 来写入和更新；
1. 全局 CLAUDE.md → 通过 systemPrompt.append 注入，Session 创建时加载一次
2. Group CLAUDE.md → 通过 settingSources: ['project']，每次请求都重新加载（compacting-safe）
---
PreCompact 归档：保留完整原始记录，供 Darwin 未来回溯推断
---
群 CLAUDE.md：群上下文，Darwin 自主写入
矛盾处理：写入前检查（A）+ 对话中感知（B），主动向用户提问澄清；
A. 写入时：Darwin 准备往 CLAUDE.md 写入一条新偏好之前，先读一遍现有内容，发现冲突，然后问你："我注意到你之前说过 X，但今天你的反应像是 Y，哪个才是你真实的偏好？"
B. 对话中：用户当前的消息或行为和 CLAUDE.md 里的某条记录明显矛盾，Darwin 在正常回复的同时顺带澄清："顺便问一下，你之前说不喜欢看长分析，但你今天主动要求详细展开——是想更新这个偏好吗？"
---
架构文档里提到 Darwin 是"24/7 不间断运行"，有 Scheduler 支持定时任务。
我想问的是：在你的设想里，Darwin 的"主动行为"有多重要？
具体来说，Darwin 的工作模式更偏向哪种：
- 主动驱动型：Darwin 有大量自发行为——主动推送早报、定期生成投资研究报告、监控某个数据源有变化就通知你、定时总结一周对话。你不说话它也在工作。
主动驱动型 意味着 Scheduler 是系统的核心驱动力之一，和 Channel 是同等地位的消息来源。

Darwin 的主动行为是从哪里"知道"该做什么的？B + C
B. 由你在飞书里动态布置的：你某天告诉 Darwin "帮我每天盯着 BTC 价格，跌超 5% 就通知我"，Darwin 把这个任务写入数据库，Scheduler 持续执行。
C. Darwin 自己主动提议的：Darwin 观察到你频繁问某类问题，主动说"我注意到你每周一都会问上周的市场总结，要不要我自动帮你生成？"，得到确认后自己创建任务。
所有主动行为都来自动态学习或你的指派。Darwin 是真正从零开始"成长"出自己的工作模式的。
不要设计过多的工程约束，智能交给模型，决策交给模型；
---
群注册：
飞书里有一个新的群聊，第一条消息发给了 Darwin。这时候 groups/ 目录里还没有对应的文件夹。
Darwin 怎么知道该为这个群创建什么样的上下文？更具体地说：
当一个从未见过的 chat_id 第一次触达 Darwin 时，谁来完成"群注册"这个动作——是你提前在服务器上手动建好 groups/work-group/ 文件夹，还是 Darwin 自动创建，还是 Darwin 会先在飞书里问你"这个群叫什么、用途是什么"然后再初始化？
陌生 chat_id → Darwin 主动提问 → 用户回答 → Darwin 创建 groups/<folder>/ + 初始化 CLAUDE.md
---
先做 私聊部分和定时任务，再考虑群聊的部分吧；
---
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
✅ 验证：第一次私聊时，Darwin 主动问用途，回答后 groups/_main/CLAUDE.md 自动生成，后续对话从该文件加载群上下文

Step 7：PreCompact Hook + 对话归档
文件：agent/hooks.ts（PreCompact / PreToolUse / Stop）+ storage/archive.ts
说明：PreCompact 触发时将完整原始对话写入 groups/<folder>/conversations/<timestamp>.md；
这是 Darwin 记忆体系的基础设施，C 类主动提议（观察历史模式）依赖此归档
✅ 验证：手动触发或等待 compacting，groups/_main/conversations/ 下出现完整对话的 Markdown 文件

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
Debug设计
**关键原则：每一层的边界都要有日志。消息从飞书进来到 Darwin 回复出去，你应该能在日志里看到每一跳。如果某一跳没日志，就是 Debug 的盲区。**
你不熟悉 TypeScript，这意味着你需要的不是"看代码"，而是从外部观察系统状态。建议三层 Debug 手段：

层一：结构化日志（pino）
架构里已有 pino，但需要补充几个设计：

每条日志必须带上下文标签：
{ chatId, messageId, groupName, layer: "channel|orchestrator|agent|tool" }
本地开发时加 pino-pretty，日志变成可读格式：

[10:32:01] INFO  channel/feishu  收到消息 { chatId: "xxx", text: "你好" }
[10:32:01] INFO  orchestrator    推入 GroupQueue { group: "_main" }
[10:32:02] INFO  agent           query() 启动 { sessionId: "abc" }
[10:32:05] INFO  agent           AssistantMessage { text: "你好！" }
[10:32:05] INFO  channel/feishu  消息发送成功
层二：飞书私聊作为 Debug 控制台
在全局 CLAUDE.md 里加一条指令：

"每次处理消息时，如果遇到错误或异常，主动在私聊里告诉我发生了什么"

Darwin 自己就成了你的报警器。你不需要盯着终端，错误会主动找到你。

层三：/status 命令（调试 MCP Tool）
在 tools/core/ 加一个 debug-status.ts，让 Darwin 响应"你现在状态如何"：


返回内容示例：
- 活跃 Session：2个（_main, work-group）
- 待处理消息：0条
- 定时任务：3个（明天8点早报、每周一总结...）
- 上次 compacting：_main 2小时前
- 数据库大小：2.3MB
---
我还有一条核心的原则要告诉你：我认为这个Darwin架构要将更多的智能交给Agent来做，而不是在外面的工程层面做很多限制，要最大程度上释放Agent的能力，给Agent最大的发挥空间。而外层的工程层面要设计成 适合Agent自然生长的辅助架构，不要做太多限制，不要做太多限制，不要做太多限制。

我理解，而且这会成为 `AGENT.md` 的总原则。

我对你的意思的具体翻译是：

`Darwin` 不是一个“工程规则很多、Agent 只是被调用”的系统，  
而是一个“以 Agent 为中心”的系统。

外层工程层只做三件事：

1. 提供稳定、可恢复、可观测的运行环境。
2. 提供适合 Agent 自主读写的数据与工具。
3. 在必要处兜底，但不替 Agent 预先做过多决策。

也就是说：
`工程层负责土壤，不负责替植物规定每一片叶子怎么长。`
如果某个能力可以自然交给 Agent，就不要在外层硬编码流程、状态机、规则树或过细的限制。

第七个问题：在这个原则下，你是否接受这样一条边界？

`工程层可以保证可靠性、一致性、权限、安全、持久化；但不应该替 Agent 决定“该记住什么、该总结什么、该如何组织长期认知”。`