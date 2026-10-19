/**
 * dsh-ottosmother — Client 半（Web）
 *
 * 在设置侧边栏注册「黑话词表」页面：
 * - 总开关、提醒强度（quiet / normal / strong）；
 * - 已加载的词表文件清单，每项可单独启停；
 * - 打开个人词表目录（~/.dsh/ottosmother）与内置分类目录的按钮。
 *
 * 数据来源：host 侧两条 exact 路由（catalog / reveal），页面不直接读文件系统。
 * 写入走官方 settings 服务（ctx.configForms）：字段带 `.volatile()`，改完即时生效。
 *
 * 约束：本文件是宿主直接装载的零构建产物（window.__ModuleLoader__.load），只
 * require 平台表内的 'react'，样式只用 `--dsw-alias-*` token。
 */
window.__ModuleLoader__.load({
  id: 'dsh-ottosmother',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState, useSyncExternalStore } = React

    /** 设置命名空间 = 本插件在 profile 里的条目 id。 */
    const NAMESPACE = 'dsh-ottosmother'
    /** 页面文案的 locale 命名空间。 */
    const LOCALE_NS = 'dsh-ottosmother'
    const STYLE_ID = 'dsh-ottosmother-settings-css'
    const CATALOG_PATH = 'dsh-ottosmother/catalog'
    const REVEAL_PATH = 'dsh-ottosmother/reveal'

    /** 提醒强度档位；id 必须与 host 侧 REMINDER_LEVELS 一致。 */
    const REMINDER_OPTIONS = Object.freeze([
      Object.freeze({ id: 'quiet', zh: '轻', en: 'Quiet' }),
      Object.freeze({ id: 'normal', zh: '中', en: 'Normal' }),
      Object.freeze({ id: 'strong', zh: '强', en: 'Strong' }),
    ])
    const DEFAULT_REMINDER = 'normal'

    const DICT = {
      zh: {
        nav: '黑话词表',
        title: '黑话词表',
        desc: '词表只写进系统提示词：模型按词表理解你的话，也按词表说出它们。这里可以开关整组词表、调整提醒强度、打开词表文件夹。',
        enabled: '启用词表',
        enabledHint: '关闭后不再向模型注入这些词。',
        reminder: '提醒强度',
        reminderHint: '模型主动使用这些词的力度。',
        'reminder-quiet': '轻',
        'reminder-normal': '中',
        'reminder-strong': '强',
        categories: '词表分类',
        categoriesHint: '勾选即启用该分类，取消勾选即停用；改 YAML 后点刷新即可生效。',
        fileOn: '已启用',
        fileOff: '已关闭',
        folders: '词表文件夹',
        userDir: '个人词表（把你的 YAML 放这里）',
        builtinDir: '内置分类词表',
        openFolder: '打开文件夹',
        refresh: '刷新',
        loading: '正在读取词表…',
        empty: '还没有词表文件。',
        saveFailed: '保存失败，请重试',
        loadFailed: '读取词表失败',
        terms: '条词条',
      },
      en: {
        nav: 'Glossary',
        title: 'Glossary',
        desc: 'The glossary only goes into the system prompt: the model reads your words with it and speaks them back. Toggle groups, pick a reminder strength, or open the folder.',
        enabled: 'Enable glossary',
        enabledHint: 'When off, none of these words reach the model.',
        reminder: 'Reminder strength',
        reminderHint: 'How strongly the model is nudged to use the words.',
        'reminder-quiet': 'Quiet',
        'reminder-normal': 'Normal',
        'reminder-strong': 'Strong',
        categories: 'Glossary files',
        categoriesHint: 'Check a group to use it, uncheck to disable it; refresh after editing YAML.',
        fileOn: 'On',
        fileOff: 'Off',
        folders: 'Folders',
        userDir: 'Personal glossary (put your YAML here)',
        builtinDir: 'Built-in groups',
        openFolder: 'Open folder',
        refresh: 'Refresh',
        loading: 'Reading glossary…',
        empty: 'No glossary files yet.',
        saveFailed: 'Save failed, retry',
        loadFailed: 'Failed to read glossary',
        terms: 'terms',
      },
    }

    const CSS = [
      '.dot-page{padding:0;display:flex;flex-direction:column;gap:16px}',
      '.dot-header{display:flex;flex-direction:column;gap:6px}',
      '.dot-title{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px;margin:0}',
      '.dot-desc{color:var(--dsw-alias-label-primary);opacity:.6;font-size:12px;line-height:18px;margin:0}',
      '.dot-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column}',
      '.dot-row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dot-row:last-child{border-bottom:none}',
      '.dot-rowButton{width:100%;text-align:left;border:0;border-bottom:.5px solid var(--dsw-alias-border-l2);background:transparent;font:inherit;color:inherit;cursor:pointer}',
      '.dot-rowButton:last-child{border-bottom:none}',
      '.dot-rowButton:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dot-rowButton:disabled{cursor:default;opacity:.6}',
      '.dot-native{flex:none;width:18px;height:18px;margin:0;accent-color:#4c7dff;cursor:pointer}',
      '.dot-rowOff .dot-rowTitle{opacity:.55}',
      '.dot-state{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);opacity:.6}',
      '.dot-rowText{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}',
      '.dot-rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.dot-rowHint{color:var(--dsw-alias-label-primary);opacity:.6;font-size:12px;line-height:18px}',
      '.dot-switch{position:relative;flex:none;width:36px;height:20px;border-radius:10px;border:none;padding:0;cursor:pointer;background:var(--dsw-alias-border-l2);transition:background .15s}',
      '.dot-switchOn{background:#4c7dff}',
      '.dot-switch:disabled{cursor:default;opacity:.5}',
      '.dot-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}',
      '.dot-switchOn .dot-knob{transform:translateX(16px)}',
      '.dot-segments{display:flex;flex:none;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);padding:2px;gap:2px}',
      '.dot-segment{border:none;border-radius:calc(var(--dsw-radius-md) - 2px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:20px;padding:2px 12px;cursor:pointer}',
      '.dot-segment:disabled{cursor:default;opacity:.5}',
      '.dot-segmentOn{background:var(--dsw-alias-bg-module-platform);font-weight:500}',
      '.dot-fileMeta{color:var(--dsw-alias-label-primary);opacity:.6;font-size:12px;line-height:18px}',
      '.dot-folderPath{margin:0;color:var(--dsw-alias-label-primary);opacity:.6;font-size:12px;line-height:18px;word-break:break-all}',
      '.dot-link{border:none;background:transparent;color:var(--dsw-alias-text-accent);font:inherit;font-size:12px;line-height:18px;padding:0;cursor:pointer;flex:none}',
      '.dot-link:disabled{cursor:default;opacity:.5}',
      '.dot-error{color:var(--dsw-alias-text-danger);font-size:12px;line-height:18px;margin:0}',
      '.dot-warning{color:var(--dsw-alias-text-warning);font-size:12px;line-height:18px;margin:0;word-break:break-all}',
      '.dot-empty{color:var(--dsw-alias-label-primary);opacity:.6;font-size:12px;line-height:18px;padding:12px 16px}',
    ].join('')

    /** 注入页面样式（幂等：同一标签只插一次）。 */
    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-ottosmother'
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** 相对路径 → 宿主同源 API 路径（与 dshmarket 的 api() 同构）。 */
    function api(relative) {
      return new URL(relative, document.baseURI).pathname
    }

    /** 读取词表快照。 */
    async function loadCatalog() {
      const response = await fetch(api(CATALOG_PATH), { cache: 'no-store' })
      if (!response.ok) throw new Error(`${DICT.zh.loadFailed} (${response.status})`)
      return response.json()
    }

    /** 请求宿主打开词表目录。 */
    async function requestReveal(target) {
      const response = await fetch(api(REVEAL_PATH), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
      })
      if (!response.ok) throw new Error(`${DICT.zh.loadFailed} (${response.status})`)
      return response.json()
    }

    /**
     * 从 configForms 快照取提醒强度（未就绪或非法值返回 undefined）。
     * @param snapshot - configForms 快照。
     */
    function readReminder(snapshot) {
      const raw = snapshot?.value?.reminder
      if (typeof raw !== 'string') return undefined
      const normalized = raw.trim().toLowerCase()
      return REMINDER_OPTIONS.some((option) => option.id === normalized) ? normalized : undefined
    }

    /**
     * 从 configForms 快照取提醒强度（与 host 侧归一规则一致）。
     * @param snapshot - configForms 快照。
     */
    function pickReminder(snapshot) {
      return readReminder(snapshot) ?? DEFAULT_REMINDER
    }

    /**
     * 开关按钮。
     * @param props - checked / disabled / label / onChange。
     */
    function Switch({ checked, disabled, label, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked,
          'aria-label': label,
          className: checked ? 'dot-switch dot-switchOn' : 'dot-switch',
          disabled,
          onClick: onChange,
        },
        h('span', { className: 'dot-knob', 'aria-hidden': true }),
      )
    }

    /**
     * 「黑话词表」设置页面。
     * @param props - slot props（含 t）与闭包注入的 form。
     */
    function OttosmotherSection({ form, t }) {
      const translate = useCallback(
        (key) => (typeof t === 'function' ? t(key) : DICT.zh[key] ?? key),
        [t],
      )
      const subscribe = useCallback((onChange) => form.subscribe(onChange), [form])
      const getSnapshot = useCallback(() => form.getSnapshot(), [form])
      const snapshot = useSyncExternalStore(subscribe, getSnapshot)
      const writable = snapshot?.writable === true

      const [catalog, setCatalog] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)

      const reload = useCallback(async () => {
        try {
          setCatalog(await loadCatalog())
          setError(null)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }, [])

      useEffect(() => {
        void reload()
      }, [reload])

      const write = useCallback(
        async (field, value) => {
          setBusy(true)
          try {
            const accepted = await form.set(field, value)
            if (accepted === false) setError(translate('saveFailed'))
            else setError(null)
            await reload()
          } catch {
            setError(translate('saveFailed'))
          } finally {
            setBusy(false)
          }
        },
        [form, reload, translate],
      )

      const disabled = busy || !writable
      const enabled =
        typeof snapshot?.value?.enabled === 'boolean' ? snapshot.value.enabled : (catalog?.enabled ?? true)
      const reminder = readReminder(snapshot) ?? catalog?.reminder ?? DEFAULT_REMINDER
      const files = Array.isArray(catalog?.files) ? catalog.files : []
      const warnings = Array.isArray(catalog?.warnings) ? catalog.warnings : []
      /** 快照里的禁用清单（写入后立即更新，不依赖 catalog 重读）。 */
      const disabledIds = useMemo(() => {
        const value = snapshot?.value
        const list = value !== null && typeof value === 'object' ? value.disabledGlossaries : undefined
        return Array.isArray(list) ? new Set(list.filter((item) => typeof item === 'string')) : null
      }, [snapshot])
      const isFileOn = (file) => (disabledIds === null ? file.enabled : !disabledIds.has(file.id))

      const toggleFile = (file) => {
        const off = new Set(files.filter((item) => !isFileOn(item)).map((item) => item.id))
        if (isFileOn(file)) off.add(file.id)
        else off.delete(file.id)
        void write('disabledGlossaries', [...off])
      }

      const open = async (target) => {
        setBusy(true)
        try {
          await requestReveal(target)
          setError(null)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }

      const rows = files.map((file) => {
        const on = isFileOn(file)
        return h(
          'label',
          {
            key: file.id,
            className: on ? 'dot-row dot-rowButton' : 'dot-row dot-rowButton dot-rowOff',
          },
          h('input', {
            type: 'checkbox',
            className: 'dot-native',
            checked: on,
            disabled,
            'aria-label': file.title,
            onChange: () => toggleFile(file),
          }),
          h(
            'div',
            { className: 'dot-rowText' },
            h('div', { className: 'dot-rowTitle' }, file.title),
            h(
              'div',
              { className: 'dot-fileMeta' },
              `${file.file} · ${file.count} ${translate('terms')}${file.description ? ` · ${file.description}` : ''}`,
            ),
          ),
          h('span', { className: 'dot-state' }, translate(on ? 'fileOn' : 'fileOff')),
        )
      })

      return h(
        'section',
        { className: 'dot-page' },
        h(
          'div',
          { className: 'dot-header' },
          h('h2', { className: 'dot-title' }, translate('title')),
          h('p', { className: 'dot-desc' }, translate('desc')),
        ),
        h(
          'div',
          { className: 'dot-card' },
          h(
            'div',
            { className: 'dot-row' },
            h(
              'div',
              { className: 'dot-rowText' },
              h('div', { className: 'dot-rowTitle' }, translate('enabled')),
              h('div', { className: 'dot-rowHint' }, translate('enabledHint')),
            ),
            h(Switch, {
              checked: enabled,
              disabled,
              label: translate('enabled'),
              onChange: () => void write('enabled', !enabled),
            }),
          ),
          h(
            'div',
            { className: 'dot-row' },
            h(
              'div',
              { className: 'dot-rowText' },
              h('div', { className: 'dot-rowTitle' }, translate('reminder')),
              h('div', { className: 'dot-rowHint' }, translate('reminderHint')),
            ),
            h(
              'div',
              { className: 'dot-segments', role: 'group', 'aria-label': translate('reminder') },
              REMINDER_OPTIONS.map((option) =>
                h(
                  'button',
                  {
                    key: option.id,
                    type: 'button',
                    className:
                      option.id === reminder ? 'dot-segment dot-segmentOn' : 'dot-segment',
                    disabled,
                    'aria-pressed': option.id === reminder,
                    onClick: () => void write('reminder', option.id),
                  },
                  translate('reminder-' + option.id),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dot-header' },
          h('h3', { className: 'dot-title' }, translate('categories')),
          h('p', { className: 'dot-desc' }, translate('categoriesHint')),
        ),
        h(
          'div',
          { className: 'dot-card' },
          rows.length > 0
            ? rows
            : h('div', { className: 'dot-empty' }, translate('empty')),
        ),
        h(
          'div',
          { className: 'dot-header' },
          h('h3', { className: 'dot-title' }, translate('folders')),
        ),
        h(
          'div',
          { className: 'dot-card' },
          h(
            'div',
            { className: 'dot-row' },
            h(
              'div',
              { className: 'dot-rowText' },
              h('div', { className: 'dot-rowTitle' }, translate('userDir')),
              h('p', { className: 'dot-folderPath' }, catalog?.userDir ?? ''),
            ),
            h(
              'button',
              { type: 'button', className: 'dot-link', disabled, onClick: () => void open('user') },
              translate('openFolder'),
            ),
          ),
          h(
            'div',
            { className: 'dot-row' },
            h(
              'div',
              { className: 'dot-rowText' },
              h('div', { className: 'dot-rowTitle' }, translate('builtinDir')),
              h('p', { className: 'dot-folderPath' }, catalog?.builtinDir ?? ''),
            ),
            h(
              'button',
              { type: 'button', className: 'dot-link', disabled, onClick: () => void open('builtin') },
              translate('openFolder'),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dot-card' },
          h(
            'div',
            { className: 'dot-row' },
            h(
              'button',
              { type: 'button', className: 'dot-link', disabled, onClick: () => void reload() },
              translate('refresh'),
            ),
          ),
        ),
        warnings.map((warning) =>
          h('p', { key: warning, className: 'dot-warning' }, warning),
        ),
        error !== null ? h('p', { className: 'dot-error' }, error) : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      /**
       * 注册设置页面与文案。
       * @param ctx - client cordis 上下文。
       */
      apply(ctx) {
        ctx.effect(() => {
          ensureStyles()
          return () => {
            if (typeof document === 'undefined') return
            document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]')?.remove()
          }
        }, 'dsh-ottosmother: settings page styles')

        const form = ctx.configForms.get(NAMESPACE)
        ctx.effect(() => ctx.locale.register(LOCALE_NS, DICT), 'dsh-ottosmother: dictionary')
        /** 组件身份在 apply 期固定（form 经闭包注入，避免每次渲染重挂）。 */
        const Section = (props) => h(OttosmotherSection, { ...props, form })
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'ottosmother',
              order: 22,
              label: () => ctx.locale.bind(LOCALE_NS)('nav'),
              locale: LOCALE_NS,
            },
            Section,
          ),
        )
      },
      /** 供单测锁定：页面读写用的路径与档位表。 */
      _internals: { REMINDER_OPTIONS, pickReminder, readReminder, api },
    }
  },
})
