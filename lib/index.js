import { resolveConfig } from './config.js'
import { registerGlossarySection } from './prompt.js'

export const name = 'dsh-ottosmother'

/**
 * 只依赖 systemPrompt 服务：把一份 YAML 词表（默认 glossary.yml）与通用用法说明
 * 写进系统提示，由模型自己理解用户输入、自己组织回复。
 * 插件不改写任何用户消息或模型输出。
 */
export const inject = ['systemPrompt']

export { Config } from './config.js'

/**
 * 插件入口。
 * @param {object} ctx - 宿主 cordis 上下文。
 * @param {unknown} config - cordis.patch.yml 中提供的配置。
 */
export function apply(ctx, config) {
    const current = () => resolveConfig(config)
    registerGlossarySection(ctx, current)
}
