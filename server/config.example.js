// config.example.js
// Telegram Bot配置示例
// 使用方法: 复制此文件为config.js，然后修改下面的配置

module.exports = {
    // 替换成你自己的Telegram Bot Token
    telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

    // WebSocket服务器端口
    wssPort: 2333,

    // 允许与机器人交互的Telegram用户ID白名单
    // 将你自己的Telegram User ID（以及其他你允许的用户的ID）添加到一个数组中。
    // 你可以通过与Telegram上的 @userinfobot 聊天来获取你的ID。
    // 如果留空数组 `[]`，则表示允许所有用户访问。
    // 示例: [123456789, 987654321]
    allowedUserIds: [],

    // 消息格式化配置
    // 用于控制发送到 Telegram 的消息格式
    messageFormat: {
        // 解析模式: 'HTML' | 'MarkdownV2' | null (纯文本)
        // HTML: 使用 HTML 标签格式化 (推荐，兼容性最好)
        // MarkdownV2: 使用 Telegram MarkdownV2 格式
        // null: 纯文本模式，不进行任何格式化
        parseMode: 'HTML',

        // 是否启用粗体格式 (**text** -> <b>text</b>)
        enableBold: true,

        // 是否启用斜体格式 (*text* -> <i>text</i>)
        enableItalic: true,

        // 是否启用代码块格式 (`code` -> <code>code</code>)
        enableCodeBlocks: true
    },

    // 心跳配置
    // 用于检测 WebSocket 连接状态
    heartbeat: {
        // 心跳发送间隔 (毫秒)
        interval: 30000,
        // 心跳超时时间 (毫秒)
        timeout: 45000
    },

    // 流式输出配置
    // 用于控制 Telegram 流式消息的显示行为
    streaming: {
        // 最小显示字符数：累计超过此字符数后才发送初始消息
        minCharsBeforeDisplay: 50,
        // 消息更新间隔 (毫秒)
        updateInterval: 2000
    }
};