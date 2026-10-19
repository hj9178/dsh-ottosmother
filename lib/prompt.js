/** system prompt 段落名，便于定位与调试。 */
export const SECTION_NAME = 'dsh-ottosmother/glossary'

/** 段落排序：放在常规人格/工具说明之后、离用户输入较近的位置。 */
export const SECTION_ORDER = 50

/** 已上报过的警告，避免每次组装 prompt 都重复刷日志。 */
const reportedWarnings = new Set()

/**
 * 把用语说明注册成 system prompt 段落。每次组装 prompt 时现读配置，
 * 因此改 YAML 词表后无需重启插件进程。
 * @param {object} ctx - 宿主 cordis 上下文。
 * @param {() => {enabled: boolean, glossary: string, warnings?: string[]}} current - 现读的归一化配置。
 */
export function registerGlossarySection(ctx, current) {
    if (!ctx || !ctx.systemPrompt || typeof ctx.systemPrompt.section !== 'function') {
        ctx?.logger?.error?.('dsh-ottosmother: systemPrompt 服务不可用，用语说明未注入。')
        return
    }
    try {
        ctx.systemPrompt.section({
            name: SECTION_NAME,
            order: SECTION_ORDER,
            // 文本由插件生成，不需要宿主再做变量插值。
            interpolate: false,
            text: () => {
                const config = current()
                for (const warning of Array.isArray(config.warnings) ? config.warnings : []) {
                    if (reportedWarnings.has(warning)) continue
                    reportedWarnings.add(warning)
                    ctx.logger?.error?.(warning)
                }
                return config.enabled ? config.glossary : ''
            },
        })
    } catch (error) {
        ctx.logger?.error?.(`dsh-ottosmother: 注册 system prompt 段落失败: ${String(error)}`)
    }
}
