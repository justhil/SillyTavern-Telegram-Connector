# Implementation Plan

- [x] 1. 创建消息格式化模块






  - [x] 1.1 创建 `server/messageFormatter.js` 文件

    - 实现 `escapeHtml()` 函数，转义 HTML 特殊字符 (`<`, `>`, `&`, `"`)
    - 实现 `escapeMarkdownV2()` 函数，转义 MarkdownV2 特殊字符
    - 实现 `format()` 主函数，根据配置选择格式化模式
    - 处理粗体 `**text**` → `<b>text</b>` 转换
    - 处理斜体 `*text*` → `<i>text</i>` 转换
    - 处理代码块转换
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.2 更新 `server/config.example.js` 添加格式化配置


    - 添加 `messageFormat` 配置对象
    - 添加 `parseMode` 选项 (HTML/MarkdownV2/null)
    - 添加格式化开关选项
    - _Requirements: 6.1, 6.5_

- [x] 2. 实现 WebSocket 心跳检测机制





  - [x] 2.1 在 `server/server.js` 中添加心跳管理


    - 创建 `startHeartbeat()` 函数，每30秒发送心跳
    - 创建 `stopHeartbeat()` 函数，清理心跳定时器
    - 在 WebSocket 连接建立时启动心跳
    - 在连接关闭时停止心跳
    - _Requirements: 1.1_

  - [x] 2.2 在 `index.js` 中添加心跳响应和超时检测


    - 添加心跳消息处理逻辑
    - 实现45秒超时检测
    - 超时后标记连接断开
    - _Requirements: 1.2_


  - [x] 2.3 实现自动重连机制

    - 在 `index.js` 中添加重连逻辑
    - 实现5秒延迟重连
    - 最多重试3次
    - 更新状态栏显示重连状态
    - _Requirements: 1.3, 1.4_

- [x] 3. 优化 Telegram 流式输出





  - [x] 3.1 实现持续"输入中"状态


    - 在 `server/server.js` 的流式会话中添加 `typingInterval`
    - 每4秒发送一次 typing 状态
    - 生成完成后清理定时器
    - _Requirements: 3.1_

  - [x] 3.2 实现最小字符数显示阈值

    - 添加字符计数器到流式会话
    - 累计超过50字符后才发送初始消息
    - _Requirements: 3.2_

  - [x] 3.3 集成消息格式化到最终输出

    - 在 `final_message_update` 处理中调用 MessageFormatter
    - 根据配置设置 `parse_mode`
    - 实现格式化失败回退机制
    - _Requirements: 3.4, 4.5, 6.2, 6.3, 6.4_

- [x] 4. 优化前端消息处理





  - [x] 4.1 改进 DOM 文本提取逻辑


    - 优化 `handleFinalMessage()` 中的文本提取
    - 保留换行符和基本格式标记
    - 处理 HTML 实体解码
    - _Requirements: 5.1, 5.2_

  - [x] 4.2 实现生成中消息拦截


    - 添加 `isGenerating` 状态标志
    - 在生成过程中拦截新消息
    - 发送提示消息给用户
    - _Requirements: 5.3_


  - [x] 4.3 实现角色/聊天切换时的状态清理

    - 监听角色切换事件
    - 监听聊天切换事件
    - 发送清理消息到 Bridge_Server
    - _Requirements: 5.4_

- [x] 5. 创建 Docker 部署支持





  - [x] 5.1 创建 `server/Dockerfile`


    - 使用 node:18-alpine 基础镜像
    - 复制 package.json 并安装依赖
    - 复制服务器代码
    - 暴露 2333 端口
    - 设置启动命令
    - _Requirements: 2.1_


  - [x] 5.2 创建 `server/docker-compose.yml`

    - 定义 telegram-bridge 服务
    - 配置端口映射
    - 配置环境变量
    - 配置 volume 挂载
    - 设置重启策略
    - _Requirements: 2.2, 2.5_


  - [x] 5.3 更新 `server/server.js` 支持环境变量配置

    - 读取 `TELEGRAM_BOT_TOKEN` 环境变量
    - 读取 `WSS_PORT` 环境变量
    - 读取 `ALLOWED_USER_IDS` 环境变量
    - 读取 `MESSAGE_PARSE_MODE` 环境变量
    - _Requirements: 2.3, 2.4_


  - [x] 5.4 创建 `.dockerignore` 文件

    - 排除 node_modules
    - 排除 config.js (使用环境变量或挂载)
    - 排除开发文件
    - _Requirements: 2.1_


  - [x] 5.5 更新 `server/README.md` 添加 Docker 部署说明

    - 添加 Docker 构建命令
    - 添加 docker-compose 使用说明
    - 添加环境变量配置说明
    - _Requirements: 2.1, 2.2_

- [ ]* 6. 测试与文档
  - [ ]* 6.1 编写消息格式化单元测试
    - 测试 HTML 转义
    - 测试 Markdown 转义
    - 测试格式转换
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.2 更新主 README.md
    - 添加新功能说明
    - 更新 TODO 列表状态
    - 添加配置选项说明
    - _Requirements: 6.1, 6.5_
