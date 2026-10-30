# dsh-ottosmother

给 DeepSeek Harness 的插件，把一份私人词表写进 system prompt：用户写
「滚木」要理解成「没有」，写「棍母」要理解成「不存在」；模型要表达「没有 /
不存在」时，用这些词把整句组织得自然通顺，而不是机械扣掉两个字再塞一个词。

插件只加一个 **system prompt 段落**：不改用户输入、不包装模型输出。设置界面里可以
直接管理词表文件、总开关和提醒强度，不用手改 YAML。另有一个旁路的输入检测钩子：
每轮用户输入调用一次模型，把用户明确声明的词条收进本地词表（见「自动学习」）。

## 结构

```
glossaries/         # 包内分类词表（moba、fps、comments、ai、dev、private）
lib/config.js       # schema、YAML 解析、提示词生成、设置页快照
lib/prompt.js       # system prompt 段落注册
lib/learn.js        # 自动学习：每轮输入调用一次模型提取词条
lib/routes.js       # 设置页用的两条本地路由
lib/index.js        # 插件入口
client.js           # 设置页（设置 → dsh-ottosmother）
```

## 词表

词表放在 YAML 文件里，不写死在代码里。包内每个分类一个文件
（`glossaries/*.yaml`），自己的文件放 `~/.dsh/ottosmother/`（设置页首次打开
文件夹时自动创建）。所有文件格式一致：

```yaml
title: 我的词表            # 提示词里的分组标题
description: 说明           # 设置页里显示的说明
terms:
  - word: 滚木
    meaning: 没有
  - word: 棍母
    meaning: 不存在
```

根节点直接是 `{ word, meaning }` 数组的写法也接受。文件 mtime/size 变化时下次
组装自动重读，改完下一轮对话即生效。提示词本身只有词表和通用规则（按含义理解、
需要时用这些词表达、代码 / 命令 / 路径 / URL / 报错原文保持原样），不写死任何
例句——某个词具体该怎么理解，交给模型自己判断。

## 设置页

`设置 → dsh-ottosmother`（`settings.section` 槽位）：

- 总开关和提醒强度（`quiet` / `normal` / `strong`）；
- 每个已加载词表文件一个开关（关掉的文件仍列在清单里，只是不注入）；
- 个人词表目录和包内目录，各带一个「打开文件夹」按钮；
- 刷新按钮，以及读取失败 / YAML 损坏的提示列表；
- 自动学习开关（关掉后不再每轮调用模型提取词条）。

设置通过 `configForms` 写入，改完即时生效，不用重载插件。页面只调用两条
exact 路由：

| 路由 | 方法 | 用途 |
| --- | --- | --- |
| `/dsh-ottosmother/catalog` | GET | JSON 快照：文件清单、词条数、开关、目录、警告 |
| `/dsh-ottosmother/reveal` | POST | 创建并在系统文件管理器打开词表目录 |

两条路由都做同源校验：只接受 loopback host，跨站请求返回 403，且不通过路由写
任何词表内容。

## 自动学习

每轮用户输入都会旁路调用一次当前模型，判断用户有没有明确提出「X 是 Y 的意思」
这类声明：

- 有的话，把词条写入个人词表目录下的 `learned.yaml`（不存在时自动创建，标题
  「自动学习」）；
- 同一个词已存在时跳过；同一句话只学一次；
- 模型调用上限 20 秒，失败只记日志，不影响对话；
- 学习文件就是普通词表，下一轮组装 prompt 时自动生效。

用宿主默认模型调用，不需要额外配 provider / model；不想要这次调用就把配置里的
`autoLearn` 设为 `false`。

## 生效方式

| 扩展点 | 做什么 |
| --- | --- |
| `systemPrompt.section` | 注入「私密词表」段落：词表 + 通用理解/表达规则 |
| `agent/pre-step` | 每轮输入旁路调用一次模型，提取明确声明的词条写进个人词表 |
| `settings.section`（客户端） | 渲染设置页 |
| `webServer`（exact 路由） | 提供词表快照与打开文件夹 |

段落名 `dsh-ottosmother/glossary`，order 50。文本由函数提供，每次组装 prompt
时现读配置；插件关闭或词表为空时返回空串，等价于不注入。YAML 损坏只记一次
日志，不会让会话崩溃。

## 安装

```sh
dsh plugin --profile <profile> add dsh-ottosmother
```

或从 GitHub / Release 安装：

```sh
dsh plugin --profile <profile> add https://github.com/hj9178/dsh-ottosmother/releases/download/v0.7.0/dsh-ottosmother-0.7.0.tgz
dsh plugin --profile <profile> add github:hj9178/dsh-ottosmother
```

安装后重启 harness 生效。

## 配置

设置页写入的就是这些字段，也可以写在 profile 的 `cordis.patch.yml` 里：

```yaml
- insert:
    - id: dsh-ottosmother
      name: 'dsh-ottosmother'
      inject: [systemPrompt, llm]
      config:
        enabled: true
        reminder: normal
        disabledGlossaries: []
        glossaryDirs: []
        autoLearn: true
        learnFile: learned.yaml
        userDir: ''
        terms: []
```

- `enabled`：总开关，关掉后不注入任何内容。
- `reminder`：提醒强度。`quiet` 只给词表加一行；`normal` 说明理解与表达；
  `strong` 明确要求模型主动使用这些词。
- `disabledGlossaries`：关掉的词表文件 id（`builtin:moba.yaml`、`user:mine.yaml`）。
- `glossaryDirs`：额外扫描的 `.yaml`/`.yml` 词表目录。
- `autoLearn`：每轮用户输入调用一次模型，把「X 是 Y 的意思」这类明确声明写进
  个人词表（默认开）。
- `learnFile`：自动学习写入的文件名（位于个人词表目录内，自动创建，默认
  `learned.yaml`）。
- `userDir`：个人词表目录（留空用 `~/.dsh/ottosmother`）。
- `terms`：内联词条，在文件之后合并（重复项自动去掉）。

设置页字段都声明了 `.volatile()`，在支持的宿主（schemastery ≥ 3.18.3）上改完
即时生效。

## 已知行为

- 模型是否用「滚木 / 棍母」表达由模型自己判断，可能偶尔说成「没有」。
- 代码没有被代码保护——规则只是要求模型自己保持原文。
- 会话里其它 LLM 调用（标题生成等）也会带上这个段落。
- 开启自动学习时，每轮用户输入会多一次模型调用（默认模型，20 秒上限）。
- 设置页需要 harness 的 Web 宿主；纯 headless profile 仍有提示词段落，只是没有
  页面。

## License

MIT。

---

# dsh-ottosmother (English)

A DeepSeek Harness plugin that gives the model a private glossary. The user
writes 「滚木」 meaning 「没有」 and 「棍母」 meaning 「不存在」; the model is told to
read those words as their meaning and, when it needs to express that meaning,
to phrase the whole sentence naturally with a glossary word instead of
mechanically swapping a single token.

The plugin only adds one **system prompt section**. It does not rewrite user
input and does not wrap model output. A graphical settings page lets you manage
the glossary files, the master switch and the reminder strength without editing
YAML by hand. A side hook runs one model call per user turn to collect
explicitly stated glossary entries (see "Auto-learning").

## Layout

```
glossaries/         # bundled category word lists (moba, fps, comments, ai, dev, private)
lib/config.js       # schema, YAML loading, prompt text builder, settings snapshot
lib/prompt.js       # system prompt section registration
lib/learn.js        # auto-learning: one model call per user turn to extract terms
lib/routes.js       # two local HTTP routes for the settings page
lib/index.js        # plugin entry
client.js           # settings page (Settings → dsh-ottosmother)
```

## Word lists

Word lists live in YAML files, not in the code. The package ships one file per
category (`glossaries/*.yaml`); your own files go to `~/.dsh/ottosmother/`
(created on demand by the settings page). Every file has the same shape:

```yaml
title: 我的词表            # group heading in the prompt
description: 说明           # shown in the settings page
terms:
  - word: 滚木
    meaning: 没有
  - word: 棍母
    meaning: 不存在
```

A file whose root is a plain list of `{ word, meaning }` items is accepted too.
File contents are re-read when the file's mtime/size changes, so edits take
effect on the next turn. The prompt itself contains only the glossary and
generic rules (read the word as its meaning, use the words when expressing that
meaning, keep code / commands / paths / URLs / error text verbatim). No example
sentences are hard-coded — how a particular word should be understood is left to
the model.

## Settings page

`Settings → dsh-ottosmother` (a `settings.section` slot):

- master switch and reminder strength (`quiet` / `normal` / `strong`);
- one switch per loaded glossary file (disabled files stay listed but are not
  injected);
- the resolved user directory and the bundled directory, each with an
  "open folder" button;
- a refresh button plus error/warning list for unreadable or broken YAML files;
- an auto-learning switch (turns off the per-turn model call).

Settings are written through `configForms`, so changes apply immediately
without reloading the plugin. The page talks to two exact host routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/dsh-ottosmother/catalog` | GET | JSON snapshot: files, counts, switches, directories, warnings |
| `/dsh-ottosmother/reveal` | POST | Create and open a glossary folder in the OS file manager |

Both routes are same-origin checked: loopback host only, cross-site requests
get 403, and no file content is ever written through them.

## Auto-learning

Every user turn makes one side model call that checks whether the user
explicitly declares something like 「X is Y's meaning」:

- matching entries are appended to `learned.yaml` in the personal glossary
  directory (created on demand, titled 「自动学习」);
- an entry whose word already exists is skipped, and the same message is never
  analysed twice;
- the call is capped at 20 s and failures are only logged — the conversation
  is never blocked;
- the file is an ordinary glossary, so it takes effect on the next turn.

The call uses the host default model, no extra provider / model configuration;
set `autoLearn: false` to opt out.

## How it works

| Extension point | What it does |
| --- | --- |
| `systemPrompt.section` | Injects the 「私密词表」 section: glossary lines + generic reading/writing rules |
| `agent/pre-step` | One side model call per user turn to extract declared entries into the personal glossary |
| `settings.section` (client) | Renders the settings page |
| `webServer` (exact routes) | Serves the catalog snapshot and the reveal action |

Section name `dsh-ottosmother/glossary`, order 50. The text is produced by a
function and re-read from config on every prompt assembly; when the plugin is
disabled or the word list is empty, the section text is an empty string and
nothing is injected. A broken YAML file is logged once instead of crashing the
session.

## Install

```sh
dsh plugin --profile <profile> add dsh-ottosmother
```

Or from the release tarball / GitHub:

```sh
dsh plugin --profile <profile> add https://github.com/hj9178/dsh-ottosmother/releases/download/v0.7.0/dsh-ottosmother-0.7.0.tgz
dsh plugin --profile <profile> add github:hj9178/dsh-ottosmother
```

Restart the harness after installing.

## Config

The settings page writes these fields, and you can also set them in the
profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-ottosmother
      name: 'dsh-ottosmother'
      inject: [systemPrompt, llm]
      config:
        enabled: true
        reminder: normal
        disabledGlossaries: []
        glossaryDirs: []
        autoLearn: true
        learnFile: learned.yaml
        userDir: ''
        terms: []
```

- `enabled`: master switch; when false nothing is injected.
- `reminder`: `quiet` gives the list plus one line; `normal` explains reading
  and writing; `strong` explicitly asks the model to actively use the words.
- `disabledGlossaries`: file ids to switch off (`builtin:moba.yaml`,
  `user:mine.yaml`).
- `glossaryDirs`: extra directories to scan for `.yaml`/`.yml` word lists.
- `autoLearn`: call the model once per user turn and store explicit 「X means Y」
  declarations into the personal glossary (default on).
- `learnFile`: file name written by auto-learning (inside the personal glossary
  directory, created on demand; default `learned.yaml`).
- `userDir`: personal glossary directory (empty = `~/.dsh/ottosmother`).
- `terms`: inline word list, merged after the files (duplicates dropped).

All settings-page fields are declared `.volatile()`, so edits apply immediately
on hosts that support it (schemastery ≥ 3.18.3).

## Known behaviour

- Whether the model writes 「滚木 / 棍母」 is its own decision; it may still say
  「没有」, and it may rewrite when explicitly asked.
- Code is not protected by code — the rule only asks the model to keep it
  verbatim.
- Other LLM calls in the harness (title generation, etc.) receive the same
  system prompt section.
- With auto-learning on, every user turn adds one model call (default model,
  20 s cap).
- The settings page needs the harness Web host; headless profiles still get the
  prompt section, just no page.

## License

MIT.
