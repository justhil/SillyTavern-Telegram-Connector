## 关于项目
非常抱歉，由于最近工作和生活上的事务越来越繁忙，我可能无法继续维护此项目。  
本项目代码完全开源，欢迎任何人随时Fork并进行自己的开发和改进。  
如果您对这个项目感兴趣，请随意将其作为您自己项目的起点，无需额外许可。  
感谢您的理解与支持。

# SillyTavern Telegram Connector

SillyTavern Telegram Connector 是一个为 SillyTavern 设计的扩展，允许用户通过 Telegram 与 SillyTavern 中的 AI 角色进行交互。该扩展建立了 SillyTavern 与 Telegram 机器人之间的桥接，使用户能够在移动设备上随时随地与他们喜爱的 AI 角色聊天。  
[![License](https://img.shields.io/github/license/qiqi20020612/SillyTavern-Telegram-Connector)](https://github.com/qiqi20020612/SillyTavern-Telegram-Connector/blob/main/LICENSE)
[![stars](https://img.shields.io/github/stars/qiqi20020612/SillyTavern-Telegram-Connector)](https://github.com/qiqi20020612/SillyTavern-Telegram-Connector)

## 功能特点

- **Telegram 集成**：通过 Telegram 应用与 SillyTavern 中的 AI 角色进行对话
- **实时同步**：Telegram 中的对话会实时同步到 SillyTavern 界面，反之亦然
- **命令支持**：提供多种 Telegram 命令，用于管理聊天和角色
  - `/help` - 显示所有可用命令
  - `/new` - 开始新的聊天
  - `/listchars` - 列出所有可用角色
  - `/switchchar <角色名称>` - 切换到指定角色
  - `/listchats` - 列出当前角色的所有聊天记录
  - `/switchchat <聊天名称>` - 切换到指定聊天记录
- **简单配置**：通过 WebSocket 连接，易于设置和使用

## 安装和使用

### 扩展安装

1. 在 SillyTavern 中，导航至 "Extensions" 标签页
2. 点击 "Install Extension"
3. 输入以下 URL: `https://github.com/qiqi20020612/SillyTavern-Telegram-Connector`
4. 点击 "Install" 按钮
5. 安装完成后，重启 SillyTavern

### 服务器设置

1. 克隆或下载此仓库到您的计算机
2. 进入 `server` 目录
3. 安装依赖：
   ```
   npm install node-telegram-bot-api ws
   ```
4. 复制 `config.example.js` 文件为 `config.js`：
   ```
   cp config.example.js config.js
   ```
   或在Windows系统中：
   ```
   copy config.example.js config.js
   ```
5. 编辑 `config.js` 文件，将 `YOUR_TELEGRAM_BOT_TOKEN_HERE` 替换为您的 Telegram Bot Token
   (可以通过 Telegram 的 [@BotFather](https://t.me/BotFather) 获取)
6. 启动服务器：
   ```
   node server.js
   ```

### 连接配置

1. 在 SillyTavern 中，进入 "Extensions" 标签页
2. 找到 "Telegram Connector" 部分
3. 在 "Bridge 服务器 WebSocket URL" 字段中输入 WebSocket 服务器地址
   (默认为 `ws://127.0.0.1:2333`)
4. 点击 "连接" 按钮
5. 状态显示 "已连接" 后，即可开始使用

### Telegram 使用方法

1. 在 Telegram 中，搜索并开始与您创建的机器人对话
2. 发送任何消息开始聊天
3. 您的消息将被发送到 SillyTavern，AI 的回复会自动发送回 Telegram
4. 使用 `/help` 命令查看所有可用命令

## 系统要求

- Node.js 14.0 或更高版本
- 运行中的 SillyTavern 实例
- 互联网连接（用于 Telegram API）
- 如果服务器在公网访问，建议使用 HTTPS/WSS

## 故障排除

- **连接问题**：确保 WebSocket 服务器正在运行，并且 URL 配置正确
- **Bot 无响应**：检查 Telegram Bot Token 是否正确，以及服务器日志中是否有错误
- **消息不同步**：确保 SillyTavern 扩展已连接到 WebSocket 服务器

## 支持和贡献

如果您遇到问题或有改进建议，请通过以下方式联系：

- 创建 GitHub Issue
- 联系作者：ZMou
- 访问作者主页：https://zmoutech.cn

欢迎提交 Pull Request 来改进此扩展！

## 许可证

本项目采用 GNU General Public License v3.0 (GPL-3.0) 许可证 - 详情请参阅 LICENSE 文件

## TODO

- **群聊功能增强**：
  - [ ] 响应群聊中@bot的消息

- **媒体支持**：
  - [ ] 支持发送图片

- **消息格式**：
  - [x] 实现markdown转义
  - [x] Bot信息解析方式改为HTML（支持 HTML/MarkdownV2/纯文本 三种模式）

- **架构优化**：
  - [x] 命令改为server处理，前端不再参与命令解析
  - [x] Docker 容器化部署支持
  - [ ] 将server转换为标准服务端插件，遵循[SillyTavern服务端插件规范](https://docs.sillytavern.app/for-contributors/server-plugins/)

- **用户体验改进**：
  - [x] 调整编辑消息的频率
  - [x] 流式传输优化：生成足够字数后再显示初始信息
  - [x] "输入中"状态持续整个流式响应过程
  - [x] 新增`/ping`命令，让用户随时查询Bridge连接状态和SillyTavern状态

- **设置菜单**：
  - [ ] 扩展设置页新增白名单设置
  - [ ] 控制当角色切换等网页活动时是否向Telegram发送通知

- **错误处理与稳定性**：
  - [ ] `/exit`命令总是"退出操作超时，强制退出进程"
  - [x] 处理ST中"停止生成"按钮点击事件（GENERATION_STOPPED而非GENERATION_ENDED）
  - [x] 处理正在生成时发送新消息的情况（拦截并提示用户正在生成中，不提交到ST）
  - [x] 在`/switchchar`或`/switchchat`命令后通知server清空旧缓存状态

- **技术优化**：
  - [x] 实现WebSocket心跳检测浏览器存活（30秒心跳，45秒超时，自动重连）
  - [ ] 优化setTimeout等待DOM更新的处理方式

## 最近更新

### v1.1.0 新增功能

- **WebSocket 心跳检测**：服务端每30秒发送心跳包，客户端45秒超时自动重连，最多重试3次
- **Docker 部署支持**：提供 Dockerfile 和 docker-compose.yml，支持一键容器化部署
- **消息格式化**：支持 HTML/MarkdownV2/纯文本 三种输出格式，可在配置文件中切换
- **流式输出优化**：
  - 累计超过50字符后才显示初始消息
  - 持续显示"输入中"状态直到生成完成
  - 消息更新频率限制为每2秒一次
- **生成中消息拦截**：AI生成回复时，新消息会被拦截并提示用户等待
- **会话状态清理**：角色/聊天切换时自动清理旧的流式会话缓存