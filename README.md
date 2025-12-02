# SillyTavern Telegram Connector

通过 Telegram 与 SillyTavern AI 角色聊天的桥接扩展。

[![License](https://img.shields.io/github/license/justhil/SillyTavern-Telegram-Connector)](LICENSE)

## 功能

- 📱 通过 Telegram 与 AI 角色实时对话
- 🔄 流式输出，实时显示 AI 回复
- 📋 内联按钮菜单，快速操作
- 🐳 Docker 一键部署
- 💓 WebSocket 心跳检测，自动重连

## 快速开始

### 1. 安装扩展

在 SillyTavern 中：Extensions → Install Extension → 输入'''https://github.com/justhil/SillyTavern-Telegram-Connector'''

### 2. 部署服务器

#### Docker 部署（推荐）

```bash
cd server

# 创建 configjs 文件
参考config.example.js

# 启动
docker-compose up -d
```

#### 手动部署

```bash
cd server
npm install
cp config.example.js config.js
# 编辑 config.js，填入 Bot Token
node server.js
```

### 3. 连接

1. SillyTavern → Extensions → Telegram Connector
2. 填入 Bridge URL：`ws://服务器IP:2333` 或 `wss://域名/tg-bridge`
3. 点击连接

## 命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示菜单按钮 |
| `/listchars` | 角色列表（分页） |
| `/listchats` | 聊天记录（分页） |
| `/switchchar_数字` | 切换角色 |
| `/switchchat_数字` | 切换聊天 |
| `/new` | 新建聊天 |
| `/ping` | 连接状态 |

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TELEGRAM_BOT_TOKEN` | Bot Token | 必填 |
| `WSS_PORT` | WebSocket 端口 | 2333 |
| `ALLOWED_USER_IDS` | 白名单（逗号分隔） | 空 |

* 关于渲染
当前版本检测到前端部分会直接停止输出，tg没法渲染而且太长了分页体验也不好。

## 许可证

GPL-3.0
