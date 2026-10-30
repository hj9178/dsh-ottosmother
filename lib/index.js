/**
 * dsh-ottosmother 插件入口。
 *
 * 做三件事：
 * 1. 把词表 + 通用用法写进 system prompt（模型自己理解/自己组织回复，不改写任何消息）；
 * 2. 每轮用户输入旁路调用一次模型，把「X 是 Y 的意思」这类明确声明收进本地词表；
 * 3. 给设置页提供词表快照与「打开文件夹」两条本地只读/只开窗路由。
 */
import { resolveConfig } from './config.js'
import { registerAutoLearn } from './learn.js'
import { registerGlossarySection } from './prompt.js'
import { registerRoutes } from './routes.js'

export const name = 'dsh-ottosmother'

/**
 * systemPrompt 必需（提示词注入）；llm 用于自动学习（每轮输入跑一次模型）；
 * webServer 由 routes 内部 `ctx.inject` 等待，无 Web 宿主时设置页路由自然缺席。
 */
export const inject = ['systemPrompt', 'llm']

export { Config } from './config.js'

/**
 * 插件入口。
 * @param {object} ctx - 宿主 cordis 上下文。
 * @param {unknown} config - cordis.patch.yml 中提供的配置（volatile 字段可能是引用）。
 */
export function apply(ctx, config) {
  const current = () => resolveConfig(config)
  registerGlossarySection(ctx, current)
  registerAutoLearn(ctx, current)
  registerRoutes(ctx, current)
}
