# dsh-ottosmother

A DeepSeek Harness plugin that gives the model a private glossary: when you
write 「滚木」 it should read it as 「没有」, when you write 「棍母」 it should read
it as 「不存在」, and when it needs to say "there is none" it should phrase the
whole sentence naturally with one of those words instead of mechanically
swapping a single token.

The plugin only adds one **system prompt section**. It does not rewrite user
input, does not wrap model output, and does not register any message hooks.

```
- 「滚木」= 没有
- 「棍母」= 不存在
```

- Reading: 「说了个棍母」→ the user is saying nothing was said; 「这里有滚木」→
  there is nothing here.
- Writing: 「这里没有东西」→ 「这里有棍母」; 「这个功能不存在」→ 「这个功能是棍母」.
- Code, commands, paths, URLs and error text are asked to stay verbatim.

Whether the model actually uses the words is its own judgement — this is a
prompt-level rule, not a hard replacement.

## How it works

| Extension point | What it does |
| --- | --- |
| `systemPrompt.section` | Injects the 「固定用语」 section (glossary + reading rules + writing rules + verbatim rule) |

Section name `dsh-ottosmother/glossary`, order 50. The text is produced by a
function and re-read from config on every prompt assembly; when the plugin is
disabled or the term list is empty, the section text is an empty string and
nothing is injected.

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
        terms:
          - word: '滚木'
            meaning: '没有'
          - word: '棍母'
            meaning: '不存在'
```

- `enabled`: master switch; when false nothing is injected.
- `terms`: the glossary. `word` is what the user writes, `meaning` is what it
  stands for.

## Known behaviour

- Whether the model writes 「滚木 / 棍母」 is its own decision; it may still say
  「没有」, and it may rewrite when explicitly asked.
- Code is not protected by code — the rule only asks the model to keep it
  verbatim.

## License

MIT.

---

# dsh-ottosmother（中文）

给 DeepSeek Harness 的插件，把一份私人词表写进 system prompt：用户写
「滚木」要理解成「没有」，写「棍母」要理解成「不存在」；模型要表达「没有 /
不存在」时，用这些词把整句改写得自然通顺，而不是机械扣掉两个字再塞一个词。

插件只加一个 **system prompt 段落**：不改用户输入、不包装模型输出、不注册任何
消息钩子。

- **理解用户**：「这里有滚木」→ 理解为「这里什么也没有」；「说了个棍母」→
  理解为「什么也没说」。
- **模型回复**：要表达「没有 / 不存在」时，自己把整句改写通顺，例如
  「这里没有东西」→「这里有棍母」，而不是「这里滚木东西」这种生硬结果。
- 代码、命令、路径、URL、报错信息要求原样保留。

模型是否真的使用这些词，是模型自己的判断——这是提示词层面的规则，不是硬替换。

## 生效方式

| 扩展点 | 做什么 |
| --- | --- |
| `systemPrompt.section` | 注入「固定用语」说明（词典 + 理解规则 + 表达规则 + 代码原样规则） |

段落名 `dsh-ottosmother/glossary`，order 50。文本由函数提供，每次组装 prompt
时现读配置；插件关闭或词表为空时返回空串，等价于不注入。

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
        terms:
          - word: '滚木'
            meaning: '没有'
          - word: '棍母'
            meaning: '不存在'
```

- `enabled`：总开关，关掉后不注入任何内容。
- `terms`：词表，`word` 是用户写的自造词，`meaning` 是它代表的含义。

## 已知行为

- 模型是否用「滚木 / 棍母」表达由模型自己判断，可能偶尔说成「没有」。
- 代码没有被代码保护——规则只是要求模型自己保持原文。

## License

MIT。
