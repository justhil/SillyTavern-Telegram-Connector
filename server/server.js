// server.js
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const MessageFormatter = require('./messageFormatter');

// Telegram 消息长度限制
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * 将长消息分割成多个部分，确保每部分不超过 Telegram 限制
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度，默认 4096
 * @returns {string[]} - 分割后的消息数组
 */
function splitLongMessage(text, maxLength = TELEGRAM_MAX_LENGTH) {
    if (!text || text.length <= maxLength) {
        return [text];
    }

    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            parts.push(remaining);
            break;
        }

        // 尝试在换行符处分割
        let splitIndex = remaining.lastIndexOf('\n', maxLength);

        // 如果没有找到换行符，尝试在空格处分割
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = remaining.lastIndexOf(' ', maxLength);
        }

        // 如果还是没找到，强制在 maxLength 处分割
        if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
            splitIndex = maxLength;
        }

        parts.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex).trimStart();
    }

    // 添加分页标记
    if (parts.length > 1) {
        parts.forEach((part, index) => {
            parts[index] = `📄 [${index + 1}/${parts.length}]\n\n${part}`;
        });
    }

    return parts;
}

/**
 * 发送消息到 Telegram，自动处理超长消息
 * @param {TelegramBot} bot - Telegram Bot 实例
 * @param {number} chatId - 聊天 ID
 * @param {string} text - 消息文本
 * @param {object} options - 发送选项
 */
async function sendLongMessage(bot, chatId, text, options = {}) {
    const parts = splitLongMessage(text);

    for (let i = 0; i < parts.length; i++) {
        try {
            await bot.sendMessage(chatId, parts[i], options);
            // 如果有多条消息，稍微延迟避免触发限流
            if (parts.length > 1 && i < parts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (err) {
            logWithTimestamp('error', `发送消息第${i + 1}/${parts.length}部分失败:`, err.message);
            // 如果格式化消息发送失败，尝试纯文本
            if (options.parse_mode) {
                try {
                    await bot.sendMessage(chatId, parts[i]);
                } catch (fallbackErr) {
                    logWithTimestamp('error', '回退到纯文本也失败:', fallbackErr.message);
                }
            }
        }
    }
}

// 添加日志记录函数，带有时间戳
function logWithTimestamp(level, ...args) {
    const now = new Date();

    // 使用本地时区格式化时间
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const prefix = `[${timestamp}]`;

    switch (level) {
        case 'error':
            console.error(prefix, ...args);
            break;
        case 'warn':
            console.warn(prefix, ...args);
            break;
        default:
            console.log(prefix, ...args);
    }
}

// 重启保护 - 防止循环重启
const RESTART_PROTECTION_FILE = path.join(__dirname, '.restart_protection');
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 60000; // 1分钟

// 检查是否可能处于循环重启状态
function checkRestartProtection() {
    try {
        if (fs.existsSync(RESTART_PROTECTION_FILE)) {
            const data = JSON.parse(fs.readFileSync(RESTART_PROTECTION_FILE, 'utf8'));
            const now = Date.now();

            // 清理过期的重启记录
            data.restarts = data.restarts.filter(time => now - time < RESTART_WINDOW_MS);

            // 添加当前重启时间
            data.restarts.push(now);

            // 如果在时间窗口内重启次数过多，则退出
            if (data.restarts.length > MAX_RESTARTS) {
                logWithTimestamp('error', `检测到可能的循环重启！在${RESTART_WINDOW_MS / 1000}秒内重启了${data.restarts.length}次。`);
                logWithTimestamp('error', '为防止资源耗尽，服务器将退出。请手动检查并修复问题后再启动。');

                // 如果有通知chatId，尝试发送错误消息
                if (process.env.RESTART_NOTIFY_CHATID) {
                    const chatId = parseInt(process.env.RESTART_NOTIFY_CHATID);
                    if (!isNaN(chatId)) {
                        // 创建临时bot发送错误消息
                        try {
                            const tempBot = new TelegramBot(require('./config').telegramToken, { polling: false });
                            tempBot.sendMessage(chatId, '检测到循环重启！服务器已停止以防止资源耗尽。请手动检查问题。')
                                .finally(() => process.exit(1));
                        } catch (e) {
                            process.exit(1);
                        }
                        return; // 等待消息发送后退出
                    }
                }

                process.exit(1);
            }

            // 保存更新后的重启记录
            fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify(data));
        } else {
            // 创建新的重启保护文件
            fs.writeFileSync(RESTART_PROTECTION_FILE, JSON.stringify({ restarts: [Date.now()] }));
        }
    } catch (error) {
        logWithTimestamp('error', '重启保护检查失败:', error);
        // 出错时继续执行，不要阻止服务器启动
    }
}

// 启动时检查重启保护
checkRestartProtection();

// --- 配置加载 ---
// 支持环境变量配置 (Docker) 和配置文件配置

// 检查配置文件是否存在
const configPath = path.join(__dirname, './config.js');
let config = {};

// 如果配置文件存在，加载它作为基础配置
if (fs.existsSync(configPath)) {
    config = require('./config');
} else if (!process.env.TELEGRAM_BOT_TOKEN) {
    // 如果既没有配置文件也没有环境变量，则报错
    logWithTimestamp('error', '错误: 找不到配置文件 config.js 且未设置 TELEGRAM_BOT_TOKEN 环境变量！');
    logWithTimestamp('error', '请在server目录下复制 config.example.js 为 config.js，或设置 TELEGRAM_BOT_TOKEN 环境变量');
    process.exit(1); // 终止程序
}

// 环境变量优先级高于配置文件 (Requirements 2.3, 2.4)
// 读取 TELEGRAM_BOT_TOKEN 环境变量
const token = process.env.TELEGRAM_BOT_TOKEN || config.telegramToken;

// 读取 WSS_PORT 环境变量
const wssPort = parseInt(process.env.WSS_PORT) || config.wssPort || 2333;

// 读取 ALLOWED_USER_IDS 环境变量 (逗号分隔的用户ID列表)
if (process.env.ALLOWED_USER_IDS) {
    const envUserIds = process.env.ALLOWED_USER_IDS
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));
    if (envUserIds.length > 0) {
        config.allowedUserIds = envUserIds;
    }
}

// 读取 MESSAGE_PARSE_MODE 环境变量
if (process.env.MESSAGE_PARSE_MODE) {
    const parseMode = process.env.MESSAGE_PARSE_MODE.trim();
    config.messageFormat = config.messageFormat || {};
    if (parseMode === 'HTML' || parseMode === 'MarkdownV2') {
        config.messageFormat.parseMode = parseMode;
    } else if (parseMode === 'plain' || parseMode === '') {
        config.messageFormat.parseMode = null;
    }
}

// 检查是否修改了默认token
if (!token || token === 'TOKEN' || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    logWithTimestamp('error', '错误: 请设置有效的 Telegram Bot Token！');
    logWithTimestamp('error', '可以通过环境变量 TELEGRAM_BOT_TOKEN 或在 config.js 中设置 telegramToken');
    process.exit(1); // 终止程序
}

// 初始化Telegram Bot，但不立即启动轮询
const bot = new TelegramBot(token, { polling: false });
logWithTimestamp('log', '正在初始化Telegram Bot...');

// 手动清除所有未处理的消息，然后启动轮询
(async function clearAndStartPolling() {
    try {
        logWithTimestamp('log', '正在清除Telegram消息队列...');

        // 检查是否是重启，如果是则使用更彻底的清除方式
        const isRestart = process.env.TELEGRAM_CLEAR_UPDATES === '1';
        if (isRestart) {
            logWithTimestamp('log', '检测到重启标记，将执行更彻底的消息队列清理...');
            // 获取更新并丢弃所有消息
            let updates;
            let lastUpdateId = 0;

            // 循环获取所有更新直到没有更多更新
            do {
                updates = await bot.getUpdates({
                    offset: lastUpdateId,
                    limit: 100,
                    timeout: 0
                });

                if (updates && updates.length > 0) {
                    lastUpdateId = updates[updates.length - 1].update_id + 1;
                    logWithTimestamp('log', `清理了 ${updates.length} 条消息，当前offset: ${lastUpdateId}`);
                }
            } while (updates && updates.length > 0);

            // 清除环境变量
            delete process.env.TELEGRAM_CLEAR_UPDATES;
            logWithTimestamp('log', '消息队列清理完成');
        } else {
            // 普通启动时的清理
            const updates = await bot.getUpdates({ limit: 100, timeout: 0 });
            if (updates && updates.length > 0) {
                // 如果有更新，获取最后一个更新的ID并设置offset为它+1
                const lastUpdateId = updates[updates.length - 1].update_id;
                await bot.getUpdates({ offset: lastUpdateId + 1, limit: 1, timeout: 0 });
                logWithTimestamp('log', `已清除 ${updates.length} 条待处理消息`);
            } else {
                logWithTimestamp('log', '没有待处理消息需要清除');
            }
        }

        // 启动轮询
        bot.startPolling({
            restart: true,
            clean: true
        });
        logWithTimestamp('log', 'Telegram Bot轮询已启动');
    } catch (error) {
        logWithTimestamp('error', '清除消息队列或启动轮询时出错:', error);
        // 如果清除失败，仍然尝试启动轮询
        bot.startPolling({ restart: true, clean: true });
        logWithTimestamp('log', 'Telegram Bot轮询已启动（清除队列失败后）');
    }
})();

// 初始化WebSocket服务器
const wss = new WebSocket.Server({ port: wssPort });
logWithTimestamp('log', `WebSocket服务器正在监听端口 ${wssPort}...`);

let sillyTavernClient = null; // 用于存储连接的SillyTavern扩展客户端

// 心跳定时器
let heartbeatInterval = null;

// 心跳配置
const HEARTBEAT_INTERVAL = config.heartbeat?.interval || 30000; // 30秒

// 用于存储正在进行的流式会话，调整会话结构，使用Promise来处理messageId
// 结构: { messagePromise: Promise<number> | null, lastText: String, timer: NodeJS.Timeout | null, isEditing: boolean, typingInterval: NodeJS.Timeout | null, charCount: number }
const ongoingStreams = new Map();

// 流式输出配置
const TYPING_INTERVAL = 4000; // 每4秒发送一次typing状态
const MIN_CHARS_BEFORE_DISPLAY = config.streaming?.minCharsBeforeDisplay || 50; // 最小显示字符数

// --- 心跳管理函数 ---
/**
 * 启动心跳检测，每30秒发送心跳消息到客户端
 * @param {WebSocket} ws - WebSocket连接实例
 */
function startHeartbeat(ws) {
    // 先清理可能存在的旧定时器
    stopHeartbeat();

    logWithTimestamp('log', `启动心跳检测，间隔: ${HEARTBEAT_INTERVAL}ms`);

    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const heartbeatMessage = {
                type: 'heartbeat',
                timestamp: Date.now()
            };
            ws.send(JSON.stringify(heartbeatMessage));
            logWithTimestamp('log', '发送心跳包');
        } else {
            // 连接已关闭，停止心跳
            stopHeartbeat();
        }
    }, HEARTBEAT_INTERVAL);
}

/**
 * 停止心跳检测，清理定时器
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        logWithTimestamp('log', '心跳检测已停止');
    }
}

/**
 * 启动持续"输入中"状态，每4秒发送一次typing状态
 * @param {number} chatId - Telegram聊天ID
 * @returns {NodeJS.Timeout} - 定时器ID
 */
function startTypingInterval(chatId) {
    // 立即发送一次typing状态
    bot.sendChatAction(chatId, 'typing').catch(error =>
        logWithTimestamp('error', '发送"输入中"状态失败:', error));

    // 每4秒发送一次typing状态
    return setInterval(() => {
        bot.sendChatAction(chatId, 'typing').catch(error =>
            logWithTimestamp('error', '发送"输入中"状态失败:', error));
    }, TYPING_INTERVAL);
}

/**
 * 停止"输入中"状态定时器
 * @param {NodeJS.Timeout} interval - 定时器ID
 */
function stopTypingInterval(interval) {
    if (interval) {
        clearInterval(interval);
    }
}

// 重载服务器函数
function reloadServer(chatId) {
    logWithTimestamp('log', '重载服务器端组件...');
    Object.keys(require.cache).forEach(function (key) {
        if (key.indexOf('node_modules') === -1) {
            delete require.cache[key];
        }
    });
    try {
        delete require.cache[require.resolve('./config.js')];
        const newConfig = require('./config.js');
        Object.assign(config, newConfig);
        logWithTimestamp('log', '配置文件已重新加载');
    } catch (error) {
        logWithTimestamp('error', '重新加载配置文件时出错:', error);
        if (chatId) bot.sendMessage(chatId, '重新加载配置文件时出错: ' + error.message);
        return;
    }
    logWithTimestamp('log', '服务器端组件已重载');
    if (chatId) bot.sendMessage(chatId, '服务器端组件已成功重载。');
}

// 重启服务器函数
function restartServer(chatId) {
    logWithTimestamp('log', '重启服务器端组件...');

    // 首先停止Telegram Bot轮询
    bot.stopPolling().then(() => {
        logWithTimestamp('log', 'Telegram Bot轮询已停止');

        // 然后关闭WebSocket服务器
        if (wss) {
            wss.close(() => {
                logWithTimestamp('log', 'WebSocket服务器已关闭，准备重启...');
                setTimeout(() => {
                    const { spawn } = require('child_process');
                    const serverPath = path.join(__dirname, 'server.js');
                    logWithTimestamp('log', `重启服务器: ${serverPath}`);
                    const cleanEnv = {
                        PATH: process.env.PATH,
                        NODE_PATH: process.env.NODE_PATH,
                        TELEGRAM_CLEAR_UPDATES: '1' // 添加标记，表示这是一次重启
                    };
                    if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                    const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                    child.unref();
                    process.exit(0);
                }, 1000);
            });
        } else {
            // 如果没有WebSocket服务器，直接重启
            setTimeout(() => {
                const { spawn } = require('child_process');
                const serverPath = path.join(__dirname, 'server.js');
                logWithTimestamp('log', `重启服务器: ${serverPath}`);
                const cleanEnv = {
                    PATH: process.env.PATH,
                    NODE_PATH: process.env.NODE_PATH,
                    TELEGRAM_CLEAR_UPDATES: '1' // 添加标记，表示这是一次重启
                };
                if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                child.unref();
                process.exit(0);
            }, 1000);
        }
    }).catch(err => {
        logWithTimestamp('error', '停止Telegram Bot轮询时出错:', err);
        // 即使出错也继续重启过程
        if (wss) {
            wss.close(() => {
                // 重启代码...
                setTimeout(() => {
                    const { spawn } = require('child_process');
                    const serverPath = path.join(__dirname, 'server.js');
                    logWithTimestamp('log', `重启服务器: ${serverPath}`);
                    const cleanEnv = {
                        PATH: process.env.PATH,
                        NODE_PATH: process.env.NODE_PATH,
                        TELEGRAM_CLEAR_UPDATES: '1' // 添加标记，表示这是一次重启
                    };
                    if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                    const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                    child.unref();
                    process.exit(0);
                }, 1000);
            });
        } else {
            // 如果没有WebSocket服务器，直接重启
            setTimeout(() => {
                const { spawn } = require('child_process');
                const serverPath = path.join(__dirname, 'server.js');
                logWithTimestamp('log', `重启服务器: ${serverPath}`);
                const cleanEnv = {
                    PATH: process.env.PATH,
                    NODE_PATH: process.env.NODE_PATH,
                    TELEGRAM_CLEAR_UPDATES: '1' // 添加标记，表示这是一次重启
                };
                if (chatId) cleanEnv.RESTART_NOTIFY_CHATID = chatId.toString();
                const child = spawn(process.execPath, [serverPath], { detached: true, stdio: 'inherit', env: cleanEnv });
                child.unref();
                process.exit(0);
            }, 1000);
        }
    });
}

// 退出服务器函数
function exitServer() {
    logWithTimestamp('log', '正在关闭服务器...');
    const forceExitTimeout = setTimeout(() => {
        logWithTimestamp('error', '退出操作超时，强制退出进程');
        process.exit(1);
    }, 10000);
    try {
        if (fs.existsSync(RESTART_PROTECTION_FILE)) {
            fs.unlinkSync(RESTART_PROTECTION_FILE);
            logWithTimestamp('log', '已清理重启保护文件');
        }
    } catch (error) {
        logWithTimestamp('error', '清理重启保护文件失败:', error);
    }
    const finalExit = () => {
        clearTimeout(forceExitTimeout);
        logWithTimestamp('log', '服务器端组件已成功关闭');
        process.exit(0);
    };
    if (wss) {
        wss.close(() => {
            logWithTimestamp('log', 'WebSocket服务器已关闭');
            bot.stopPolling().finally(finalExit);
        });
    } else {
        bot.stopPolling().finally(finalExit);
    }
}

function handleSystemCommand(command, chatId) {
    logWithTimestamp('log', `执行系统命令: ${command}`);

    // 处理 ping 命令 - 返回连接状态信息
    if (command === 'ping') {
        const bridgeStatus = 'Bridge状态：已连接 ✅';
        const stStatus = sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN ?
            'SillyTavern状态：已连接 ✅' :
            'SillyTavern状态：未连接 ❌';
        bot.sendMessage(chatId, `${bridgeStatus}\n${stStatus}`);
        return;
    }

    let responseMessage = '';
    switch (command) {
        case 'reload':
            responseMessage = '正在重载服务器端组件...';
            // 如果SillyTavern已连接，则执行刷新UI
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // 如果未连接，直接重载服务器
                bot.sendMessage(chatId, responseMessage);
                reloadServer(chatId);
            }
            break;
        case 'restart':
            responseMessage = '正在重启服务器端组件...';
            // 如果SillyTavern已连接，则执行刷新UI
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // 如果未连接，直接重启服务器
                bot.sendMessage(chatId, responseMessage);
                restartServer(chatId);
            }
            break;
        case 'exit':
            responseMessage = '正在关闭服务器端组件...';
            // 如果SillyTavern已连接，则执行刷新UI
            if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
                sillyTavernClient.commandToExecuteOnClose = { command, chatId };
                sillyTavernClient.send(JSON.stringify({ type: 'system_command', command: 'reload_ui_only', chatId }));
            } else {
                // 如果未连接，直接退出服务器
                bot.sendMessage(chatId, responseMessage);
                exitServer();
            }
            break;
        default:
            logWithTimestamp('warn', `未知的系统命令: ${command}`);
            bot.sendMessage(chatId, `未知的系统命令: /${command}`);
            return;
    }

    // 只有在SillyTavern已连接的情况下，消息才会在上面的switch语句中发送
    // 所以这里只在SillyTavern已连接时发送响应消息
    if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
        bot.sendMessage(chatId, responseMessage);
    }
}

// 处理Telegram命令
async function handleTelegramCommand(command, args, chatId) {
    logWithTimestamp('log', `处理Telegram命令: /${command} ${args.join(' ')}`);

    // 显示"输入中"状态
    bot.sendChatAction(chatId, 'typing').catch(error =>
        logWithTimestamp('error', '发送"输入中"状态失败:', error));

    // 默认回复
    let replyText = `未知命令: /${command}。 使用 /help 查看所有命令。`;

    // 特殊处理help命令，无论SillyTavern是否连接都可以显示
    if (command === 'help') {
        replyText = `SillyTavern Telegram Bridge 命令：\n\n`;
        replyText += `聊天管理\n`;
        replyText += `/new - 开始与当前角色的新聊天。\n`;
        replyText += `/listchats - 列出当前角色的所有已保存的聊天记录。\n`;
        replyText += `/switchchat <chat_name> - 加载特定的聊天记录。\n`;
        replyText += `/switchchat_<序号> - 通过序号加载聊天记录。\n\n`;
        replyText += `角色管理\n`;
        replyText += `/listchars - 列出所有可用角色。\n`;
        replyText += `/switchchar <char_name> - 切换到指定角色。\n`;
        replyText += `/switchchar_<序号> - 通过序号切换角色。\n\n`;
        replyText += `系统管理\n`;
        replyText += `/reload - 重载插件的服务器端组件并刷新ST网页。\n`;
        replyText += `/restart - 刷新ST网页并重启插件的服务器端组件。\n`;
        replyText += `/exit - 退出插件的服务器端组件。\n`;
        replyText += `/ping - 检查连接状态。\n\n`;
        replyText += `帮助\n`;
        replyText += `/help - 显示此帮助信息。`;

        // 发送帮助信息并返回
        sendLongMessage(bot, chatId, replyText);
        return;
    }

    // 检查SillyTavern是否连接
    if (!sillyTavernClient || sillyTavernClient.readyState !== WebSocket.OPEN) {
        sendLongMessage(bot, chatId, 'SillyTavern未连接，无法执行角色和聊天相关命令。请先确保SillyTavern已打开并启用了Telegram扩展。');
        return;
    }

    // 根据命令类型处理
    switch (command) {
        case 'new':
            // 发送命令到前端执行
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'new',
                chatId: chatId
            }));
            return; // 前端会发送响应，所以这里直接返回
        case 'listchars':
            // 发送命令到前端执行（传递页码参数）
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'listchars',
                args: args,
                chatId: chatId
            }));
            return;
        case 'switchchar':
            if (args.length === 0) {
                replyText = '请提供角色名称或序号。用法: /switchchar <角色名称> 或 /switchchar_数字';
            } else {
                // 发送命令到前端执行
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: 'switchchar',
                    args: args,
                    chatId: chatId
                }));
                return;
            }
            break;
        case 'listchats':
            // 发送命令到前端执行（传递页码参数）
            sillyTavernClient.send(JSON.stringify({
                type: 'execute_command',
                command: 'listchats',
                args: args,
                chatId: chatId
            }));
            return;
        case 'switchchat':
            if (args.length === 0) {
                replyText = '请提供聊天记录名称。用法： /switchchat <聊天记录名称>';
            } else {
                // 发送命令到前端执行
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: 'switchchat',
                    args: args,
                    chatId: chatId
                }));
                return;
            }
            break;
        default:
            // 处理特殊格式的命令，如 switchchar_1, switchchat_2 等
            const charMatch = command.match(/^switchchar_(\d+)$/);
            if (charMatch) {
                // 发送命令到前端执行
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: command, // 保持原始命令格式
                    chatId: chatId
                }));
                return;
            }

            const chatMatch = command.match(/^switchchat_(\d+)$/);
            if (chatMatch) {
                // 发送命令到前端执行
                sillyTavernClient.send(JSON.stringify({
                    type: 'execute_command',
                    command: command, // 保持原始命令格式
                    chatId: chatId
                }));
                return;
            }
    }

    // 发送回复（支持超长消息分割）
    sendLongMessage(bot, chatId, replyText);
}

// --- WebSocket服务器逻辑 ---
wss.on('connection', ws => {
    logWithTimestamp('log', 'SillyTavern扩展已连接！');
    sillyTavernClient = ws;

    // 启动心跳检测
    startHeartbeat(ws);

    ws.on('message', async (message) => { // 将整个回调设为async
        let data; // 在 try 块外部声明 data
        try {
            data = JSON.parse(message);

            // --- 处理心跳响应 ---
            if (data.type === 'heartbeat_ack') {
                logWithTimestamp('log', '收到心跳响应');
                return;
            }

            // --- 处理流式文本块 ---
            if (data.type === 'stream_chunk' && data.chatId) {
                logWithTimestamp('log', `收到流式文本块，ChatID: ${data.chatId}, 长度: ${data.text?.length || 0}`);
                let session = ongoingStreams.get(data.chatId);
                logWithTimestamp('log', `会话状态: ${session ? '已存在' : '不存在'}, 当前会话数: ${ongoingStreams.size}`);

                // 1. 如果会话不存在，立即同步创建一个占位会话
                if (!session) {
                    logWithTimestamp('log', `创建新会话，ChatID: ${data.chatId}`);

                    // 使用let声明，以便在Promise内部访问
                    let resolveMessagePromise;
                    const messagePromise = new Promise(resolve => {
                        resolveMessagePromise = resolve;
                    });

                    // 启动持续"输入中"状态 (Requirement 3.1)
                    const typingInterval = startTypingInterval(data.chatId);

                    session = {
                        messagePromise: messagePromise,
                        resolveMessagePromise: resolveMessagePromise, // 保存 resolve 函数
                        messageId: null, // 直接存储 messageId
                        lastText: data.text,
                        timer: null,
                        isEditing: false,
                        sendingInitial: false, // 标记是否正在发送初始消息
                        typingInterval: typingInterval,
                        charCount: data.text ? data.text.length : 0,
                    };
                    ongoingStreams.set(data.chatId, session);

                    // 只有当字符数超过阈值时才发送初始消息 (Requirement 3.2)
                    if (session.charCount >= MIN_CHARS_BEFORE_DISPLAY) {
                        session.sendingInitial = true;
                        logWithTimestamp('log', `字符数 ${session.charCount} 超过阈值，发送初始消息...`);
                        // 截断过长的文本，避免超过 Telegram 限制
                        const displayText = data.text.length > 4000 ? data.text.substring(0, 4000) + '...' : data.text + ' ...';
                        bot.sendMessage(data.chatId, displayText)
                            .then(sentMessage => {
                                logWithTimestamp('log', `初始消息发送成功，messageId: ${sentMessage.message_id}`);
                                session.messageId = sentMessage.message_id;
                                resolveMessagePromise(sentMessage.message_id);
                            }).catch(err => {
                                logWithTimestamp('error', '发送初始Telegram消息失败:', err.message);
                                session.sendingInitial = false;
                                stopTypingInterval(session.typingInterval);
                                ongoingStreams.delete(data.chatId);
                            });
                    }
                } else {
                    // 2. 如果会话存在，更新最新文本和字符计数
                    session.lastText = data.text;
                    session.charCount = data.text ? data.text.length : 0;

                    // 检查是否达到字符阈值且尚未发送初始消息
                    if (!session.messageId && session.charCount >= MIN_CHARS_BEFORE_DISPLAY && !session.sendingInitial) {
                        // 标记正在发送初始消息，避免重复发送
                        session.sendingInitial = true;
                        logWithTimestamp('log', `会话已存在，字符数 ${session.charCount} 超过阈值，发送初始消息...`);

                        // 截断过长的文本
                        const displayText = data.text.length > 4000 ? data.text.substring(0, 4000) + '...' : data.text + ' ...';
                        bot.sendMessage(data.chatId, displayText)
                            .then(sentMessage => {
                                logWithTimestamp('log', `初始消息发送成功，messageId: ${sentMessage.message_id}`);
                                session.messageId = sentMessage.message_id;
                                if (session.resolveMessagePromise) {
                                    session.resolveMessagePromise(sentMessage.message_id);
                                }
                            }).catch(err => {
                                logWithTimestamp('error', '发送初始Telegram消息失败:', err.message);
                                session.sendingInitial = false;
                            });
                    }
                }

                // 3. 尝试触发一次编辑（节流保护）
                // 使用 session.messageId 直接检查
                if (session.messageId && !session.isEditing && !session.timer) {
                    session.timer = setTimeout(() => {
                        const currentSession = ongoingStreams.get(data.chatId);
                        if (currentSession && currentSession.messageId) {
                            currentSession.isEditing = true;
                            // 截断过长的文本
                            const editText = currentSession.lastText.length > 4000
                                ? currentSession.lastText.substring(0, 4000) + '...'
                                : currentSession.lastText + ' ...';
                            bot.editMessageText(editText, {
                                chat_id: data.chatId,
                                message_id: currentSession.messageId,
                            }).catch(err => {
                                if (!err.message.includes('message is not modified'))
                                    logWithTimestamp('error', '编辑Telegram消息失败:', err.message);
                            }).finally(() => {
                                if (ongoingStreams.has(data.chatId)) ongoingStreams.get(data.chatId).isEditing = false;
                            });
                        }
                        currentSession.timer = null;
                    }, 2000);
                }
                return;
            }

            // --- 处理流式结束信号 ---
            if (data.type === 'stream_end' && data.chatId) {
                const session = ongoingStreams.get(data.chatId);
                // 只有当存在会话时才处理，这表明确实是流式传输
                if (session) {
                    if (session.timer) {
                        clearTimeout(session.timer);
                    }
                    // 停止"输入中"状态 (Requirement 3.1)
                    stopTypingInterval(session.typingInterval);
                    session.typingInterval = null;
                    logWithTimestamp('log', `收到流式结束信号，等待最终渲染文本更新...`);
                    // 注意：我们不在这里清理会话，而是等待final_message_update
                }
                // 如果不存在会话但收到stream_end，这是一个异常情况
                // 可能是由于某些原因会话被提前清理了
                else {
                    logWithTimestamp('warn', `收到流式结束信号，但找不到对应的会话 ChatID ${data.chatId}`);
                    // 为安全起见，我们仍然发送消息，但这种情况不应该发生
                    await bot.sendMessage(data.chatId, data.text || "消息生成完成").catch(err => {
                        logWithTimestamp('error', '发送流式结束消息失败:', err.message);
                    });
                }
                return;
            }

// --- 处理最终渲染后的消息更新 ---
if (data.type === 'final_message_update' && data.chatId) {
    logWithTimestamp('log', `收到最终渲染文本，ChatID: ${data.chatId}, 长度: ${data.text?.length || 0}`);
    const session = ongoingStreams.get(data.chatId);

    // 格式化消息 (Requirement 3.4, 4.5, 6.2, 6.3, 6.4)
    const formatConfig = config.messageFormat || {};
    const formatted = MessageFormatter.format(data.text, formatConfig);

    // 如果会话存在，说明是流式传输的最终更新
    if (session) {
        // 停止"输入中"状态 (确保清理)
        stopTypingInterval(session.typingInterval);

        // 直接使用 session.messageId
        if (session.messageId) {
            logWithTimestamp('log', `收到流式最终渲染文本，更新消息 ${session.messageId}`);

            // 构建消息选项
            const messageOptions = {
                chat_id: data.chatId,
                message_id: session.messageId,
            };

            // 根据配置设置 parse_mode (Requirement 6.2, 6.3, 6.4)
            if (formatted.parseMode) {
                messageOptions.parse_mode = formatted.parseMode;
            }

            await bot.editMessageText(formatted.text, messageOptions).catch(async err => {
                if (!err.message.includes('message is not modified')) {
                    logWithTimestamp('error', '编辑最终格式化Telegram消息失败:', err.message);
                    // 格式化失败回退机制 (Requirement 4.5)
                    if (formatted.parseMode) {
                        logWithTimestamp('log', '尝试回退到纯文本模式...');
                        await bot.editMessageText(data.text, {
                            chat_id: data.chatId,
                            message_id: session.messageId,
                        }).catch(fallbackErr => {
                            logWithTimestamp('error', '回退到纯文本模式也失败:', fallbackErr.message);
                        });
                    }
                }
            });
            logWithTimestamp('log', `ChatID ${data.chatId} 的流式传输最终更新已发送。`);
        } else {
            // 如果没有messageId，说明字符数未达到阈值，直接发送新消息
            logWithTimestamp('log', `流式会话未发送初始消息，直接发送最终消息到 ChatID ${data.chatId}`);
            const sendOptions = {};
            if (formatted.parseMode) {
                sendOptions.parse_mode = formatted.parseMode;
            }
            // 使用支持超长消息的发送函数
            await sendLongMessage(bot, data.chatId, formatted.text, sendOptions);
        }
        // 清理流式会话
        ongoingStreams.delete(data.chatId);
        logWithTimestamp('log', `ChatID ${data.chatId} 的流式会话已完成并清理。`);
    }
    // 如果会话不存在，说明这是一个完整的非流式回复
    else {
        logWithTimestamp('log', `收到非流式完整回复，直接发送新消息到 ChatID ${data.chatId}`);
        const sendOptions = {};
        if (formatted.parseMode) {
            sendOptions.parse_mode = formatted.parseMode;
        }
        // 使用支持超长消息的发送函数
        await sendLongMessage(bot, data.chatId, formatted.text, sendOptions);
    }
    return;
}

// --- 其他消息处理逻辑 ---
if (data.type === 'error_message' && data.chatId) {
    logWithTimestamp('error', `收到SillyTavern的错误报告，将发送至Telegram用户 ${data.chatId}: ${data.text}`);
    await sendLongMessage(bot, data.chatId, data.text);
} else if (data.type === 'ai_reply' && data.chatId) {
    logWithTimestamp('log', `收到非流式AI回复，发送至Telegram用户 ${data.chatId}`);
    // 确保在发送消息前清理可能存在的流式会话
    if (ongoingStreams.has(data.chatId)) {
        logWithTimestamp('log', `清理 ChatID ${data.chatId} 的流式会话，因为收到了非流式回复`);
        ongoingStreams.delete(data.chatId);
    }
    // 发送非流式回复（支持超长消息分割）
    await sendLongMessage(bot, data.chatId, data.text);
} else if (data.type === 'typing_action' && data.chatId) {
    logWithTimestamp('log', `显示"输入中"状态给Telegram用户 ${data.chatId}`);
    bot.sendChatAction(data.chatId, 'typing').catch(error =>
        logWithTimestamp('error', '发送"输入中"状态失败:', error));
} else if (data.type === 'command_executed') {
    // 处理前端命令执行结果
    logWithTimestamp('log', `命令 ${data.command} 执行完成，结果: ${data.success ? '成功' : '失败'}`);
    if (data.message) {
        logWithTimestamp('log', `命令执行消息: ${data.message}`);
    }
} else if (data.type === 'cleanup_session' && data.chatId) {
    // 处理角色/聊天切换时的会话清理请求 (Requirement 5.4)
    logWithTimestamp('log', `收到会话清理请求，ChatID: ${data.chatId}`);
    const session = ongoingStreams.get(data.chatId);
    if (session) {
        // 清理定时器
        if (session.timer) {
            clearTimeout(session.timer);
        }
        // 停止"输入中"状态
        stopTypingInterval(session.typingInterval);
        // 删除会话
        ongoingStreams.delete(data.chatId);
        logWithTimestamp('log', `ChatID ${data.chatId} 的流式会话已被清理（角色/聊天切换）`);
    }
}
        } catch (error) {
    logWithTimestamp('error', '处理SillyTavern消息时出错:', error);
    // 确保即使在解析JSON失败时也能清理
    if (data && data.chatId) {
        ongoingStreams.delete(data.chatId);
    }
}
    });

ws.on('close', () => {
    logWithTimestamp('log', 'SillyTavern扩展已断开连接。');
    // 停止心跳检测
    stopHeartbeat();
    // 清理所有流式会话的typing定时器
    ongoingStreams.forEach((session) => {
        stopTypingInterval(session.typingInterval);
    });
    if (ws.commandToExecuteOnClose) {
        const { command, chatId } = ws.commandToExecuteOnClose;
        logWithTimestamp('log', `客户端断开连接，现在执行预定命令: ${command}`);
        if (command === 'reload') reloadServer(chatId);
        if (command === 'restart') restartServer(chatId);
        if (command === 'exit') exitServer(chatId);
    }
    sillyTavernClient = null;
    ongoingStreams.clear();
});

ws.on('error', (error) => {
    logWithTimestamp('error', 'WebSocket发生错误:', error);
    // 停止心跳检测
    stopHeartbeat();
    // 清理所有流式会话的typing定时器
    ongoingStreams.forEach((session) => {
        stopTypingInterval(session.typingInterval);
    });
    if (sillyTavernClient) {
        sillyTavernClient.commandToExecuteOnClose = null; // 清除标记，防止意外执行
    }
    sillyTavernClient = null;
    ongoingStreams.clear();
});
});

// 检查是否需要发送重启完成通知
if (process.env.RESTART_NOTIFY_CHATID) {
    const chatId = parseInt(process.env.RESTART_NOTIFY_CHATID);
    if (!isNaN(chatId)) {
        setTimeout(() => {
            bot.sendMessage(chatId, '服务器端组件已成功重启并准备就绪')
                .catch(err => logWithTimestamp('error', '发送重启通知失败:', err))
                .finally(() => {
                    delete process.env.RESTART_NOTIFY_CHATID;
                });
        }, 2000);
    }
}

// 监听Telegram消息
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from.id;
    const username = msg.from.username || 'N/A';

    // 检查白名单是否已配置且不为空
    if (config.allowedUserIds && config.allowedUserIds.length > 0) {
        // 如果当前用户的ID不在白名单中
        if (!config.allowedUserIds.includes(userId)) {
            logWithTimestamp('log', `拒绝了来自非白名单用户的访问：\n  - User ID: ${userId}\n  - Username: @${username}\n  - Chat ID: ${chatId}\n  - Message: "${text}"`);
            // 向该用户发送一条拒绝消息
            bot.sendMessage(chatId, '抱歉，您无权使用此机器人。').catch(err => {
                logWithTimestamp('error', `向 ${chatId} 发送拒绝消息失败:`, err.message);
            });
            // 终止后续处理
            return;
        }
    }

    if (!text) return;

    if (text.startsWith('/')) {
        const parts = text.slice(1).trim().split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // 系统命令由服务器直接处理
        if (['reload', 'restart', 'exit', 'ping'].includes(command)) {
            handleSystemCommand(command, chatId);
            return;
        }

        // 其他命令也由服务器处理，但可能需要前端执行
        handleTelegramCommand(command, args, chatId);
        return;
    }

    // 处理普通消息
    if (sillyTavernClient && sillyTavernClient.readyState === WebSocket.OPEN) {
        logWithTimestamp('log', `从Telegram用户 ${chatId} 收到消息: "${text}"`);
        const payload = JSON.stringify({ type: 'user_message', chatId, text });
        sillyTavernClient.send(payload);
    } else {
        logWithTimestamp('warn', '收到Telegram消息，但SillyTavern扩展未连接。');
        bot.sendMessage(chatId, '抱歉，我现在无法连接到SillyTavern。请确保SillyTavern已打开并启用了Telegram扩展。');
    }
});