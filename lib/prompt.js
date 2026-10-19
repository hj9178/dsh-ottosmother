/**
 * 词表段落的注册与警告上报。
 *
 * 段落文本是提供者函数：宿主每次组装 system prompt 都现读配置，因此改 YAML、
 * 改提醒强度、点总开关都会在下一轮对话生效，无需重启插件。
 */
import { buildGlossaryText } from './config.js'

/** system prompt 段落名，便于定位与调试。 */
export const SECTION_NAME = 'dsh-ottosmother/glossary'

/** 段落排序：放在常规人格/工具说明之后、离用户输入较近的位置。 */
export const SECTION_ORDER = 50

/** 已上报过的警告，避免每次组装 prompt 都重复刷日志。 */
const reportedWarnings = new Set()

/**
 * 把词表说明注册成 system prompt 段落。
 * @param {object} ctx - 宿主 cordis 上下文。
 * @param {() => ReturnType<import('./config.js').resolveConfig>} current - 现读的归一化配置。
 */
export function registerGlossarySection(ctx, current) {
  if (!ctx || !ctx.systemPrompt || typeof ctx.systemPrompt.section !== 'function') {
    ctx?.logger?.error?.('dsh-ottosmother: systemPrompt 服务不可用，词表未注入。')
    return
  }
  try {
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      // 文本由插件生成，不需要宿主再做变量插值。
      interpolate: false,
      text: () => {
        const resolved = current()
        for (const warning of Array.isArray(resolved.warnings) ? resolved.warnings : []) {
          if (reportedWarnings.has(warning)) continue
          reportedWarnings.add(warning)
          ctx.logger?.error?.(warning)
        }
        return resolved.enabled ? buildGlossaryText(resolved) : ''
      },
    })
  } catch (error) {
    ctx.logger?.error?.(`dsh-ottosmother: 注册 system prompt 段落失败: ${String(error)}`)
  }
}
