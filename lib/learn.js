/**
 * 自动学习：每一轮用户输入都调用一次模型，把对话里**明确声明**的词条收进本地词表。
 *
 * 只认用户显式给出的「X 是 Y 的意思」这类句式；模型没有把握时返回空数组，
 * 绝不猜测。写入位置是个人词表目录下的 `learned.yaml`（文件名由 config.learnFile
 * 决定），文件不存在时自动创建、自动命名（标题「自动学习」）。
 *
 * 学习是旁路：pre-step 里 fire-and-forget，不阻塞、不改写用户消息；模型调用失败
 * 或超时只记一条日志，不影响正常对话。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import yaml from 'js-yaml'

const SYSTEM_PROMPT = [
  '你是词条提取器。判断「用户这句话」里是否明确声明了某个词、短语或缩写表示某个含义。',
  '判定句式形如：「X 是 Y 的意思」「X 指 Y」「X 指的是 Y」「X 表示 Y」「X = Y」「这里把 X 叫做 Y」。',
  '用户只是随口用词、没有给出明确含义时，不要猜。',
  '只输出一个 JSON 对象，不要解释、不要 Markdown 代码块：',
  '{"terms":[{"word":"X","meaning":"Y"}]}',
  '没有可提取的词条时输出 {"terms":[]}。',
].join('\n')

const MAX_INPUT = 2000
const MAX_REPLY = 4000
const MAX_TERMS = 20
const WORD_LIMIT = 64
const MEANING_LIMIT = 200
const TIMEOUT_MS = 20000
const MAX_TERM_HISTORY = 64

/** 最近处理过的输入（去重，用户重发同一句话时不重复调用模型）。 */
const recentInputs = new Set()
/** 已经上报过的错误，避免每轮刷日志。 */
const reported = new Set()
/** 写入串行化：并发输入不会互相覆盖同一条词表。 */
let writeQueue = Promise.resolve()

/** 取「本轮用户消息」的正文：最后一条 user 消息里的 text 块。 */
export function lastUserText(messages) {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const isUser = message?.source ? message.source.kind === 'user' : message?.role === 'user'
    if (!isUser) continue
    const blocks = Array.isArray(message.content) ? message.content : []
    const text = blocks
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim()
    return text.slice(0, MAX_INPUT)
  }
  return ''
}

/** 构造提取请求的消息：system 指令 + 用户原话。 */
export function buildExtractionMessages(text) {
  return [
    {
      id: randomUUID(),
      role: 'system',
      content: [{ type: 'text', text: SYSTEM_PROMPT }],
      source: { kind: 'system-prompt' },
    },
    {
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    },
  ]
}

/** 从模型回复里解析词条；只接受结构完整的 JSON，其余一律当作「没有」。 */
export function extractTerms(reply) {
  if (typeof reply !== 'string') return []
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let document
  try {
    document = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return []
  }
  const list = Array.isArray(document?.terms) ? document.terms : []
  const seen = new Set()
  const terms = []
  for (const item of list) {
    const word = typeof item?.word === 'string' ? item.word.trim() : ''
    const meaning = typeof item?.meaning === 'string' ? item.meaning.trim() : ''
    if (word.length === 0 || meaning.length === 0) continue
    if (word.length > WORD_LIMIT || meaning.length > MEANING_LIMIT) continue
    const key = `${word}\u0000${meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    terms.push({ word, meaning })
    if (terms.length >= MAX_TERMS) break
  }
  return terms
}

/** 读取已存在的学习文件；不存在或损坏时返回 null（由调用方回退到空词表）。 */
export function readLearnedFile(file) {
  try {
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const document = yaml.load(raw)
    const list = Array.isArray(document)
      ? document
      : Array.isArray(document?.terms)
        ? document.terms
        : []
    const terms = []
    const seen = new Set()
    for (const item of list) {
      const word = typeof item?.word === 'string' ? item.word.trim() : ''
      const meaning = typeof item?.meaning === 'string' ? item.meaning.trim() : ''
      if (word.length === 0 || meaning.length === 0) continue
      const key = `${word}\u0000${meaning}`
      if (seen.has(key)) continue
      seen.add(key)
      terms.push({ word, meaning })
    }
    return {
      title:
        typeof document?.title === 'string' && document.title.trim().length > 0
          ? document.title.trim()
          : '自动学习',
      description:
        typeof document?.description === 'string'
          ? document.description.trim()
          : '用户在对话里明确说明过的词条，由 dsh-ottosmother 自动收集',
      terms,
    }
  } catch {
    return null
  }
}

/**
 * 把新词条并进学习文件；文件不存在时按约定自动创建。
 * @returns 真正新增的词条（已存在或被同名词条覆盖的不会重复写入）。
 */
export function mergeLearnedIntoFile(file, additions) {
  const existing = readLearnedFile(file) ?? {
    title: '自动学习',
    description: '用户在对话里明确说明过的词条，由 dsh-ottosmother 自动收集',
    terms: [],
  }
  const seen = new Set(existing.terms.map((term) => `${term.word}\u0000${term.meaning}`))
  const worded = new Set(existing.terms.map((term) => term.word))
  const added = []
  for (const term of additions) {
    const key = `${term.word}\u0000${term.meaning}`
    if (seen.has(key) || worded.has(term.word)) continue
    seen.add(key)
    worded.add(term.word)
    added.push(term)
    existing.terms.push(term)
  }
  if (added.length === 0) return []
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(
    file,
    yaml.dump(
      { title: existing.title, description: existing.description, terms: existing.terms },
      { lineWidth: 120 },
    ),
    'utf8',
  )
  return added
}

/** 读取默认模型选择；服务缺失或未配置时返回 undefined。 */
function resolveSelection(ctx) {
  try {
    const service = ctx.get?.('agentDefaultModel')
    const selection = service?.currentSelection?.()
    if (
      selection &&
      typeof selection.provider === 'string' &&
      selection.provider.length > 0 &&
      typeof selection.model === 'string' &&
      selection.model.length > 0
    ) {
      return selection
    }
  } catch {
    // 服务不可用就跳过这一轮学习，不影响对话。
  }
  return undefined
}

/** 收集文本增量；遇到 finish 或长度上限即停。 */
async function collectText(stream) {
  let text = ''
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text
      if (text.length > MAX_REPLY) break
    } else if (chunk?.type === 'finish') {
      break
    }
  }
  return text
}

/** 记录一条错误日志（同一错误只报一次）。 */
function reportOnce(ctx, error) {
  const message = `dsh-ottosmother：自动学习失败（${String(error?.message ?? error)}）`
  if (reported.has(message)) return
  reported.add(message)
  ctx.logger?.warn?.(message)
}

/**
 * 对一段用户输入执行一次学习：调用模型 → 解析词条 → 合并写入本地词表。
 * @returns 新增并写入的词条（没有新词条时为空数组）。
 */
export async function learnFromText(ctx, config, text) {
  if (typeof text !== 'string' || text.trim().length < 1) return []
  const selection = resolveSelection(ctx)
  if (!selection) return []
  const stream = ctx.llm?.stream?.({
    provider: selection.provider,
    model: selection.model,
    messages: buildExtractionMessages(text.trim()),
    maxTokens: 240,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!stream) return []
  const reply = await collectText(stream)
  const terms = extractTerms(reply)
  if (terms.length === 0) return []
  const file = config.learnPath
  if (typeof file !== 'string' || file.length === 0) return []
  return mergeLearnedIntoFile(file, terms)
}

/**
 * 注册自动学习：每一轮（step 0）用户输入后异步跑一次学习。
 * @param ctx - 宿主 cordis 上下文。
 * @param current - 现读的归一化配置。
 * @returns 取消注册的函数（组件销毁时调用）。
 */
export function registerAutoLearn(ctx, current) {
  if (!ctx || typeof ctx.on !== 'function') return () => {}
  return ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      const config = current()
      if (!config.autoLearn) return decision
      if (payload?.signal?.aborted) return decision
      if (payload?.step !== undefined && payload.step !== 0) return decision
      const text = lastUserText(payload?.messages)
      if (text.length < 1) return decision
      if (recentInputs.has(text)) return decision
      recentInputs.add(text)
      if (recentInputs.size > MAX_TERM_HISTORY) {
        const oldest = recentInputs.values().next().value
        recentInputs.delete(oldest)
      }
      writeQueue = writeQueue
        .then(() => learnFromText(ctx, config, text))
        .then((added) => {
          if (Array.isArray(added) && added.length > 0) {
            ctx.logger?.info?.(
              `dsh-ottosmother：自动学到 ${added.length} 条词条（${added.map((term) => term.word).join('、')}）`,
            )
          }
        })
        .catch((error) => reportOnce(ctx, error))
    } catch (error) {
      reportOnce(ctx, error)
    }
    return decision
  }, { prepend: true })
}

/** 供测试使用：等待当前写入队列清空。 */
export function flushLearnedQueue() {
  return writeQueue
}

/** 判断某个学习文件是否存在（测试与诊断用）。 */
export function learnedFileExists(file) {
  return existsSync(file)
}
