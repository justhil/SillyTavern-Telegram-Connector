/**
 * Message Formatter Module
 * 将 SillyTavern 输出转换为 Telegram 支持的格式 (HTML/MarkdownV2/纯文本)
 */

/**
 * 智能过滤前端代码和无意义内容
 * @param {string} text - 原始文本
 * @returns {string} - 过滤后的文本
 */
function filterFrontendCode(text) {
    if (!text) return '';

    let result = text;

    // 移除 HTML 标签块 (保留文本内容)
    result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<link[^>]*>/gi, '');
    result = result.replace(/<meta[^>]*>/gi, '');

    // 移除大段的 CSS 代码
    result = result.replace(/```css[\s\S]*?```/gi, '[CSS代码已省略]');
    result = result.replace(/```scss[\s\S]*?```/gi, '[SCSS代码已省略]');
    result = result.replace(/```less[\s\S]*?```/gi, '[LESS代码已省略]');

    // 移除大段的 HTML 代码
    result = result.replace(/```html[\s\S]*?```/gi, '[HTML代码已省略]');
    result = result.replace(/```xml[\s\S]*?```/gi, '[XML代码已省略]');

    // 移除大段的 JavaScript 代码
    result = result.replace(/```javascript[\s\S]*?```/gi, '[JavaScript代码已省略]');
    result = result.replace(/```js[\s\S]*?```/gi, '[JavaScript代码已省略]');
    result = result.replace(/```typescript[\s\S]*?```/gi, '[TypeScript代码已省略]');
    result = result.replace(/```ts[\s\S]*?```/gi, '[TypeScript代码已省略]');

    // 移除大段的 JSON 代码 (超过500字符的)
    result = result.replace(/```json([\s\S]*?)```/gi, (match, code) => {
        if (code.length > 500) return '[JSON数据已省略]';
        return match;
    });

    // 移除无标记的大段代码块 (超过1000字符且看起来像代码的)
    result = result.replace(/```([\s\S]*?)```/g, (match, code) => {
        // 检测是否是代码 (包含大量特殊字符)
        const codeIndicators = (code.match(/[{}\[\]();=<>]/g) || []).length;
        if (code.length > 1000 && codeIndicators > 50) {
            return '[代码块已省略]';
        }
        return match;
    });

    // 移除连续的空行 (超过2个)
    result = result.replace(/\n{4,}/g, '\n\n\n');

    // 移除行首行尾空白
    result = result.trim();

    return result;
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text - 原始文本
 * @returns {string} - 转义后的文本
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * 转义 MarkdownV2 特殊字符
 * Telegram MarkdownV2 需要转义: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param {string} text - 原始文本
 * @returns {string} - 转义后的文本
 */
function escapeMarkdownV2(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * 将 Markdown 格式转换为 HTML 格式
 * @param {string} text - 包含 Markdown 标记的文本
 * @param {object} config - 格式化配置
 * @returns {string} - HTML 格式文本
 */
function convertToHtml(text, config = {}) {
    const { enableBold = true, enableItalic = true, enableCodeBlocks = true } = config;

    let result = escapeHtml(text);

    // 处理代码块 ```code``` -> <pre>code</pre>
    if (enableCodeBlocks) {
        result = result.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
        // 处理行内代码 `code` -> <code>code</code>
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    // 处理粗体 **text** -> <b>text</b>
    if (enableBold) {
        result = result.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    }

    // 处理斜体 *text* -> <i>text</i> (注意要在粗体之后处理)
    if (enableItalic) {
        result = result.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    }

    return result;
}

/**
 * 将 Markdown 格式转换为 MarkdownV2 格式
 * @param {string} text - 包含 Markdown 标记的文本
 * @param {object} config - 格式化配置
 * @returns {string} - MarkdownV2 格式文本
 */
function convertToMarkdownV2(text, config = {}) {
    const { enableBold = true, enableItalic = true, enableCodeBlocks = true } = config;

    // 提取代码块和行内代码，避免转义其内容
    const codeBlocks = [];
    const inlineCodes = [];

    let result = text;

    // 临时替换代码块
    if (enableCodeBlocks) {
        result = result.replace(/```([\s\S]*?)```/g, (match, code) => {
            codeBlocks.push(code);
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        });
        result = result.replace(/`([^`]+)`/g, (match, code) => {
            inlineCodes.push(code);
            return `__INLINE_CODE_${inlineCodes.length - 1}__`;
        });
    }

    // 提取粗体和斜体标记
    const boldMatches = [];
    const italicMatches = [];

    if (enableBold) {
        result = result.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
            boldMatches.push(content);
            return `__BOLD_${boldMatches.length - 1}__`;
        });
    }

    if (enableItalic) {
        result = result.replace(/\*([^*]+)\*/g, (match, content) => {
            italicMatches.push(content);
            return `__ITALIC_${italicMatches.length - 1}__`;
        });
    }

    // 转义剩余文本
    result = escapeMarkdownV2(result);

    // 恢复粗体 (MarkdownV2 使用 *text*)
    boldMatches.forEach((content, i) => {
        result = result.replace(`__BOLD_${i}__`, `*${escapeMarkdownV2(content)}*`);
    });

    // 恢复斜体 (MarkdownV2 使用 _text_)
    italicMatches.forEach((content, i) => {
        result = result.replace(`__ITALIC_${i}__`, `_${escapeMarkdownV2(content)}_`);
    });

    // 恢复代码块
    if (enableCodeBlocks) {
        codeBlocks.forEach((code, i) => {
            result = result.replace(`__CODE_BLOCK_${i}__`, '```' + code + '```');
        });
        inlineCodes.forEach((code, i) => {
            result = result.replace(`__INLINE_CODE_${i}__`, '`' + code + '`');
        });
    }

    return result;
}

/**
 * 主格式化函数，根据配置选择格式化模式
 * @param {string} text - 原始文本
 * @param {object} config - 格式化配置
 * @param {string} config.parseMode - 解析模式: 'HTML' | 'MarkdownV2' | null
 * @param {boolean} config.enableBold - 是否启用粗体
 * @param {boolean} config.enableItalic - 是否启用斜体
 * @param {boolean} config.enableCodeBlocks - 是否启用代码块
 * @returns {{ text: string, parseMode: string | null }} - 格式化结果
 */
function format(text, config = {}) {
    const {
        parseMode = 'HTML',
        enableBold = true,
        enableItalic = true,
        enableCodeBlocks = true,
        filterCode = true  // 默认启用代码过滤
    } = config;

    if (!text) {
        return { text: '', parseMode: null };
    }

    // 先过滤前端代码
    let processedText = filterCode ? filterFrontendCode(text) : text;

    try {
        switch (parseMode) {
            case 'HTML':
                return {
                    text: convertToHtml(processedText, { enableBold, enableItalic, enableCodeBlocks }),
                    parseMode: 'HTML'
                };

            case 'MarkdownV2':
                return {
                    text: convertToMarkdownV2(processedText, { enableBold, enableItalic, enableCodeBlocks }),
                    parseMode: 'MarkdownV2'
                };

            default:
                // 纯文本模式，不做任何格式化
                return { text: processedText, parseMode: null };
        }
    } catch (error) {
        // 格式化失败时回退到纯文本模式 (Requirement 4.5)
        console.error('[MessageFormatter] Format error, falling back to plain text:', error.message);
        return { text: processedText, parseMode: null };
    }
}

module.exports = {
    escapeHtml,
    escapeMarkdownV2,
    convertToHtml,
    convertToMarkdownV2,
    filterFrontendCode,
    format
};
