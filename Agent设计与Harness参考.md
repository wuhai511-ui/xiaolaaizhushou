# 小拉 Agent：DeepSeek Harness 参考与落地说明

参考项目：https://github.com/deepseek-ai/deepseek-harness 。本版本是参考其架构思路独立实现，并没有接入 DeepSeek Harness 包或复制其源码。

| 参考内容 | 本地版本 | 后续 |
|---|---|---|
| Agent loop：模型调用、工具执行、再返回模型 | 公司模型 function calling；动态工具目录；串行多步，每轮最多 6 次模型步骤，每批最多 8 个工具 | 可取消、流式输出、更细粒度步骤控制 |
| MCP 客户端：工具发现、schema、分页与同名冲突 | 当前已接的一个远端 MCP；分页、游标与同名校验；按 schema 传递给模型 | 使用标准 MCP SDK，支持多服务、命名空间、重连和通知 |
| LLM 与具体模型适配分层 | 公司网关适配器与循环分离 | 增加 provider 路由、模型能力探测和上下文压缩 |
| 工具执行与审批分离 | 本地只读允许清单自动执行，其余逐次显示完整参数供确认；一次性确认 ID | 认证用户、商户授权、持久审批、细粒度策略与审计 |
| 未开始、已开始、结果未知 | 工具调用前记录编号和 started；返回/失败/未知分别落库；启动恢复未完成调用为 unknown | 提供管理查询、持久化业务关联、恢复后业务对账 |
| Session 事件记录 | 当前对话仅在服务进程内保存，浏览器另存业务摘要；调用日志仅存工具名、状态、时间和编号 | 安全持久化多用户会话、加密、数据保留与访问控制 |

参考来源：
- Agent loop 与未知结果处理：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md
- MCP 工具发现及分页：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md
- 模型服务和适配器：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/README.md

本地原型的确认 ID 不等同于正式用户身份或商户授权；不支持生产级审批。不要将未经授权的工具公开给公网。工具返回和模型生成内容应作为不可信数据，业务结果以原系统为准。当前不保证所有工具参数 schema 的所有 JSON Schema 特性；未支持的约束仍需上游及人工确认。
