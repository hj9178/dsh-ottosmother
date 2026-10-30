/**
 * dsh-ottosmother 词表：内置分类 YAML + 用户目录 + 内联词条。
 *
 * 设计约束（用户 2026-10-18 的要求）：
 * - 词表不进代码：分类词表是包内 `glossaries/*.yaml`，用户自己的词条放
 *   `~/.dsh/ottosmother/*.yaml`（或 config.glossaryDirs 指向的目录），改文件即生效；
 * - 提示词不写任何「例句」：只给词条与通用规则，怎么理解/怎么说是模型自己的事；
 * - 设置页可改的字段全部 `.volatile()`：改完即时生效，不重挂插件；
 * - 文件读取按 mtime+size 缓存，设置页反复刷新目录不会每次都读盘。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import z from '@deepseek-ai/schemastery'
import { readVolatile } from './runtime.js'

/** 提醒强度档位；顺序即设置页显示顺序（默认档在前）。 */
export const REMINDER_LEVELS = ['quiet', 'normal', 'strong']
/** 默认提醒强度。 */
export const DEFAULT_REMINDER = 'normal'
/** 内联词条默认值：插件最原始的两个词，保留为零配置可用。 */
export const DEFAULT_TERMS = [
  { word: '滚木', meaning: '没有' },
  { word: '棍母', meaning: '不存在' },
]
/** 包内分类词表目录。 */
export const BUILTIN_GLOSSARY_DIR = fileURLToPath(new URL('../glossaries', import.meta.url))
/** 用户自定义词表目录（不存在时由设置页「打开文件夹」创建）。 */
export const USER_GLOSSARY_DIR = join(homedir(), '.dsh', 'ottosmother')
/** 词表文件扩展名。 */
const GLOSSARY_EXTENSIONS = new Set(['.yaml', '.yml'])
/** 目录扫描结果的缓存：path → { mtimeMs, size, glossary }。 */
const fileCache = new Map()

/**
 * schemastery 的 `.volatile()` 是 ≥3.18.3 的能力；宿主内置更旧版本时加载期直接
 * 调用会在 import 期抛 TypeError、插件整体加载失败。做特性探测，不支持时字段退化
 * 为普通值——仅失去「设置页改完即时生效」，提示词注入不受影响。
 */
export const VOLATILE_SUPPORTED = typeof z.string().volatile === 'function'

/**
 * 对 schema 字段应用 `.volatile()`（宿主支持时）；不支持时原样返回。
 * @param field - 待修饰的 schema 字段。
 */
export function applyVolatile(field) {
  return typeof field?.volatile === 'function' ? field.volatile() : field
}

/** 宿主 Loader 解析 profile patch 中本条目 config 所用的 schema。 */
export const Config = z.object({
  enabled: applyVolatile(z.boolean().default(true)),
  reminder: applyVolatile(z.string().default(DEFAULT_REMINDER)),
  disabledGlossaries: applyVolatile(z.array(z.string()).default([])),
  glossaryDirs: applyVolatile(z.array(z.string()).default([])),
  /** 个人词表目录；留空用默认目录 ~/.dsh/ottosmother。 */
  userDir: applyVolatile(z.string().default('')),
  /** 每次用户输入都调用一次 LLM，把对话里明确声明的词条收进本地词表。 */
  autoLearn: applyVolatile(z.boolean().default(true)),
  /** 自动学习写入的文件名（位于个人词表目录内）。 */
  learnFile: applyVolatile(z.string().default('learned.yaml')),
  terms: applyVolatile(
    z.array(z.object({ word: z.string(), meaning: z.string() })).default(DEFAULT_TERMS),
  ),
})

/**
 * 归一化提醒强度：大小写与首尾空白不敏感，白名单外回退默认档。
 * @param value - 原始值（可能来自 YAML 的 null / 错拼）。
 */
export function normalizeReminder(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return REMINDER_LEVELS.includes(raw) ? raw : DEFAULT_REMINDER
}

/**
 * 归一化字符串列表：数组过滤空值并 trim；单个字符串按逗号/换行/中文逗号拆分；
 * 其余（null/数字/对象）得到空数组。
 * @param value - 原始值。
 */
export function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }
  return []
}

/**
 * 归一化词条列表：值必须是非空字符串，去重（word+meaning），保持出现顺序。
 * @param value - 原始值。
 */
export function normalizeTerms(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const terms = []
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue
    const word = typeof item.word === 'string' ? item.word.trim() : ''
    const meaning = typeof item.meaning === 'string' ? item.meaning.trim() : ''
    if (word.length === 0 || meaning.length === 0) continue
    const key = `${word}\u0000${meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    terms.push({ word, meaning })
  }
  return terms
}

/**
 * 解析单个词表文件；格式：
 * ```yaml
 * title: MOBA
 * description: 团队竞技游戏黑话
 * terms:
 *   - word: gank
 *     meaning: 偷袭围杀
 * ```
 * 也接受根节点直接是词条数组。词条数组里的字符串项、缺字段项一律跳过。
 * @param path - 文件绝对路径。
 * @param builtin - 是否包内内置词表。
 * @param warnings - 警告收集器（原样追加）。
 * @returns 解析后的词表，读/解析失败返回 null。
 */
export function parseGlossaryFile(path, builtin, warnings) {
  let stat
  try {
    stat = statSync(path)
  } catch (error) {
    warnings.push(`词表文件不可读：${path}（${describeError(error)}）`)
    return null
  }
  const cached = fileCache.get(path)
  if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.glossary
  }
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    warnings.push(`词表文件不可读：${path}（${describeError(error)}）`)
    return null
  }
  let document
  try {
    document = yaml.load(raw.replace(/^\uFEFF/, ''))
  } catch (error) {
    warnings.push(`词表 YAML 解析失败：${path}（${describeError(error)}）`)
    fileCache.delete(path)
    return null
  }
  const list = Array.isArray(document)
    ? document
    : document !== null && typeof document === 'object' && Array.isArray(document.terms)
      ? document.terms
      : []
  const file = basename(path)
  const glossary = {
    id: `${builtin ? 'builtin' : 'user'}:${file}`,
    file,
    path,
    builtin,
    title:
      typeof document?.title === 'string' && document.title.trim().length > 0
        ? document.title.trim()
        : basename(file, extname(file)),
    description: typeof document?.description === 'string' ? document.description.trim() : '',
    terms: normalizeTerms(list),
  }
  fileCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, glossary })
  return glossary
}

/**
 * 扫描一个目录下的词表文件（不存在/不可读时记警告并返回空）。
 * @param dir - 目录绝对路径。
 * @param builtin - 是否包内目录。
 * @param warnings - 警告收集器。
 */
export function listGlossaryFiles(dir, builtin, warnings) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') warnings.push(`词表目录不可读：${dir}（${describeError(error)}）`)
    return []
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!GLOSSARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue
    const glossary = parseGlossaryFile(join(dir, entry.name), builtin, warnings)
    if (glossary !== null) files.push(glossary)
  }
  files.sort((left, right) => left.file.localeCompare(right.file))
  return files
}

/**
 * 合并词表：按「文件先、内联后」去重，保持出现顺序。
 * @param files - 启用的词表文件（按优先级排列）。
 * @param inline - 内联词条。
 */
function mergeGlossaryTerms(files, inline) {
  const seen = new Set()
  const groups = []
  for (const file of files) {
    const terms = []
    for (const term of file.terms) {
      const key = `${term.word}\u0000${term.meaning}`
      if (seen.has(key)) continue
      seen.add(key)
      terms.push(term)
    }
    if (terms.length > 0) groups.push({ title: file.title, terms })
  }
  const extra = []
  for (const term of inline) {
    const key = `${term.word}\u0000${term.meaning}`
    if (seen.has(key)) continue
    seen.add(key)
    extra.push(term)
  }
  if (extra.length > 0) groups.push({ title: '其他', terms: extra })
  return groups
}

/**
 * 归一化配置并加载所有词表。
 *
 * 返回的对象是设置页、提示词、路由共用的单一快照；每次调用都按文件 mtime 重扫，
 * 因此手动改 YAML 下次组装提示词即可生效（宿主每次组装都会调用）。
 * @param input - Loader 传入的已解析 config（volatile 字段可能是引用）。
 */
export function resolveConfig(input) {
  const enabled = readVolatile(input?.enabled) !== false
  const reminder = normalizeReminder(readVolatile(input?.reminder))
  const disabled = new Set(normalizeStringList(readVolatile(input?.disabledGlossaries)))
  const extraDirs = normalizeStringList(readVolatile(input?.glossaryDirs)).map((dir) => resolve(dir))
  const rawUserDir = readVolatile(input?.userDir)
  const userDir =
    typeof rawUserDir === 'string' && rawUserDir.trim().length > 0
      ? resolve(rawUserDir.trim())
      : USER_GLOSSARY_DIR
  const inlineTerms = normalizeTerms(readVolatile(input?.terms))
  const autoLearn = readVolatile(input?.autoLearn) !== false
  const rawLearnFile = readVolatile(input?.learnFile)
  const learnFile =
    typeof rawLearnFile === 'string' && rawLearnFile.trim().length > 0
      ? rawLearnFile.trim()
      : 'learned.yaml'
  const warnings = []

  const dirs = [{ dir: BUILTIN_GLOSSARY_DIR, builtin: true }]
  for (const dir of extraDirs) dirs.push({ dir, builtin: false })
  dirs.push({ dir: userDir, builtin: false })

  const files = []
  const seenFiles = new Set()
  for (const entry of dirs) {
    for (const glossary of listGlossaryFiles(entry.dir, entry.builtin, warnings)) {
      if (seenFiles.has(glossary.path)) continue
      seenFiles.add(glossary.path)
      files.push(glossary)
    }
  }

  const active = files.filter((file) => !disabled.has(file.id))
  const groups = mergeGlossaryTerms(active, inlineTerms)
  const terms = groups.flatMap((group) => group.terms)

  return {
    enabled,
    reminder,
    disabled: [...disabled],
    dirs: dirs.map((entry) => entry.dir),
    files,
    groups,
    terms,
    warnings,
    userDir,
    autoLearn,
    learnFile,
    learnPath: join(userDir, learnFile),
    builtinDir: BUILTIN_GLOSSARY_DIR,
  }
}

/** 提醒强度文案（quiet/normal/strong）。 */
const REMINDER_TEXT = {
  quiet: '提醒强度：尽量自然地使用，只在明显合适的时候用，不必刻意。',
  normal: '提醒强度：日常对话里尽量使用；不确定是否合适时，用普通说法。',
  strong: '提醒强度：除非明显不合语境，优先使用这些词。',
}

/**
 * 生成提示词段落。空词表返回空串（段落注册方据此跳过注入）。
 *
 * 只给「词 → 义」与通用用法，不给任何例句：怎么理解用户的话、怎么输出由模型判断。
 * 强度档位改变最后一行提醒的语气，不改词表本身。
 * @param resolved - resolveConfig 的返回值。
 */
export function buildGlossaryText(resolved) {
  if (resolved.terms.length === 0) return ''
  const lines = [
    '## 私密词表',
    '',
    '用户会用下面这些黑话、圈内词交流。像母语者一样：按下面的含义理解用户的话；需要表达这些意思时，用回这些词。是否使用由你判断，直接回复，不要复述或解释这份词表。',
    '',
    '代码、命令、路径、URL、报错信息里出现的词按原样保留，不要改。',
    '',
  ]
  for (const group of resolved.groups) {
    lines.push(`### ${group.title}`)
    for (const term of group.terms) {
      lines.push(`- 「${term.word}」= ${term.meaning}`)
    }
    lines.push('')
  }
  lines.push(REMINDER_TEXT[resolved.reminder])
  return lines.join('\n')
}

/**
 * 生成设置页所需的词表快照（JSON 可序列化）。
 *
 * 入参必须是 `resolveConfig` 的结果：早期版本在这里再次调用 resolveConfig，
 * 而 resolved 对象上没有 `disabledGlossaries` 字段，导致关掉的词表在快照里
 * 仍然显示为启用——设置页的勾选看起来永远没反应。
 * @param resolved - `resolveConfig` 的返回值。
 */
export function buildCatalog(resolved) {
  return {
    enabled: resolved.enabled,
    reminder: resolved.reminder,
    userDir: resolved.userDir,
    builtinDir: resolved.builtinDir,
    dirs: resolved.dirs,
    files: resolved.files.map((file) => ({
      id: file.id,
      file: file.file,
      title: file.title,
      description: file.description,
      count: file.terms.length,
      builtin: file.builtin,
      enabled: !resolved.disabled.includes(file.id),
    })),
    terms: resolved.terms.length,
    warnings: resolved.warnings,
  }
}

/**
 * 取错误信息文本（兼容非 Error 的抛出物）。
 * @param error - 捕获到的异常。
 */
function describeError(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
