import z from '@deepseek-ai/schemastery'

/**
 * 默认词表：`word` 是用户的自造词，`meaning` 是它代表的日常说法。
 * 插件不替换任何文本，只把这张表写进 system prompt，交给模型自己理解和使用。
 */
export const DEFAULT_TERMS = [
    { word: '滚木', meaning: '没有' },
    { word: '棍母', meaning: '不存在' },
]

/**
 * 插件配置 schema。宿主 Loader 依据它解析 cordis.patch.yml 里的 config。
 */
export const Config = z.object({
    /** 总开关，关掉后不注入任何提示词。 */
    enabled: z.boolean().default(true),
    /** 自造词表：word 是用户写的词，meaning 是它代表的含义。 */
    terms: z.array(z.object({ word: z.string(), meaning: z.string() })).default(DEFAULT_TERMS),
})

/**
 * 生成写进 system prompt 的用语说明。强调「先理解、再表达」，
 * 让模型按语义理解自造词、按语义自然使用，而不是做字面替换。
 * @param {{word: string, meaning: string}[]} terms - 已归一化的词表。
 * @returns {string} Markdown 格式的提示词段落。
 */
export function buildGlossaryText(terms) {
    const table = terms.map((term) => `- 「${term.word}」= ${term.meaning}`).join('\n')
    return [
        '## 固定用语（请像母语者一样理解和使用）',
        '',
        '用户有一套自造词，日常对话里会用它代替普通说法：',
        '',
        table,
        '',
        '### 理解用户的话',
        '',
        '读到这些词时，先把它还原成它代表的含义，再理解整句话，不要按字面理解：',
        '',
        '- 用户说「说了个棍母」，意思是「什么也没说」。',
        '- 用户说「这里有滚木」，意思是「这里什么也没有」。',
        '- 用户说「这个功能是棍母」，意思是「这个功能不存在」。',
        '',
        '### 回复时',
        '',
        '当你要表达「没有 / 不存在」的意思时，用对应的固定用语把整句话自然地改写，',
        '让它读起来像正常人说的话，不能只是把「没有」两个字扣掉再塞一个词进去：',
        '',
        '- 「这里没有东西」→「这里有棍母」',
        '- 「这个功能不存在」→「这个功能是棍母」',
        '- 「我没有收到附件」→「我的附件是滚木」',
        '',
        '改写后必须句子通顺、意思不变。如果硬塞一个词会让句子别扭，就换一种自然的说法，',
        '宁可整句重新组织，也不要出现「这里滚木东西」这种生硬结果。',
        '',
        '### 不要改写的内容',
        '',
        '代码、命令、路径、URL、报错信息这类需要原样保留的内容保持原样，不要替换。',
    ].join('\n')
}

/**
 * 把 Loader 传来的 config 归一化成运行时数据：去掉空词、去重、生成提示词文本。
 * @param {unknown} input - 宿主传入的配置对象（可能来自 schema 解析）。
 * @returns {{enabled: boolean, terms: {word: string, meaning: string}[], glossary: string}} 归一化配置。
 */
export function resolveConfig(input) {
    const source = input !== null && typeof input === 'object' ? input : {}
    const rawTerms = Array.isArray(source.terms) ? source.terms : DEFAULT_TERMS
    const seen = new Set()
    const terms = []
    for (const term of rawTerms) {
        if (!term || typeof term.word !== 'string') continue
        const word = term.word.trim()
        const meaning = typeof term.meaning === 'string' ? term.meaning.trim() : ''
        if (word === '' || meaning === '' || seen.has(word)) continue
        seen.add(word)
        terms.push({ word, meaning })
    }
    return {
        enabled: source.enabled !== false && terms.length > 0,
        terms,
        glossary: source.enabled !== false && terms.length > 0 ? buildGlossaryText(terms) : '',
    }
}
