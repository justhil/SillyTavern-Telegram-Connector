// index.js

// 只解构 getContext() 返回的对象中确实存在的属性
const {
    extensionSettings,
    deleteLastMessage, // 导入删除最后一条消息的函数
    saveSettingsDebounced, // 导入保存设置的函数
} = SillyTavern.getContext();

// getContext 函数是全局 SillyTavern 对象的一部分，我们不需要从别处导入它
// 在需要时直接调用 SillyTavern.getContext() 即可

// 从 script.js 导入所有需要的公共API函数
import {
    eventSource,
    event_types,
    getPastCharacterChats,
    sendMessageAsUser,
    doNewChat,
    selectCharacterById,
    openCharacterChat,
    Generate,
    setExternalAbortController,
} from "../../../../script.js";

const MODULE_NAME = 'SillyTavern-Telegram-Connector';
const DEFAULT_SETTINGS = {
    bridgeUrl: 'ws://127.0.0.1:2333',
    autoConnect: true,
};

let ws = null; // WebSocket实例
let lastProcessedChatId = null; // 用于存储最后处理过的Telegram chatId

// 添加一个全局变量来跟踪当前是否处于流式模式
let isStreamingMode = false;

// 添加一个全局变量来跟踪当前是否正在生成回复
let isGenerating = false;

// 心跳超时检测相关变量
let heartbeatTimeoutTimer = null;
const HEARTBEAT_TIMEOUT = 45000; // 45秒超时
let lastHeartbeatTime = null;

// 自动重连相关变量
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 5000; // 5秒延迟
let reconnectTimer = null;
let isReconnecting = false;

// --- 工具函数 ---
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }
    return extensionSettings[MODULE_NAME];
}

function updateStatus(message, color) {
    const statusEl = document.getElementById('telegram_connection_status');
    if (statusEl) {
        statusEl.textContent = `状态： ${message}`;
        statusEl.style.color = color;
    }
}

/**
 * 重置心跳超时定时器
 * 每次收到心跳消息时调用，重新开始45秒倒计时
 */
function resetHeartbeatTimeout() {
    // 清除旧的超时定时器
    if (heartbeatTimeoutTimer) {
        clearTimeout(heartbeatTimeoutTimer);
    }
    
    lastHeartbeatTime = Date.now();
    
    // 设置新的超时定时器
    heartbeatTimeoutTimer = setTimeout(() => {
        console.log('[Telegram Bridge] 心跳超时，连接可能已断开');
        updateStatus('连接超时', 'red');
        // 标记连接断开并触发重连
        if (ws) {
            ws.close();
        }
    }, HEARTBEAT_TIMEOUT);
}

/**
 * 清除心跳超时定时器
 */
function clearHeartbeatTimeout() {
    if (heartbeatTimeoutTimer) {
        clearTimeout(heartbeatTimeoutTimer);
        heartbeatTimeoutTimer = null;
    }
    lastHeartbeatTime = null;
}

/**
 * 处理收到的心跳消息，发送心跳响应
 * @param {Object} data - 心跳消息数据
 */
function handleHeartbeat(data) {
    console.log('[Telegram Bridge] 收到心跳包');
    
    // 重置超时定时器
    resetHeartbeatTimeout();
    
    // 发送心跳响应
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'heartbeat_ack',
            timestamp: data.timestamp
        }));
    }
}

/**
 * 尝试自动重连
 * 最多重试3次，每次间隔5秒
 */
function attemptReconnect() {
    // 如果已经在重连中或达到最大重试次数，则不再尝试
    if (isReconnecting) {
        return;
    }
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[Telegram Bridge] 已达到最大重连次数，停止重连');
        updateStatus('重连失败', 'red');
        reconnectAttempts = 0;
        return;
    }
    
    isReconnecting = true;
    reconnectAttempts++;
    
    console.log(`[Telegram Bridge] 将在${RECONNECT_DELAY / 1000}秒后尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    updateStatus(`重连中... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, 'orange');
    
    // 清除可能存在的旧重连定时器
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    
    reconnectTimer = setTimeout(() => {
        isReconnecting = false;
        console.log(`[Telegram Bridge] 正在尝试第${reconnectAttempts}次重连...`);
        connect();
    }, RECONNECT_DELAY);
}

/**
 * 重置重连状态
 * 连接成功时调用
 */
function resetReconnectState() {
    reconnectAttempts = 0;
    isReconnecting = false;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

/**
 * 取消重连
 * 手动断开连接时调用
 */
function cancelReconnect() {
    resetReconnectState();
    console.log('[Telegram Bridge] 已取消自动重连');
}

function reloadPage() {
    window.location.reload();
}
// ---

// 连接到WebSocket服务器
function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('[Telegram Bridge] 已连接');
        return;
    }

    const settings = getSettings();
    if (!settings.bridgeUrl) {
        updateStatus('URL 未设置！', 'red');
        return;
    }

    updateStatus('连接中...', 'orange');
    console.log(`[Telegram Bridge] 正在连接 ${settings.bridgeUrl}...`);

    ws = new WebSocket(settings.bridgeUrl);

    ws.onopen = () => {
        console.log('[Telegram Bridge] 连接成功！');
        updateStatus('已连接', 'green');
        // 重置重连状态
        resetReconnectState();
        // 启动心跳超时检测
        resetHeartbeatTimeout();
    };

    ws.onmessage = async (event) => {
        let data;
        try {
            data = JSON.parse(event.data);

            // --- 心跳消息处理 ---
            if (data.type === 'heartbeat') {
                handleHeartbeat(data);
                return;
            }

            // --- 用户消息处理 ---
            if (data.type === 'user_message') {
                console.log('[Telegram Bridge] 收到用户消息。', data);

                // 检查是否正在生成回复，如果是则拦截消息
                if (isGenerating) {
                    console.log('[Telegram Bridge] 正在生成回复中，拦截新消息');
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'ai_reply',
                            chatId: data.chatId,
                            text: '⏳ AI正在生成回复中，请稍候...\n您的消息将在当前回复完成后处理。',
                        }));
                    }
                    return;
                }

                // 标记开始生成
                isGenerating = true;

                // 存储当前处理的chatId
                lastProcessedChatId = data.chatId;

                // 默认情况下，假设不是流式模式
                isStreamingMode = false;

                // 1. 立即向Telegram发送“输入中”状态（无论是否流式）
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }

                // 2. 将用户消息添加到SillyTavern
                await sendMessageAsUser(data.text);

                // 3. 设置流式传输的回调
                const streamCallback = (cumulativeText) => {
                    // 标记为流式模式
                    isStreamingMode = true;
                    // 将每个文本块通过WebSocket发送到服务端
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'stream_chunk',
                            chatId: data.chatId,
                            text: cumulativeText,
                        }));
                    }
                };
                eventSource.on(event_types.STREAM_TOKEN_RECEIVED, streamCallback);

                // 4. 定义一个清理函数
                const cleanup = () => {
                    eventSource.removeListener(event_types.STREAM_TOKEN_RECEIVED, streamCallback);
                    if (ws && ws.readyState === WebSocket.OPEN && isStreamingMode) {
                        // 仅在没有错误且确实处于流式模式时发送stream_end
                        if (!data.error) {
                            ws.send(JSON.stringify({ type: 'stream_end', chatId: data.chatId }));
                        }
                    }
                    // 注意：不在这里重置isStreamingMode，让handleFinalMessage函数来处理
                    // 重置生成状态标志
                    isGenerating = false;
                };

                // 5. 监听生成结束事件，确保无论成功与否都执行清理
                // 注意: 我们现在使用once来确保这个监听器只执行一次，避免干扰后续的全局监听器
                eventSource.once(event_types.GENERATION_ENDED, cleanup);
                // 添加对手动停止生成的处理
                eventSource.once(event_types.GENERATION_STOPPED, cleanup);

                // 6. 触发SillyTavern的生成流程，并用try...catch包裹
                try {
                    const abortController = new AbortController();
                    setExternalAbortController(abortController);
                    await Generate('normal', { signal: abortController.signal });
                } catch (error) {
                    console.error("[Telegram Bridge] Generate() 错误:", error);

                    // a. 从SillyTavern聊天记录中删除导致错误的用户消息
                    await deleteLastMessage();
                    console.log('[Telegram Bridge] 已删除导致错误的用户消息。');

                    // b. 准备并发送错误信息到服务端
                    const errorMessage = `抱歉，AI生成回复时遇到错误。\n您的上一条消息已被撤回，请重试或发送不同内容。\n\n错误详情: ${error.message || '未知错误'}`;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'error_message',
                            chatId: data.chatId,
                            text: errorMessage,
                        }));
                    }

                    // c. 标记错误以便cleanup函数知道
                    data.error = true;
                    cleanup(); // 确保清理监听器
                }

                return;
            }

            // --- 系统命令处理 ---
            if (data.type === 'system_command') {
                console.log('[Telegram Bridge] 收到系统命令', data);
                if (data.command === 'reload_ui_only') {
                    console.log('[Telegram Bridge] 正在刷新UI...');
                    setTimeout(reloadPage, 500);
                }
                return;
            }

            // --- 执行命令处理 ---
            if (data.type === 'execute_command') {
                console.log('[Telegram Bridge] 执行命令', data);

                // 显示“输入中”状态
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'typing_action', chatId: data.chatId }));
                }

                let replyText = '命令执行失败，请稍后重试。';

                // 直接调用全局的 SillyTavern.getContext()
                const context = SillyTavern.getContext();
                let commandSuccess = false;

                try {
                    switch (data.command) {
                        case 'new':
                            await doNewChat({ deleteCurrentChat: false });
                            replyText = '新的聊天已经开始。';
                            commandSuccess = true;
                            break;
                        case 'listchars': {
                            const characters = context.characters.slice(1);
                            if (characters.length > 0) {
                                replyText = '可用角色列表：\n\n';
                                characters.forEach((char, index) => {
                                    replyText += `${index + 1}. /switchchar_${index + 1} - ${char.name}\n`;
                                });
                                replyText += '\n使用 /switchchar_数字 或 /switchchar 角色名称 来切换角色';
                            } else {
                                replyText = '没有找到可用角色。';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchar': {
                            if (!data.args || data.args.length === 0) {
                                replyText = '请提供角色名称或序号。用法: /switchchar <角色名称> 或 /switchchar_数字';
                                break;
                            }
                            const targetName = data.args.join(' ');
                            const characters = context.characters;
                            const targetChar = characters.find(c => c.name === targetName);

                            if (targetChar) {
                                const charIndex = characters.indexOf(targetChar);
                                await selectCharacterById(charIndex);
                                replyText = `已成功切换到角色 "${targetName}"。`;
                                commandSuccess = true;
                            } else {
                                replyText = `角色 "${targetName}" 未找到。`;
                            }
                            break;
                        }
                        case 'listchats': {
                            if (context.characterId === undefined) {
                                replyText = '请先选择一个角色。';
                                break;
                            }
                            const chatFiles = await getPastCharacterChats(context.characterId);
                            if (chatFiles.length > 0) {
                                replyText = '当前角色的聊天记录：\n\n';
                                chatFiles.forEach((chat, index) => {
                                    const chatName = chat.file_name.replace('.jsonl', '');
                                    replyText += `${index + 1}. /switchchat_${index + 1} - ${chatName}\n`;
                                });
                                replyText += '\n使用 /switchchat_数字 或 /switchchat 聊天名称 来切换聊天';
                            } else {
                                replyText = '当前角色没有任何聊天记录。';
                            }
                            commandSuccess = true;
                            break;
                        }
                        case 'switchchat': {
                            if (!data.args || data.args.length === 0) {
                                replyText = '请提供聊天记录名称。用法： /switchchat <聊天记录名称>';
                                break;
                            }
                            const targetChatFile = `${data.args.join(' ')}`;
                            try {
                                await openCharacterChat(targetChatFile);
                                replyText = `已加载聊天记录： ${targetChatFile}`;
                                commandSuccess = true;
                            } catch (err) {
                                console.error(err);
                                replyText = `加载聊天记录 "${targetChatFile}" 失败。请确认名称完全正确。`;
                            }
                            break;
                        }
                        default: {
                            // 处理特殊格式的命令，如 switchchar_1, switchchat_2 等
                            const charMatch = data.command.match(/^switchchar_(\d+)$/);
                            if (charMatch) {
                                const index = parseInt(charMatch[1]) - 1;
                                const characters = context.characters.slice(1);
                                if (index >= 0 && index < characters.length) {
                                    const targetChar = characters[index];
                                    const charIndex = context.characters.indexOf(targetChar);
                                    await selectCharacterById(charIndex);
                                    replyText = `已切换到角色 "${targetChar.name}"。`;
                                    commandSuccess = true;
                                } else {
                                    replyText = `无效的角色序号: ${index + 1}。请使用 /listchars 查看可用角色。`;
                                }
                                break;
                            }

                            const chatMatch = data.command.match(/^switchchat_(\d+)$/);
                            if (chatMatch) {
                                if (context.characterId === undefined) {
                                    replyText = '请先选择一个角色。';
                                    break;
                                }
                                const index = parseInt(chatMatch[1]) - 1;
                                const chatFiles = await getPastCharacterChats(context.characterId);

                                if (index >= 0 && index < chatFiles.length) {
                                    const targetChat = chatFiles[index];
                                    const chatName = targetChat.file_name.replace('.jsonl', '');
                                    try {
                                        await openCharacterChat(chatName);
                                        replyText = `已加载聊天记录： ${chatName}`;
                                        commandSuccess = true;
                                    } catch (err) {
                                        console.error(err);
                                        replyText = `加载聊天记录失败。`;
                                    }
                                } else {
                                    replyText = `无效的聊天记录序号: ${index + 1}。请使用 /listchats 查看可用聊天记录。`;
                                }
                                break;
                            }

                            replyText = `未知命令: /${data.command}。使用 /help 查看所有命令。`;
                        }
                    }
                } catch (error) {
                    console.error('[Telegram Bridge] 执行命令时出错:', error);
                    replyText = `执行命令时出错: ${error.message || '未知错误'}`;
                }

                // 发送命令执行结果
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // 发送命令执行结果到Telegram
                    ws.send(JSON.stringify({ type: 'ai_reply', chatId: data.chatId, text: replyText }));

                    // 发送命令执行状态反馈到服务器
                    ws.send(JSON.stringify({
                        type: 'command_executed',
                        command: data.command,
                        success: commandSuccess,
                        message: replyText
                    }));
                }

                return;
            }
        } catch (error) {
            console.error('[Telegram Bridge] 处理请求时发生错误：', error);
            if (data && data.chatId && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error_message', chatId: data.chatId, text: '处理您的请求时发生了一个内部错误。' }));
            }
        }
    };

    ws.onclose = () => {
        console.log('[Telegram Bridge] 连接已关闭。');
        // 清除心跳超时定时器
        clearHeartbeatTimeout();
        ws = null;
        
        // 如果启用了自动连接，尝试重连
        const settings = getSettings();
        if (settings.autoConnect && !isReconnecting) {
            updateStatus('连接已断开，准备重连...', 'orange');
            attemptReconnect();
        } else {
            updateStatus('连接已断开', 'red');
        }
    };

    ws.onerror = (error) => {
        console.error('[Telegram Bridge] WebSocket 错误：', error);
        // 清除心跳超时定时器
        clearHeartbeatTimeout();
        // 注意：onerror后通常会触发onclose，所以这里不需要重复触发重连
        // 只更新状态，让onclose处理重连逻辑
        updateStatus('连接错误', 'red');
    };
}

function disconnect() {
    // 取消自动重连
    cancelReconnect();
    if (ws) {
        ws.close();
    }
}

// 扩展加载时执行的函数
jQuery(async () => {
    console.log('[Telegram Bridge] 正在尝试加载设置 UI...');
    try {
        const settingsHtml = await $.get(`/scripts/extensions/third-party/${MODULE_NAME}/settings.html`);
        $('#extensions_settings').append(settingsHtml);
        console.log('[Telegram Bridge] 设置 UI 应该已经被添加。');

        const settings = getSettings();
        $('#telegram_bridge_url').val(settings.bridgeUrl);
        $('#telegram_auto_connect').prop('checked', settings.autoConnect);

        $('#telegram_bridge_url').on('input', () => {
            const settings = getSettings();
            settings.bridgeUrl = $('#telegram_bridge_url').val();
            // 确保调用saveSettingsDebounced保存设置
            saveSettingsDebounced();
        });

        $('#telegram_auto_connect').on('change', function () {
            const settings = getSettings();
            settings.autoConnect = $(this).prop('checked');
            // 确保调用saveSettingsDebounced保存设置
            console.log(`[Telegram Bridge] 自动连接设置已更改为: ${settings.autoConnect}`);
            saveSettingsDebounced();
        });

        $('#telegram_connect_button').on('click', connect);
        $('#telegram_disconnect_button').on('click', disconnect);

        if (settings.autoConnect) {
            console.log('[Telegram Bridge] 自动连接已启用，正在连接...');
            connect();
        }

    } catch (error) {
        console.error('[Telegram Bridge] 加载设置 HTML 失败。', error);
    }
    console.log('[Telegram Bridge] 扩展已加载。');
});

/**
 * 从DOM元素中提取文本，保留换行符和基本格式标记
 * @param {jQuery} messageTextElement - 消息文本的jQuery元素
 * @returns {string} 提取的文本，保留格式标记
 */
function extractTextFromDOM(messageTextElement) {
    // 克隆元素以避免修改原始DOM
    const clone = messageTextElement.clone();
    
    // 处理换行相关标签
    clone.find('br').replaceWith('\n');
    clone.find('p').each(function() {
        $(this).prepend('\n\n').append('\n\n');
    });
    clone.find('div').each(function() {
        $(this).append('\n');
    });
    
    // 保留粗体格式标记 - 转换为 **text**
    clone.find('b, strong').each(function() {
        const text = $(this).text();
        $(this).replaceWith(`**${text}**`);
    });
    
    // 保留斜体格式标记 - 转换为 *text*
    clone.find('i, em').each(function() {
        const text = $(this).text();
        $(this).replaceWith(`*${text}*`);
    });
    
    // 保留代码块格式 - 转换为 `code` 或 ```code```
    clone.find('code').each(function() {
        const text = $(this).text();
        // 检查是否是多行代码块
        if (text.includes('\n')) {
            $(this).replaceWith(`\`\`\`\n${text}\n\`\`\``);
        } else {
            $(this).replaceWith(`\`${text}\``);
        }
    });
    
    clone.find('pre').each(function() {
        const text = $(this).text();
        $(this).replaceWith(`\`\`\`\n${text}\n\`\`\``);
    });
    
    // 获取处理后的文本内容
    let text = clone.text();
    
    // 解码HTML实体
    text = decodeHtmlEntities(text);
    
    // 清理多余的空行（超过2个连续换行符的替换为2个）
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // 去除首尾空白
    text = text.trim();
    
    return text;
}

/**
 * 解码HTML实体
 * @param {string} text - 包含HTML实体的文本
 * @returns {string} 解码后的文本
 */
function decodeHtmlEntities(text) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return tempDiv.textContent || tempDiv.innerText || '';
}

// 全局事件监听器，用于最终消息更新
function handleFinalMessage(lastMessageIdInChatArray) {
    // 确保WebSocket已连接，并且我们有一个有效的chatId来发送更新
    if (!ws || ws.readyState !== WebSocket.OPEN || !lastProcessedChatId) {
        return;
    }

    const lastMessageIndex = lastMessageIdInChatArray - 1;
    if (lastMessageIndex < 0) return;

    // 延迟以确保DOM更新完成
    setTimeout(() => {
        // 直接调用全局的 SillyTavern.getContext()
        const context = SillyTavern.getContext();
        const lastMessage = context.chat[lastMessageIndex];

        // 确认这是我们刚刚通过Telegram触发的AI回复
        if (lastMessage && !lastMessage.is_user && !lastMessage.is_system) {
            const messageElement = $(`#chat .mes[mesid="${lastMessageIndex}"]`);

            if (messageElement.length > 0) {
                // 获取消息文本元素
                const messageTextElement = messageElement.find('.mes_text');

                // 使用优化后的DOM文本提取函数
                const renderedText = extractTextFromDOM(messageTextElement);

                console.log(`[Telegram Bridge] 捕获到最终渲染文本，准备发送更新到 chatId: ${lastProcessedChatId}`);

                // 判断是流式还是非流式响应
                if (isStreamingMode) {
                    // 流式响应 - 发送final_message_update
                    ws.send(JSON.stringify({
                        type: 'final_message_update',
                        chatId: lastProcessedChatId,
                        text: renderedText,
                    }));
                    // 重置流式模式标志
                    isStreamingMode = false;
                } else {
                    // 非流式响应 - 直接发送ai_reply
                    ws.send(JSON.stringify({
                        type: 'ai_reply',
                        chatId: lastProcessedChatId,
                        text: renderedText,
                    }));
                }

                // 重置chatId，避免意外更新其他用户的消息
                lastProcessedChatId = null;
            }
        }
        // 确保重置生成状态标志（无论是否成功发送消息）
        isGenerating = false;
    }, 100);
}

// 全局事件监听器，用于最终消息更新
eventSource.on(event_types.GENERATION_ENDED, handleFinalMessage);

// 添加对手动停止生成的处理
eventSource.on(event_types.GENERATION_STOPPED, handleFinalMessage);

/**
 * 清理流式会话状态
 * 当角色或聊天切换时调用，通知Bridge_Server清空旧的流式会话缓存
 */
function cleanupStreamSession() {
    console.log('[Telegram Bridge] 检测到角色/聊天切换，清理流式会话状态');
    
    // 重置本地状态
    isGenerating = false;
    isStreamingMode = false;
    
    // 如果有正在处理的chatId，发送清理消息到Bridge_Server
    if (ws && ws.readyState === WebSocket.OPEN && lastProcessedChatId) {
        ws.send(JSON.stringify({
            type: 'cleanup_session',
            chatId: lastProcessedChatId,
        }));
        console.log(`[Telegram Bridge] 已发送清理消息到 chatId: ${lastProcessedChatId}`);
    }
    
    // 重置chatId
    lastProcessedChatId = null;
}

// 监听角色切换事件
eventSource.on(event_types.CHAT_CHANGED, () => {
    console.log('[Telegram Bridge] 检测到聊天切换');
    cleanupStreamSession();
});

// 监听聊天加载事件（切换到不同聊天记录时触发）
eventSource.on(event_types.CHATLOADED, () => {
    console.log('[Telegram Bridge] 检测到聊天加载');
    cleanupStreamSession();
});

// 监听角色选择事件
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
    // 这个事件在角色消息渲染时触发，可能表示角色切换
    // 但我们只在有活跃会话时才清理
    if (lastProcessedChatId) {
        console.log('[Telegram Bridge] 检测到角色消息渲染，检查是否需要清理');
    }
});