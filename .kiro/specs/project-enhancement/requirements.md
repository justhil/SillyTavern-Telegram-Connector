# Requirements Document

## Introduction

本文档定义了 SillyTavern Telegram Connector 项目的增强需求，涵盖以下核心功能模块：
1. 酒馆插件与后端的连接优化
2. 服务器端 Docker 支持
3. Telegram 机器人流式输出优化
4. 酒馆输出的前端代码支持
5. Telegram 输出可渲染格式支持

## Glossary

- **SillyTavern (ST)**: 一个开源的 AI 角色扮演前端应用
- **Bridge_Server**: 连接 SillyTavern 和 Telegram 的 WebSocket 中间服务器
- **Telegram_Bot**: 通过 Telegram Bot API 与用户交互的机器人实例
- **WebSocket_Connection**: SillyTavern 扩展与 Bridge_Server 之间的实时双向通信连接
- **Stream_Chunk**: 流式传输过程中的单个文本片段
- **Heartbeat**: 用于检测连接存活状态的周期性信号
- **Docker_Container**: 运行 Bridge_Server 的容器化环境
- **Markdown_Renderer**: 将 Markdown 格式文本转换为可渲染格式的处理器
- **HTML_Parser**: 将文本转换为 Telegram 支持的 HTML 格式的解析器

## Requirements

### Requirement 1: WebSocket 连接稳定性增强

**User Story:** As a 用户, I want WebSocket 连接具有心跳检测机制, so that 我能及时发现连接断开并自动重连。

#### Acceptance Criteria

1. WHILE WebSocket_Connection 处于已连接状态, THE Bridge_Server SHALL 每30秒发送一次心跳包到 SillyTavern 扩展。
2. WHEN SillyTavern 扩展在45秒内未收到心跳包, THE SillyTavern 扩展 SHALL 将连接状态标记为断开并尝试自动重连。
3. WHEN WebSocket_Connection 断开, THE SillyTavern 扩展 SHALL 在5秒后尝试自动重连，最多重试3次。
4. WHILE 重连尝试进行中, THE SillyTavern 扩展 SHALL 在状态栏显示"重连中..."及当前重试次数。

### Requirement 2: Docker 容器化部署支持

**User Story:** As a 开发者, I want 通过 Docker 部署 Bridge_Server, so that 我能快速在任何环境中启动服务。

#### Acceptance Criteria

1. THE Bridge_Server SHALL 提供 Dockerfile 文件，支持构建包含所有依赖的容器镜像。
2. THE Bridge_Server SHALL 提供 docker-compose.yml 文件，支持一键启动服务。
3. WHEN 用户通过环境变量配置 TELEGRAM_BOT_TOKEN, THE Docker_Container SHALL 使用该环境变量作为 Telegram Bot Token。
4. WHEN 用户通过环境变量配置 WSS_PORT, THE Docker_Container SHALL 使用该端口作为 WebSocket 服务端口。
5. THE Docker_Container SHALL 支持通过 volume 挂载持久化配置文件。

### Requirement 3: Telegram 流式输出优化

**User Story:** As a 用户, I want Telegram 消息在流式生成时保持"输入中"状态, so that 我知道 AI 正在生成回复。

#### Acceptance Criteria

1. WHILE AI 正在生成回复, THE Telegram_Bot SHALL 持续显示"输入中"状态直到生成完成。
2. WHEN Stream_Chunk 累计超过50个字符, THE Telegram_Bot SHALL 发送初始消息并开始更新。
3. THE Telegram_Bot SHALL 以不超过每2秒一次的频率更新流式消息内容。
4. WHEN 流式生成完成, THE Telegram_Bot SHALL 发送最终格式化后的完整消息。
5. IF 流式传输过程中发生错误, THEN THE Telegram_Bot SHALL 发送错误提示消息并清理流式会话状态。

### Requirement 4: Telegram 消息格式化输出

**User Story:** As a 用户, I want Telegram 消息支持 Markdown 或 HTML 格式渲染, so that 我能看到格式化的 AI 回复。

#### Acceptance Criteria

1. THE HTML_Parser SHALL 将 SillyTavern 输出的文本转换为 Telegram 支持的 HTML 格式。
2. WHEN 文本包含粗体标记, THE HTML_Parser SHALL 将其转换为 `<b>` 标签。
3. WHEN 文本包含斜体标记, THE HTML_Parser SHALL 将其转换为 `<i>` 标签。
4. WHEN 文本包含代码块, THE HTML_Parser SHALL 将其转换为 `<code>` 或 `<pre>` 标签。
5. IF HTML 解析失败, THEN THE Telegram_Bot SHALL 回退到纯文本模式发送消息。

### Requirement 5: 前端消息处理优化

**User Story:** As a 用户, I want 酒馆前端正确处理和转发 AI 回复, so that Telegram 能收到完整格式化的消息。

#### Acceptance Criteria

1. WHEN AI 生成完成, THE SillyTavern 扩展 SHALL 从 DOM 中提取完整的渲染后文本。
2. THE SillyTavern 扩展 SHALL 保留文本中的换行符和基本格式标记。
3. WHEN 用户在生成过程中发送新消息, THE SillyTavern 扩展 SHALL 拦截该消息并提示用户等待当前生成完成。
4. WHEN 角色或聊天切换时, THE SillyTavern 扩展 SHALL 通知 Bridge_Server 清空旧的流式会话缓存。

### Requirement 6: 可选方案配置

**User Story:** As a 用户, I want 能够选择不同的消息格式化方案, so that 我能根据需求选择最适合的输出格式。

#### Acceptance Criteria

1. THE Bridge_Server SHALL 支持通过配置文件选择消息格式化模式（HTML/Markdown/纯文本）。
2. WHEN 配置为 HTML 模式, THE Telegram_Bot SHALL 使用 parse_mode: 'HTML' 发送消息。
3. WHEN 配置为 Markdown 模式, THE Telegram_Bot SHALL 使用 parse_mode: 'MarkdownV2' 发送消息。
4. WHEN 配置为纯文本模式, THE Telegram_Bot SHALL 不使用任何 parse_mode 发送消息。
5. THE 配置文件 SHALL 提供默认值，用户可选择性覆盖。
