import { readFileSync, statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import z from '@deepseek-ai/schemastery'

/**
 * 词表默认位置：包根目录的 glossary.yml。
 * 词表不写死在代码里，改 YAML 即可扩展，无需改代码。
 */
export const DEFAULT_GLOSSARY_PATH = fileURLToPath(new URL('../glossary.yml', import.meta.url))

/** 提醒强度：quiet 只给词表；normal 给基本说明；strong 明确要求主动使用。 */
export const REMINDER_LEVELS = ['quiet', 'normal', 'strong']

/** 默认提醒强度。 */
export const DEFAULT_REMINDER = 'normal'

/**
 * 插件配置 schema。宿主 Loader 依据它解析 cordis.patch.yml 里的 config。
 */
export const Config = z.object({
    /** 总开关，关掉后不注入任何提示词。 */
    enabled: z.boolean().default(true),
    /** 自定义词表路径（YAML）；留空使用包内 glossary.yml。 */
    glossary: z.string().default(''),
    /** 提醒强度：quiet / normal / strong。 */
    reminder: z.string().default(DEFAULT_REMINDER),
    /** 可选：内联词表，优先于 YAML 文件。 */
    terms: z.array(z.object({ word: z.string(), meaning: z.string() })).default([]),
})

/**
 * 归一化词表：去掉空词、空含义，按 word 去重（保留第一次出现）。
 * @param {unknown} rawTerms - 原始词表。
 * @returns {{word: string, meaning: string}[]} 归一化后的词表。
 */
export function normalizeTerms(rawTerms) {
    const seen = new Set()
    const terms = []
    for (const term of Array.isArray(rawTerms) ? rawTerms : []) {
        if (term === null || typeof term !== 'object') continue
        const word = typeof term.word === 'string' ? term.word.trim() : ''
        const meaning = typeof term.meaning === 'string' ? term.meaning.trim() : ''
        if (word === '' || meaning === '' || seen.has(word)) continue
        seen.add(word)
        terms.push({ word, meaning })
    }
    return terms
}

/** 文件读取缓存：同一路径、同一 mtime 与大小才复用，改文件后自动失效。 */
let cached = { path: '', mtimeMs: -1, size: -1, terms: [] }

/**
 * 从 YAML 文件读取词表。支持两种结构：
 *   terms:\n  - word: 滚木\n    meaning: 没有
 * 或直接在根上的列表：
 *   - word: 滚木\n    meaning: 没有
 * @param {string} path - 文件路径；空串表示包内 glossary.yml。
 * @returns {{word: string, meaning: string}[]} 归一化后的词表。
 */
export function readGlossaryFile(path) {
    const target = path === '' ? DEFAULT_GLOSSARY_PATH : resolvePath(path)
    const stat = statSync(target)
    if (cached.path === target && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.terms
    }
    const text = readFileSync(target, 'utf8').replace(/^\uFEFF/, '')
    const document = yaml.load(text)
    const rawTerms = Array.isArray(document)
        ? document
        : document !== null && typeof document === 'object' && Array.isArray(document.terms)
            ? document.terms
            : []
    const terms = normalizeTerms(rawTerms)
    cached = { path: target, mtimeMs: stat.mtimeMs, size: stat.size, terms }
    return terms
}

/**
 * 生成写进 system prompt 的用语说明：只给词表与通用规则，不写死任何例句。
 * 强度决定提醒的语气：quiet 仅一行；normal 说明理解与表达；strong 明确要求主动使用。
 * @param {{word: string, meaning: string}[]} terms - 已归一化的词表。
 * @param {string} [reminder] - 提醒强度。
 * @returns {string} Markdown 格式的提示词段落。
 */
export function buildGlossaryText(terms, reminder = DEFAULT_REMINDER) {
    const level = REMINDER_LEVELS.includes(reminder) ? reminder : DEFAULT_REMINDER
    const lines = [
        '## 私密词表',
        '',
        '用户有一套自造词，用它们代替日常说法：',
        '',
        ...terms.map((term) => `- 「${term.word}」= ${term.meaning}`),
        '',
    ]
    if (level === 'quiet') {
        lines.push('读到这些词时，按它代表的含义理解整句话。')
    } else if (level === 'normal') {
        lines.push(
            '读到这些词时，先把它们还原成对应的含义，再理解整句话，不要按字面理解。',
            '需要表达对应含义时，可以用这些词把整句话组织得自然通顺，意思保持不变。',
            '代码、命令、路径、URL 和报错原文保持原样。',
        )
    } else {
        lines.push(
            '用户希望对话里用这些词来理解和表达，请主动配合。',
            '读到它们时，先把它们还原成对应的含义再理解整句，不要按字面理解。',
            '需要表达对应含义时，优先使用词表里的词，把整句话重新组织得自然通顺、意思不变，不要生硬地只替换掉几个字。',
            '代码、命令、路径、URL 和报错原文保持原样。',
        )
    }
    return lines.join('\n')
}

/**
 * 把 Loader 传来的 config 归一化成运行时数据：内联词表优先，否则读 YAML；生成提示词文本。
 * @param {unknown} input - 宿主传入的配置对象（可能来自 schema 解析）。
 * @returns {{enabled: boolean, reminder: string, terms: {word: string, meaning: string}[], glossary: string, warnings: string[]}} 归一化配置。
 */
export function resolveConfig(input) {
    const source = input !== null && typeof input === 'object' ? input : {}
    const reminder = REMINDER_LEVELS.includes(source.reminder) ? source.reminder : DEFAULT_REMINDER
    const inline = Array.isArray(source.terms) ? normalizeTerms(source.terms) : []
    const warnings = []
    let terms = inline
    if (terms.length === 0) {
        const path = typeof source.glossary === 'string' ? source.glossary.trim() : ''
        try {
            terms = readGlossaryFile(path)
        } catch (error) {
            warnings.push(`dsh-ottosmother: 读取词表失败（${path === '' ? DEFAULT_GLOSSARY_PATH : path}）: ${String(error)}`)
            terms = []
        }
    }
    const enabled = source.enabled !== false && terms.length > 0
    return {
        enabled,
        reminder,
        terms,
        glossary: enabled ? buildGlossaryText(terms, reminder) : '',
        warnings,
    }
}
