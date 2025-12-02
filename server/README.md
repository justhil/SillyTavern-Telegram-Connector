# Telegram Bridge 服务器

这是 SillyTavern Telegram Connector 的服务器端组件，负责在 Telegram 机器人和 SillyTavern 扩展之间建立通信桥梁。

## 功能

- 接收来自 Telegram 用户的消息并转发到 SillyTavern
- 接收 SillyTavern 中 AI 的回复并转发回 Telegram
- 处理特殊命令，如角色切换、聊天管理等
- 维护 WebSocket 连接状态
- 支持 Docker 容器化部署

## 安装

### 方式一：传统安装

#### 前提条件

- Node.js 14.0 或更高版本
- 已创建的 Telegram 机器人和 Bot Token

#### 安装步骤

1. 安装依赖：
   ```bash
   npm install node-telegram-bot-api ws
   ```

2. 配置：
   - 复制 `config.example.js` 文件为 `config.js`：
   ```bash
   # Linux/macOS
   cp config.example.js config.js
   
   # Windows
   copy config.example.js config.js
   ```
   - 编辑 `config.js` 文件，将 `telegramToken` 替换为您的 Telegram Bot Token
   - 如需更改默认端口 (2333)，可修改 `wssPort` 参数

3. 启动服务器：
   ```bash
   node server.js
   ```

### 方式二：Docker 部署

#### 前提条件

- Docker 和 Docker Compose
- 已创建的 Telegram 机器人和 Bot Token

#### 使用 docker-compose (推荐)

1. 设置环境变量并启动：
   ```bash
   # 设置必需的环境变量
   export TELEGRAM_BOT_TOKEN=your_bot_token_here
   
   # 启动服务
   docker-compose up -d
   ```

2. 或者创建 `.env` 文件：
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   WSS_PORT=2333
   ALLOWED_USER_IDS=123456789,987654321
   MESSAGE_PARSE_MODE=HTML
   ```
   然后运行：
   ```bash
   docker-compose up -d
   ```

3. 查看日志：
   ```bash
   docker-compose logs -f
   ```

4. 停止服务：
   ```bash
   docker-compose down
   ```

#### 手动构建 Docker 镜像

1. 构建镜像：
   ```bash
   docker build -t st-telegram-bridge .
   ```

2. 运行容器：
   ```bash
   docker run -d \
     --name st-telegram-bridge \
     -p 2333:2333 \
     -e TELEGRAM_BOT_TOKEN=your_bot_token_here \
     -e MESSAGE_PARSE_MODE=HTML \
     --restart unless-stopped \
     st-telegram-bridge
   ```

#### Docker 环境变量说明

| 变量名 | 描述 | 默认值 | 必填 |
|--------|------|--------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - | 是 |
| `WSS_PORT` | WebSocket 服务端口 | 2333 | 否 |
| `ALLOWED_USER_IDS` | 允许的用户ID (逗号分隔) | 空 (允许所有) | 否 |
| `MESSAGE_PARSE_MODE` | 消息格式 (HTML/MarkdownV2/plain) | HTML | 否 |

#### 使用自定义配置文件

如果需要更多配置选项，可以挂载自定义配置文件：

```bash
docker run -d \
  --name st-telegram-bridge \
  -p 2333:2333 \
  -v $(pwd)/config.js:/app/config.js:ro \
  --restart unless-stopped \
  st-telegram-bridge
```

## 使用说明

服务器启动后，会在控制台显示以下信息：
- `Telegram Bot已启动...`
- `WebSocket服务器正在监听端口 XXXX...`

当 SillyTavern 扩展连接到服务器时，会显示：
- `SillyTavern扩展已连接！`

### 安全提示

- 默认配置下，服务器只接受本地连接。如需远程访问，请考虑以下安全措施：
  - 使用 HTTPS/WSS 加密连接
  - 实现适当的认证机制
  - 限制 IP 访问
  - 确保 `config.js` 文件不被公开（已在 .gitignore 中设置）

- 请勿将包含 Bot Token 的代码公开分享

## 故障排除

- **无法启动服务器**：检查端口是否被占用，Node.js 是否正确安装
- **找不到配置文件**：确保已复制 `config.example.js` 为 `config.js` 并放在正确位置
- **Telegram Bot 不响应**：验证 Bot Token 是否正确，检查 Telegram API 连接状态
- **WebSocket 连接失败**：确保防火墙未阻止指定端口，检查网络配置

## 开发者信息

如需修改或扩展服务器功能，主要文件是 `server.js`，其中包含：
- WebSocket 服务器设置
- Telegram Bot 初始化和消息处理
- 命令解析和处理逻辑

配置信息现在存储在项目根目录的 `config.js` 文件中，包括：
- Telegram Bot Token
- WebSocket 服务器端口