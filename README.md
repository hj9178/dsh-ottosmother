# dsh-ottosmother

A DeepSeek Harness plugin that gives the model a private glossary. The user
writes 「滚木」 meaning 「没有」 and 「棍母」 meaning 「不存在」; the model is told to
read those words as their meaning and, when it needs to express that meaning,
to phrase the whole sentence naturally with a glossary word instead of
mechanically swapping a single token.

The plugin only adds one **system prompt section**. It does not rewrite user
input, does not wrap model output, and does not register any message hooks.

## Layout

```
glossary.yml      # the word list (YAML, editable / replaceable)
lib/config.js     # schema, YAML loading, prompt text builder
lib/prompt.js     # system prompt section registration
lib/index.js      # plugin entry
```

The word list lives in `glossary.yml` — not in the code:

```yaml
terms:
  - word: 滚木
    meaning: 没有
  - word: 棍母
    meaning: 不存在
# Add more entries here; the prompt picks them up on the next turn.
```

The prompt itself contains only the glossary and generic rules (read the word
as its meaning, use the words when expressing that meaning, keep code /
commands / paths / URLs / error text verbatim). No example sentences are
hard-coded — how a particular word should be understood is left to the model.

## How it works

| Extension point | What it does |
| --- | --- |
| `systemPrompt.section` | Injects the 「私密词表」 section: glossary lines + generic reading/writing rules |

Section name `dsh-ottosmother/glossary`, order 50. The text is produced by a
function and re-read from config on every prompt assembly; when the plugin is
disabled, the glossary file is missing, or the word list is empty, the section
text is an empty string and nothing is injected. A broken YAML file is logged
once instead of crashing the session.

## Install

```sh
dsh plugin --profile <profile> add dsh-ottosmother
```

Or from GitHub:

```sh
dsh plugin --profile <profile> add github:hj9178/dsh-ottosmother
```

Restart the harness after installing.

## Config

Adjust it in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-ottosmother
      name: 'dsh-ottosmother'
      inject: [systemPrompt]
      config:
        enabled: true
        reminder: normal
        glossary: ''
        terms: []
```

- `enabled`: master switch; when false nothing is injected.
- `reminder`: how strongly the model is nudged. `quiet` gives the list plus one
  line; `normal` explains reading and writing; `strong` explicitly asks the
  model to actively use the words.
- `glossary`: path to an external YAML word list (empty = the bundled
  `glossary.yml`).
- `terms`: inline word list, takes precedence over the YAML file when non-empty.

## Known behaviour

- Whether the model writes 「滚木 / 棍母」 is its own decision; it may still say
  「没有」, and it may rewrite when explicitly asked.
- Code is not protected by code — the rule only asks the model to keep it
  verbatim.
- Other LLM calls in the harness (title generation, etc.) receive the same
  system prompt section.

## License

MIT.

---

# dsh-ottosmother（中文）

给 DeepSeek Harness 的插件，把一份私人词表写进 system prompt：用户写
「滚木」要理解成「没有」，写「棍母」要理解成「不存在」；模型要表达「没有 /
不存在」时，用这些词把整句组织得自然通顺，而不是机械扣掉两个字再塞一个词。

插件只加一个 **system prompt 段落**：不改用户输入、不包装模型输出、不注册任何
消息钩子。

## 结构

```
glossary.yml      # 词表（YAML，可直接编辑或替换）
lib/config.js     # schema、YAML 解析、提示词生成
lib/prompt.js     # system prompt 段落注册
lib/index.js      # 插件入口
```

词表在 `glossary.yml` 里，不写死在代码里：

```yaml
terms:
  - word: 滚木
    meaning: 没有
  - word: 棍母
    meaning: 不存在
# 在这里继续加词条，下一轮对话即生效。
```

提示词本身只有词表和通用规则（按含义理解、需要时用这些词表达、代码 / 命令 /
路径 / URL / 报错原文保持原样），不写死任何例句——某个词具体该怎么理解，交给
模型自己判断。

## 生效方式

| 扩展点 | 做什么 |
| --- | --- |
| `systemPrompt.section` | 注入「私密词表」段落：词表 + 通用理解/表达规则 |

段落名 `dsh-ottosmother/glossary`，order 50。文本由函数提供，每次组装 prompt
时现读配置；插件关闭、词表文件缺失或词表为空时返回空串，等价于不注入。YAML
损坏只记一次日志，不会让会话崩溃。

## 安装

```sh
dsh plugin --profile <profile> add dsh-ottosmother
```

或从 GitHub 安装：

```sh
dsh plugin --profile <profile> add github:hj9178/dsh-ottosmother
```

安装后重启 harness 生效。

## 配置

在 profile 的 `cordis.patch.yml` 里调整：

```yaml
- insert:
    - id: dsh-ottosmother
      name: 'dsh-ottosmother'
      inject: [systemPrompt]
      config:
        enabled: true
        reminder: normal
        glossary: ''
        terms: []
```

- `enabled`：总开关，关掉后不注入任何内容。
- `reminder`：提醒强度。`quiet` 只给词表加一行；`normal` 说明理解与表达；
  `strong` 明确要求模型主动使用这些词。
- `glossary`：外部词表 YAML 路径（留空用包内 `glossary.yml`）。
- `terms`：内联词表，非空时优先于 YAML 文件。

## 已知行为

- 模型是否用「滚木 / 棍母」表达由模型自己判断，可能偶尔说成「没有」。
- 代码没有被代码保护——规则只是要求模型自己保持原文。
- 会话里其它 LLM 调用（标题生成等）也会带上这个段落。

## License

MIT。
