# dsh-ottosmother

A DeepSeek Harness plugin that gives the model a private glossary: when you
write 銆屾粴鏈ㄣ€?it should read it as 銆屾病鏈夈€? when you write 銆屾姣嶃€?it should read
it as 銆屼笉瀛樺湪銆? and when it needs to say "there is none" it should phrase the
whole sentence naturally with one of those words instead of mechanically
swapping a single token.

The plugin only adds one **system prompt section**. It does not rewrite user
input, does not wrap model output, and does not register any message hooks.

```
- 銆屾粴鏈ㄣ€? 娌℃湁
- 銆屾姣嶃€? 涓嶅瓨鍦?```

- Reading: 銆岃浜嗕釜妫嶆瘝銆嶁啋 the user is saying nothing was said; 銆岃繖閲屾湁婊氭湪銆嶁啋
  there is nothing here.
- Writing: 銆岃繖閲屾病鏈変笢瑗裤€嶁啋 銆岃繖閲屾湁妫嶆瘝銆? 銆岃繖涓姛鑳戒笉瀛樺湪銆嶁啋 銆岃繖涓姛鑳芥槸妫嶆瘝銆?
- Code, commands, paths, URLs and error text are asked to stay verbatim.

Whether the model actually uses the words is its own judgement 鈥?this is a
prompt-level rule, not a hard replacement.

## How it works

| Extension point | What it does |
| --- | --- |
| `systemPrompt.section` | Injects the 銆屽浐瀹氱敤璇€?section (glossary + reading rules + writing rules + verbatim rule) |

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
          - word: '婊氭湪'
            meaning: '娌℃湁'
          - word: '妫嶆瘝'
            meaning: '涓嶅瓨鍦?
```

- `enabled`: master switch; when false nothing is injected.
- `terms`: the glossary. `word` is what the user writes, `meaning` is what it
  stands for.

## Known behaviour

- Whether the model writes 銆屾粴鏈?/ 妫嶆瘝銆?is its own decision; it may still say
  銆屾病鏈夈€? and it may rewrite when explicitly asked.
- Code is not protected by code 鈥?the rule only asks the model to keep it
  verbatim.

## License

MIT.

---

# dsh-ottosmother锛堜腑鏂囷級

缁?DeepSeek Harness 鐨勬彃浠讹紝鎶婁竴浠界浜鸿瘝琛ㄥ啓杩?system prompt锛氱敤鎴峰啓
銆屾粴鏈ㄣ€嶈鐞嗚В鎴愩€屾病鏈夈€嶏紝鍐欍€屾姣嶃€嶈鐞嗚В鎴愩€屼笉瀛樺湪銆嶏紱妯″瀷瑕佽〃杈俱€屾病鏈?/
涓嶅瓨鍦ㄣ€嶆椂锛岀敤杩欎簺璇嶆妸鏁村彞鏀瑰啓寰楄嚜鐒堕€氶『锛岃€屼笉鏄満姊版墸鎺変袱涓瓧鍐嶅涓€涓瘝銆?
鎻掍欢鍙姞涓€涓?**system prompt 娈佃惤**锛氫笉鏀圭敤鎴疯緭鍏ャ€佷笉鍖呰妯″瀷杈撳嚭銆佷笉娉ㄥ唽浠讳綍
娑堟伅閽╁瓙銆?
- **鐞嗚В鐢ㄦ埛**锛氥€岃繖閲屾湁婊氭湪銆嶁啋 鐞嗚В涓恒€岃繖閲屼粈涔堜篃娌℃湁銆嶏紱銆岃浜嗕釜妫嶆瘝銆嶁啋
  鐞嗚В涓恒€屼粈涔堜篃娌¤銆嶃€?- **妯″瀷鍥炲**锛氳琛ㄨ揪銆屾病鏈?/ 涓嶅瓨鍦ㄣ€嶆椂锛岃嚜宸辨妸鏁村彞鏀瑰啓閫氶『锛屼緥濡?  銆岃繖閲屾病鏈変笢瑗裤€嶁啋銆岃繖閲屾湁妫嶆瘝銆嶏紝鑰屼笉鏄€岃繖閲屾粴鏈ㄤ笢瑗裤€嶈繖绉嶇敓纭粨鏋溿€?- 浠ｇ爜銆佸懡浠ゃ€佽矾寰勩€乁RL銆佹姤閿欎俊鎭姹傚師鏍蜂繚鐣欍€?
妯″瀷鏄惁鐪熺殑浣跨敤杩欎簺璇嶏紝鏄ā鍨嬭嚜宸辩殑鍒ゆ柇鈥斺€旇繖鏄彁绀鸿瘝灞傞潰鐨勮鍒欙紝涓嶆槸纭浛鎹€?
## 鐢熸晥鏂瑰紡

| 鎵╁睍鐐?| 鍋氫粈涔?|
| --- | --- |
| `systemPrompt.section` | 娉ㄥ叆銆屽浐瀹氱敤璇€嶈鏄庯紙璇嶅吀 + 鐞嗚В瑙勫垯 + 琛ㄨ揪瑙勫垯 + 浠ｇ爜鍘熸牱瑙勫垯锛?|

娈佃惤鍚?`dsh-ottosmother/glossary`锛宱rder 50銆傛枃鏈敱鍑芥暟鎻愪緵锛屾瘡娆＄粍瑁?prompt
鏃剁幇璇婚厤缃紱鎻掍欢鍏抽棴鎴栬瘝琛ㄤ负绌烘椂杩斿洖绌轰覆锛岀瓑浠蜂簬涓嶆敞鍏ャ€?
## 瀹夎

```sh
dsh plugin --profile <profile> add dsh-ottosmother
```

鎴栦粠 GitHub 瀹夎锛?
```sh
dsh plugin --profile <profile> add github:hj9178/dsh-ottosmother
```

瀹夎鍚庨噸鍚?harness 鐢熸晥銆?
## 閰嶇疆

鍦?profile 鐨?`cordis.patch.yml` 閲岃皟鏁达細

```yaml
- insert:
    - id: dsh-ottosmother
      name: 'dsh-ottosmother'
      inject: [systemPrompt]
      config:
        enabled: true
        terms:
          - word: '婊氭湪'
            meaning: '娌℃湁'
          - word: '妫嶆瘝'
            meaning: '涓嶅瓨鍦?
```

- `enabled`锛氭€诲紑鍏筹紝鍏虫帀鍚庝笉娉ㄥ叆浠讳綍鍐呭銆?- `terms`锛氳瘝琛紝`word` 鏄敤鎴峰啓鐨勮嚜閫犺瘝锛宍meaning` 鏄畠浠ｈ〃鐨勫惈涔夈€?
## 宸茬煡琛屼负

- 妯″瀷鏄惁鐢ㄣ€屾粴鏈?/ 妫嶆瘝銆嶈〃杈剧敱妯″瀷鑷繁鍒ゆ柇锛屽彲鑳藉伓灏旇鎴愩€屾病鏈夈€嶃€?- 浠ｇ爜娌℃湁琚唬鐮佷繚鎶も€斺€旇鍒欏彧鏄姹傛ā鍨嬭嚜宸变繚鎸佸師鏂囥€?
## License

MIT銆?