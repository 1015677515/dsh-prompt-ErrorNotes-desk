/**
 * dsh-prompt-ErrorNotes-desk — Client half.
 *
 * Two small panels hung in `conversation.session.header.utilities` (the header's
 * right-hand utility group, a `list` slot): one edits the prompt, the other shows
 * the categorised error-experience library. Either panel can be switched off.
 *
 * The Client is a pure renderer: every read and write goes to the Host half over
 * the same-origin `/prompt-desk/*` routes. It never touches the filesystem, so
 * nothing here can write outside `$DSH_HOME`.
 *
 * Styling follows the harness plugin rules: only `--dsw-alias-*` and
 * `--dsw-static-*` theme tokens are referenced (a renamed token degrades the look
 * but never breaks rendering), and no host Client package is imported as a module.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-ErrorNotes-desk',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Host route prefix; mirrors BASE in index.js. */
    const BASE = '/prompt-desk';
    const STATE_URL = BASE + '/state';
    const PENDING_URL = BASE + '/pending';

    /**
     * This bundle's build identity.
     *
     * Compared against the `pluginVersion` the Host reports. The two halves are
     * loaded by different machinery (this one is served from `/plugins`, the Host
     * from the profile's node_modules), so after a rebuild one is routinely a
     * version ahead of the other. Saying so outright is better than defending every
     * field against an older peer. Bump it with package.json.
     */
    const CLIENT_VERSION = '0.4.0';

    /** Badge poll interval; the header badge must stay current with both panels shut. */
    const POLL_MS = 10000;

    /**
     * The slug of the leaf-less `其他` group. Mirrors OTHER in index.js.
     *
     * The Host is the authority on the category tree — it ships the whole tree in
     * every payload — so this constant exists only as the fallback for the window
     * where a stale bundle is talking to an older Host that sends no `categories`.
     */
    const OTHER = 'other';

    /**
     * Panel styles. Literal colors appear only as fallbacks *behind* a
     * `--dsw-*` token, never as the primary value.
     */
    const CSS = [
      '.pd-wrap{position:relative;display:inline-flex;align-items:center;gap:4px}',
      /*
       * Header buttons.
       *
       * Opaque `--dsw-static-neutral-*` chrome for the same reason as the panel:
       * a transparent button sitting on the header reads as a floating smudge over
       * a busy wallpaper. Hover/active use the static pair rather than an alias so
       * a glass theme cannot turn them translucent underneath the pointer.
       */
      '.pd-btn{position:relative;display:inline-flex;align-items:center;gap:4px;height:24px;',
      'padding:0 8px;border-radius:6px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);',
      'color:var(--dsw-alias-label-secondary,inherit);',
      'font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}',
      'body[data-ds-dark-theme] .pd-btn{background:var(--dsw-static-neutral-bluish-875,#1e1f26)}',
      '.pd-btn:hover{border-color:var(--dsw-alias-border-l1,rgba(128,128,128,.4))}',
      '.pd-btn[data-on="1"]{color:var(--dsw-alias-label-primary,inherit);',
      'border-color:var(--dsw-alias-border-l1,rgba(128,128,128,.4))}',
      /*
       * The pending badge. Coloured with the business accent rather than a status
       * colour: a draft waiting for review is not an error, and painting it red
       * would train the user to ignore it.
       */
      '.pd-badge{min-width:14px;height:14px;padding:0 3px;border-radius:7px;box-sizing:border-box;',
      'display:inline-flex;align-items:center;justify-content:center;',
      'background:var(--dsw-alias-state-business-primary,#4f8cff);',
      'color:var(--dsw-alias-label-primary-inverted,#fff);font-size:10px;line-height:1}',
      /*
       * Panel surface.
       *
       * Deliberately NOT `--dsw-alias-bg-layer-2`. A liquid-glass theme plugin
       * (dsh-plugin-wallpaper-engine and friends) rewrites that alias on
       * `body[data-we-glass-page]` into a translucent "readability floor + tint @
       * glass alpha" film, so anything painted with it lets the wallpaper show
       * through — the panel would look washed out over a photo.
       *
       * The `--dsw-static-neutral-bluish-*` pair is the theme's own opaque panel
       * colour and, being *static*, is not among the aliases such a theme
       * overrides (verified: the wallpaper plugin declares neither). Fallbacks
       * keep this correct on a host without the pair.
       */
      '.pd-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:560px;',
      'max-height:70vh;overflow:auto;padding:12px;border-radius:10px;box-sizing:border-box;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);',
      'color:var(--dsw-alias-label-primary,inherit);',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)}',
      'body[data-ds-dark-theme] .pd-panel{background:var(--dsw-static-neutral-bluish-875,#1e1f26)}',
      '.pd-title{font-size:12px;font-weight:600;margin:0 0 8px}',
      '.pd-label{display:block;font-size:11px;margin:10px 0 4px;',
      'color:var(--dsw-alias-label-secondary,inherit)}',
      '.pd-path{font-size:10px;opacity:.7;margin:0 0 6px;word-break:break-all}',
      /*
       * Text inputs and textareas: opaque for the same reason, since a translucent
       * field over a wallpaper makes the caret and selection hard to read. The
       * static pair matches the panel it sits on, so the field reads as a well in
       * the panel rather than a second, differently-tinted surface.
       */
      '.pd-area{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:8px;',
      'font-size:12px;font-family:inherit;border-radius:6px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);color:inherit}',
      'body[data-ds-dark-theme] .pd-area{background:var(--dsw-static-neutral-bluish-875,#1e1f26)}',
      '.pd-area::placeholder{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.9))}',
      '.pd-row{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}',
      '.pd-primary{padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;',
      'border:1px solid transparent;background:var(--dsw-alias-state-business-primary,#4f8cff);',
      'color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.pd-ghost{padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:transparent;color:inherit}',
      '.pd-note{font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.pd-fail{font-size:12px;color:var(--dsw-alias-state-business-danger,#d33)}',
      /*
       * The injected-text preview. Monospace because the point of showing it is to
       * let the user judge the exact wording and line breaks the model receives —
       * which a proportional font hides.
       */
      '.pd-mono{margin:0;padding:8px;border-radius:6px;max-height:220px;overflow:auto;',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;',
      'line-height:1.5;white-space:pre-wrap;word-break:break-word;',
      'border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));',
      'background:var(--dsw-static-neutral-bluish-50,#f9fafb)}',
      '.pd-empty{opacity:.6}',
      /* Self-check strip: one line, monospace-ish, ticks and crosses. */
      '.pd-check{font-size:11px;color:var(--dsw-alias-label-secondary,inherit);',
      'border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));',
      'border-bottom:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));',
      'padding:5px 0;margin:0 0 6px;line-height:1.7}',
      '.pd-check b{font-weight:600;color:var(--dsw-alias-label-primary,inherit)}',
      /* Collapsible category group header. */
      '.pd-group{display:flex;align-items:center;gap:6px;width:100%;text-align:left;',
      'cursor:pointer;background:transparent;border:0;color:inherit;',
      'font-size:11px;font-weight:600;padding:6px 0;margin-top:6px;',
      'border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2))}',
      '.pd-group:hover{color:var(--dsw-alias-label-primary,inherit)}',
      '.pd-caret{font-size:9px;opacity:.7;width:9px;display:inline-block}',
      '.pd-count{font-weight:400;opacity:.7}',
      '.pd-err{border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));',
      'padding:6px 0;font-size:12px}',
      '.pd-err-date{font-size:10px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.pd-err-type{font-weight:600}',
      /* Draft cards: a left accent so a queue of drafts reads as actionable. */
      '.pd-draft{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'border-left:3px solid var(--dsw-alias-state-business-primary,#4f8cff);',
      'border-radius:6px;padding:8px;margin:8px 0;box-sizing:border-box}',
      '.pd-select{font-size:11px;padding:3px 6px;border-radius:6px;max-width:100%;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);color:inherit}',
      'body[data-ds-dark-theme] .pd-select{background:var(--dsw-static-neutral-bluish-875,#1e1f26)}',
      '.pd-chip{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'color:var(--dsw-alias-label-secondary,inherit)}',
      '.pd-toggle{display:flex;align-items:flex-start;gap:6px;margin-top:10px;font-size:12px;',
      'cursor:pointer;line-height:1.5}',
      '.pd-toggle input{margin:2px 0 0}',
      '.pd-inline{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}',
    ].join('');

    /** GET the whole state from the Host. */
    async function apiGet() {
      const res = await fetch(STATE_URL, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    /** POST a patch; the Host answers with the resulting state. */
    async function apiPost(patch) {
      const res = await fetch(STATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }

    /**
     * Shared panel behaviour: load on open, draft locally, write on save.
     *
     * Kept as one hook rather than duplicated in both panels so the two can never
     * drift apart in how they read or persist.
     */
    function useDeskData(open) {
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState('');
      const [reloadAt, setReloadAt] = React.useState(0);

      React.useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        apiGet().then(
          (next) => { if (alive) { setData(next); setError(''); } },
          (err) => { if (alive) setError(String(err && err.message ? err.message : err)); },
        );
        return () => { alive = false; };
      }, [open, reloadAt]);

      const reload = React.useCallback(() => setReloadAt((n) => n + 1), []);
      const save = React.useCallback((patch) => apiPost(patch).then(
        (next) => { setData(next); setError(''); return next; },
        (err) => { setError(String(err && err.message ? err.message : err)); return null; },
      ), []);

      return { data, error, reload, save };
    }

    /**
     * The pending-queue badge count.
     *
     * Polled rather than pushed: the Host has no channel to the page, and the
     * alternative — reading the full state on a timer — would re-read AGENTS.md and
     * rebuild the injection preview every tick to learn one integer. The cheap
     * `/pending` route exists exactly for this.
     *
     * Skips ticks while the tab is hidden; a background tab has no reader.
     */
    function usePendingBadge() {
      const [pending, setPending] = React.useState(0);

      const refresh = React.useCallback(() => {
        fetch(PENDING_URL, { headers: { accept: 'application/json' } })
          .then((res) => (res.ok ? res.json() : null))
          .then((payload) => {
            if (payload !== null && payload !== undefined) {
              setPending(Number(payload.pending) || 0);
            }
          })
          .catch(() => { /* a badge is not worth surfacing an error for */ });
      }, []);

      React.useEffect(() => {
        refresh();
        const timer = setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          refresh();
        }, POLL_MS);
        return () => clearInterval(timer);
      }, [refresh]);

      return { pending, refresh };
    }

    /** A header button that toggles one panel, optionally badged. */
    function DeskButton(props) {
      return h('button', {
        type: 'button',
        className: 'pd-btn',
        'data-on': props.open ? '1' : '0',
        'aria-expanded': props.open,
        title: props.title,
        onClick: props.onToggle,
      },
      props.label,
      props.badge > 0 ? h('span', { className: 'pd-badge' }, String(props.badge)) : null);
    }

    /** Shared panel chrome: title, error line, and the open state. */
    function PanelShell(props) {
      if (!props.open) return null;
      return h('div', { className: 'pd-panel', role: 'dialog', 'aria-label': props.title },
        h('div', { className: 'pd-title' }, props.title),
        props.error ? h('div', { className: 'pd-fail' }, '读取失败：' + props.error) : null,
        props.children);
    }

    /**
     * Installation self-check.
     *
     * Every line answers a question a first-time user cannot otherwise answer:
     * whether the Host half is loaded at all, whether the panel is talking to the
     * build it was written against, and whether anything is actually reaching the
     * model. The mismatch case is called out separately because it has a specific
     * fix (refresh the page and reload the profile) and is otherwise baffling.
     */
    function SelfCheck(props) {
      const check = props.check;
      if (!check) return null;
      const mismatch = props.pluginVersion && props.pluginVersion !== CLIENT_VERSION;
      const lines = [
        h('div', { key: 'host' }, '✓ 宿主半边已加载，HTTP 路由可达'),
        h('div', { key: 'paths' },
          '· 状态文件：' + check.statePath),
      ];
      if (mismatch) {
        lines.push(h('div', { key: 'ver', className: 'pd-fail' },
          '⚠ 界面与宿主版本不一致（界面 ' + CLIENT_VERSION + '，宿主 ' + props.pluginVersion
          + '）——请刷新页面；若仍不一致，重载 DSH 配置'));
      } else {
        lines.push(h('div', { key: 'ver' },
          '· 界面与宿主版本一致：' + CLIENT_VERSION));
      }
      lines.push(h('div', { key: 'inj' },
        check.lessonsEnabled === false
          ? '○ 已用 /lessons off 暂停注入（输入 /lessons on 恢复，重载后自动复位）'
          : (check.errorsInjected > 0
            ? '✓ 当前注入 ' + check.errorsInjected + ' 条错误经验'
            : (check.exportToPrompt
              ? '⚠ 错误库导出已开启，但注入 0 条（库为空或条数上限为 0）'
              : '○ 错误库导出已关闭，不注入'))));
      if (check.pendingTotal > 0) {
        lines.push(h('div', { key: 'pend' }, '● 有 ' + check.pendingTotal + ' 条待确认'));
      }
      return h('div', { className: 'pd-check' }, lines);
    }

    /**
     * Every legal category as a flat `{value,label}` list, in the Host's declared order.
     *
     * A group that declares no leaves contributes one option under its own bare id.
     * That is how `其他` appears — as a peer of the two meaningful groups inside the
     * same dropdown, rather than a separate "unfiled" affordance bolted on beside it.
     */
    function categoryOptions(categories) {
      const out = [];
      (categories || []).forEach((group) => {
        const children = group.children || [];
        if (children.length === 0) {
          out.push({ value: group.id, label: group.label });
          return;
        }
        children.forEach((leaf) => {
          out.push({ value: group.id + '/' + leaf.id, label: group.label + ' · ' + leaf.label });
        });
      });
      // A Host that sent no tree at all (an older build during the reload window)
      // still gets a working control rather than an empty select.
      if (out.length === 0) out.push({ value: OTHER, label: '其他' });
      return out;
    }

    /** A `<select>` over the category tree. */
    function CategorySelect(props) {
      return h('select', {
        className: 'pd-select',
        value: props.value || OTHER,
        'aria-label': '分类',
        onChange: (e) => props.onChange(e.target.value),
      }, categoryOptions(props.categories).map((option) => h('option', {
        key: option.value,
        value: option.value,
      }, option.label)));
    }

    /**
     * The label for one category slug.
     *
     * An unrecognised slug falls back to `其他` rather than showing the raw slug,
     * matching what the Host's own `normalizeCategory` would do on the next write —
     * so the label never promises a category the file does not actually hold.
     */
    function categoryLabel(categories, slug) {
      const found = categoryOptions(categories).find((option) => option.value === slug);
      return found === undefined ? '其他' : found.label;
    }

    /**
     * Panel 1 — the prompt.
     *
     * Two textareas on purpose: the global prompt is the harness's own
     * `AGENTS.md` (cross-conversation), while the session prompt is this plugin's
     * own file. Keeping them visually separate is what stops a user from
     * believing a one-off instruction turned permanent.
     *
     * Below them: the export switch and the exact text the plugin contributes,
     * in the order the assembler joins it. "N entries are injected" is a number to
     * trust; the block itself is what the user can actually judge.
     */
    function PromptPanel(props) {
      const open = props.open;
      const { data, error, save } = useDeskData(open);
      const [globalDraft, setGlobalDraft] = React.useState('');
      const [sessionDraft, setSessionDraft] = React.useState('');
      const [status, setStatus] = React.useState('');

      // Seed the drafts whenever a fresh payload arrives.
      React.useEffect(() => {
        if (data === null) return;
        setGlobalDraft(data.globalPrompt || '');
        setSessionDraft(data.sessionPrompt || '');
      }, [data]);

      const commit = (which) => {
        const patch = which === 'global'
          ? { globalPrompt: globalDraft }
          : { sessionPrompt: sessionDraft };
        setStatus('保存中…');
        save(patch).then((next) => setStatus(next === null ? '保存失败' : '已保存'));
      };

      const toggleExport = (next) => {
        setStatus('');
        save({ exportToPrompt: next }).then(() => {
          setStatus(next ? '错误库导出已开启' : '错误库导出已关闭');
          if (props.onStateChanged) props.onStateChanged();
        });
      };

      const togglePause = (next) => {
        setStatus('');
        save({ lessonsEnabled: next }).then(() => {
          setStatus(next ? '已恢复注入' : '已临时暂停注入');
          if (props.onStateChanged) props.onStateChanged();
        });
      };

      const preview = (data && data.preview) || null;

      return h(PanelShell, { open, title: '提示词', error },
        data === null ? h('div', { className: 'pd-note' }, '加载中…') : h(React.Fragment, null,
          h(SelfCheck, {
            check: data.selfCheck,
            pluginVersion: data.pluginVersion,
          }),

          /*
           * The two switches deliberately sit at opposite ends of this panel: the
           * temporary pause here at the top, the durable export switch at the bottom.
           * They overlap — both stop the error library reaching the model — so putting
           * them apart, each with its own explanation, is what stops them being read
           * as one control with two states.
           */
          h('label', { className: 'pd-toggle' },
            h('input', {
              type: 'checkbox',
              checked: !(data.injection && data.injection.lessonsEnabled === false),
              onChange: (e) => togglePause(e.target.checked),
            }),
            h('span', null,
              '临时暂停注入（等同 /lessons off）',
              h('div', { className: 'pd-note' },
                '只停「错误经验列表」；本对话提示词与「自我认错」引导照常生效。'
                + '不写入状态文件，重载后自动恢复为开启。'))),

          h('label', { className: 'pd-label' }, '全局提示词（跨对话，生效于所有工作区）'),
          h('div', { className: 'pd-path' }, data.globalPromptPath || ''),
          h('textarea', {
            className: 'pd-area',
            value: globalDraft,
            spellCheck: false,
            onChange: (e) => setGlobalDraft(e.target.value),
          }),
          h('div', { className: 'pd-row' },
            h('button', { type: 'button', className: 'pd-primary', onClick: () => commit('global') }, '保存全局'),
            h('button', {
              type: 'button', className: 'pd-ghost',
              onClick: () => setGlobalDraft(data.globalPrompt || ''),
            }, '撤销修改')),

          h('label', { className: 'pd-label' }, '本次对话提示词（新对话会延续）'),
          h('textarea', {
            className: 'pd-area',
            value: sessionDraft,
            spellCheck: false,
            onChange: (e) => setSessionDraft(e.target.value),
          }),
          h('div', { className: 'pd-row' },
            h('button', { type: 'button', className: 'pd-primary', onClick: () => commit('session') }, '保存本次'),
            h('button', {
              type: 'button', className: 'pd-ghost',
              onClick: () => { setSessionDraft(''); save({ sessionPrompt: '' }).then(() => setStatus('已清空')); },
            }, '清空'),
            status ? h('span', { className: 'pd-note' }, status) : null),

          h('label', { className: 'pd-label' }, '下一轮实际注入的文本（只读）'),
          preview === null || preview.sectionText === ''
            ? h('div', { className: 'pd-note pd-empty' }, '（当前为空，不会有任何内容注入）')
            : h('pre', { className: 'pd-mono' }, preview.sectionText),
          preview !== null && preview.sectionText !== '' ? h('div', { className: 'pd-note' },
            '以上即为插件对系统提示词的完整贡献，逐字发送给模型。') : null,

          /*
           * The durable switch, at the bottom — the counterpart to the temporary pause
           * at the top. It gates the library AND the confession cue together: the cue
           * exists to feed the library, so leaving it on with the library off would ask
           * the agent to confess into nothing.
           */
          h('label', { className: 'pd-toggle' },
            h('input', {
              type: 'checkbox',
              checked: data.exportToPrompt !== false,
              onChange: (e) => toggleExport(e.target.checked),
            }),
            h('span', null,
              '错误库导出到系统提示词（默认开启，写入状态文件）',
              h('div', { className: 'pd-note' },
                '开启时，错误经验库与「自我认错」句式引导会一起注入每一轮对话；'
                + '关闭后两者都停止注入，错误库仍照常记录与查看。此开关会持久保存。'))),
        ));
    }

    /**
     * One draft in the pending queue.
     *
     * Held in local state until 采纳 or 丢弃: the Host captured a raw confession,
     * and the point of the confirmation step is that the user gets to fix the wording
     * and the category before it becomes a durable entry. Nothing is written to the
     * library until they say so.
     */
    function DraftCard(props) {
      const draft = props.draft;
      const [type, setType] = React.useState(draft.type || '');
      const [lesson, setLesson] = React.useState(draft.lesson || '');
      const [category, setCategory] = React.useState(draft.category || OTHER);
      const [busy, setBusy] = React.useState(false);

      const accept = () => {
        setBusy(true);
        props.onAccept(draft.id, { type, lesson, category }).then(() => setBusy(false));
      };
      const discard = () => {
        setBusy(true);
        props.onDiscard(draft.id).then(() => setBusy(false));
      };

      return h('div', { className: 'pd-draft' },
        h('div', { className: 'pd-err-date' }, '自动捕获 · ' + (draft.date || '')),
        h('input', {
          className: 'pd-area',
          style: { minHeight: 'auto', marginTop: '4px' },
          placeholder: '错在哪（类型）',
          value: type,
          onChange: (e) => setType(e.target.value),
        }),
        h('input', {
          className: 'pd-area',
          style: { minHeight: 'auto', marginTop: '4px' },
          placeholder: '以后怎么避免（一句教训）',
          value: lesson,
          onChange: (e) => setLesson(e.target.value),
        }),
        h('div', { className: 'pd-inline' },
          h('span', { className: 'pd-note' }, '分类'),
          h(CategorySelect, { categories: props.categories, value: category, onChange: setCategory }),
          h('button', {
            type: 'button', className: 'pd-primary',
            disabled: busy,
            onClick: accept,
          }, '采纳'),
          h('button', {
            type: 'button', className: 'pd-ghost',
            disabled: busy,
            onClick: discard,
          }, '丢弃')));
    }

    /**
     * Panel 2 — the categorised error library.
     *
     * Grouped by category rather than by date. A flat, date-sorted list answers
     * "what happened recently", which the user cannot act on; a category group
     * answers "what kind of mistake do I keep making", which names the thing to
     * change. Date still shows on each row, so recency is not lost.
     *
     * Uncategorised entries are shown first and expanded: entries predating
     * categories land there, and hiding them would leave the user with a library
     * that silently ignores its own older half.
     */
    function ErrorsPanel(props) {
      const open = props.open;
      const { data, error, save } = useDeskData(open);
      const [limitDraft, setLimitDraft] = React.useState('');
      const [limitStatus, setLimitStatus] = React.useState('');
      const [collapsed, setCollapsed] = React.useState({});
      const [manualOpen, setManualOpen] = React.useState(false);
      const [manualType, setManualType] = React.useState('');
      const [manualLesson, setManualLesson] = React.useState('');

      const injection = (data && data.injection) || null;
      const categories = (data && data.categories) || [];
      /*
       * A page refresh picks up this Client bundle before the Host process restarts, so
       * for a moment the Host is the older build and the newer accounting fields are
       * simply absent. Normalising here keeps the field from rendering the string
       * "undefined" in that window — and costs nothing once the two match. The version
       * warning in SelfCheck is what tells the user this window exists.
       */
      const customLimit = injection === null || injection.errorLimitCustom === undefined
        ? null
        : injection.errorLimitCustom;
      const defaultLimit = injection === null
        ? 10
        : (injection.errorLimitDefault === undefined ? injection.errorLimit : injection.errorLimitDefault);
      /** Host-declared bounds, so the field cannot drift from what the assembler allows. */
      const bounds = (data && data.limitBounds) || { min: 0, max: 200 };

      // Seed the field from the value actually in force, so what the user reads there
      // is what the prompt assembler is using — not what they last typed.
      React.useEffect(() => {
        if (injection === null) return;
        setLimitDraft(String(injection.errorLimit));
      }, [data]);

      const notify = () => { if (props.onStateChanged) props.onStateChanged(); };

      const commitLimit = () => {
        if (injection === null) return;
        const raw = limitDraft.trim();
        if (raw === '') {
          setLimitStatus('保存中…');
          save({ injectLimit: null }).then((next) => {
            setLimitStatus(next === null ? '保存失败' : '已恢复默认');
            notify();
          });
          return;
        }
        const next = Number(raw);
        if (!Number.isFinite(next) || next < 0) {
          setLimitDraft(String(injection.errorLimit));
          setLimitStatus('只接受 0 或正整数');
          return;
        }
        setLimitStatus('保存中…');
        save({ injectLimit: next }).then((saved) => {
          setLimitStatus(saved === null ? '保存失败' : '已保存');
          notify();
        });
      };

      const addManual = () => {
        if (manualType.trim() === '' && manualLesson.trim() === '') return;
        save({ errorAdd: { type: manualType.trim(), lesson: manualLesson.trim() } }).then((next) => {
          if (next !== null) { setManualType(''); setManualLesson(''); }
          notify();
        });
      };

      const setCategory = (id, value) => {
        save({ errorUpdate: { id, category: value } }).then(notify);
      };

      const removeAt = (id) => {
        save({ errorDelete: id }).then(notify);
      };

      const acceptDraft = (id, fields) => save({
        pendingAccept: { id, type: fields.type, lesson: fields.lesson, category: fields.category },
      }).then(notify);

      const discardDraft = (id) => save({ pendingDelete: id }).then(notify);

      const errors = (data && data.errors) || [];
      const pendings = (data && data.pending) || [];

      /*
       * Group the library in the Host's declared order; an empty group is dropped so
       * the panel is not a wall of headings with nothing under them.
       *
       * A leaf-less group (`其他`) matches by exact slug, because it has no
       * `group/leaf` form to match a prefix against.
       */
      const groups = [];
      categories.forEach((group) => {
        const children = group.children || [];
        const entries = errors.filter((entry) => {
          if (typeof entry.category !== 'string') return false;
          return children.length === 0
            ? entry.category === group.id
            : entry.category.startsWith(group.id + '/');
        });
        if (entries.length > 0) groups.push({ id: group.id, label: group.label, note: group.note, entries });
      });

      /*
       * Safety net. An entry that no declared group claimed — a slug this bundle does
       * not know, or a Host that sent no tree at all — must still be rendered. Making
       * entries silently vanish is the one failure the panel cannot recover from,
       * because the user has no way to tell that data is missing.
       */
      const claimed = new Set();
      groups.forEach((group) => group.entries.forEach((entry) => claimed.add(entry.id)));
      const orphans = errors.filter((entry) => !claimed.has(entry.id));
      if (orphans.length > 0) {
        groups.push({ id: '__unfiled', label: '未归类', note: '分类未知', entries: orphans });
      }

      const toggleGroup = (id) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));

      return h(PanelShell, { open, title: '错误经验库（' + errors.length + ' 条）', error },
        data === null ? h('div', { className: 'pd-note' }, '加载中…') : h(React.Fragment, null,

          /*
           * The pending queue, first and only when non-empty. A draft is a question
           * the plugin is asking, so it belongs above the archive rather than
           * buried under it.
           */
          pendings.length > 0 ? h('div', null,
            h('div', { className: 'pd-label' }, '待确认（' + pendings.length + ' 条，自动捕获）'),
            pendings.map((draft) => h(DraftCard, {
              key: draft.id,
              draft,
              categories,
              onAccept: acceptDraft,
              onDiscard: discardDraft,
            })),
            h('div', { className: 'pd-row' },
              h('button', {
                type: 'button', className: 'pd-ghost',
                onClick: () => save({ pendingClear: true }).then(notify),
              }, '全部丢弃'))) : null,

          errors.length === 0 && pendings.length === 0
            ? h('div', { className: 'pd-note', style: { marginTop: '10px' } },
              '还没有记录。当 agent 按格式汇报（「我发现了个错误：错误经过：… 教训：…」）时会自动出现在上面的待确认区。')
            : null,

          /*
           * Injection accounting comes from the Host, which owns the configured limit
           * and the export switch. Showing it here is the difference between "the
           * library has entries" and "the library is actually reaching the model" —
           * the second is the whole point, and without a readout a user cannot tell
           * the two apart.
           */
          injection !== null && errors.length > 0 ? h('div', {
            className: 'pd-note', style: { marginTop: '10px' },
          },
            injection.lessonsEnabled === false
              ? '已用 /lessons off 暂停注入（输入 /lessons on 恢复；重载后自动复位）'
              : (injection.exportToPrompt === false
                ? '错误库导出已关闭，暂不注入（可在「提示词」面板重新开启）'
                : (injection.errorsInjected === injection.errorsTotal
                  ? '已注入全部 ' + injection.errorsInjected + ' 条（下一轮对话生效）'
                  : '已注入最近 ' + injection.errorsInjected + ' 条，共 ' + injection.errorsTotal + ' 条（下一轮对话生效）'))) : null,

          /*
           * The cap is editable here, not only in Settings: it is the number that
           * decides how much of this library reaches the model, and the person who
           * decides it is looking at the library. Keeping the field inside the panel
           * makes that connection impossible to miss.
           *
           * The bounds and the default come from the Host, so the field cannot drift
           * from what the prompt assembler actually enforces.
           */
          injection === null ? null : h(React.Fragment, null,
            h('label', { className: 'pd-label' }, '注入条数上限'),
            h('div', { className: 'pd-row' },
              h('input', {
                className: 'pd-area',
                style: { minHeight: 'auto', flex: '0 0 96px', width: '96px' },
                type: 'number', inputMode: 'numeric',
                min: bounds.min, max: bounds.max, step: 1,
                value: limitDraft,
                'aria-label': '注入条数上限',
                // Digits only: a minus sign or a decimal point is not a count, and the
                // Host would only have to reject it.
                onChange: (e) => setLimitDraft(e.target.value.replace(/[^0-9]/g, '')),
                onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); commitLimit(); } },
              }),
              h('button', { type: 'button', className: 'pd-primary', onClick: commitLimit }, '保存'),
              injection.errorLimitCustom === null || injection.errorLimitCustom === undefined ? null : h('button', {
                type: 'button', className: 'pd-ghost',
                onClick: () => save({ injectLimit: null }).then(() => { setLimitStatus('已恢复默认'); notify(); }),
              }, '恢复默认'),
              limitStatus ? h('span', { className: 'pd-note' }, limitStatus) : null),
            h('div', { className: 'pd-err-date' },
              '默认 ' + defaultLimit + ' 条'
              + (customLimit === null
                ? '，当前跟随默认。'
                : '，当前为自定义的 ' + customLimit + ' 条。')
              + '条数越多，每轮请求注入的 token 越多，消耗随之增加；填 0 则完全不注入，上限 ' + bounds.max + '。'
              + '清空输入框并保存 = 恢复跟随默认。')),

          /*
           * Category groups. Collapsed state is per-group and defaults to open, so
           * the first look shows the shape of the library rather than a list of
           * closed headings the user has to open one by one.
           */
          groups.map((group) => h('div', { key: group.id },
            h('button', {
              type: 'button',
              className: 'pd-group',
              'aria-expanded': !collapsed[group.id],
              onClick: () => toggleGroup(group.id),
            },
            h('span', { className: 'pd-caret' }, collapsed[group.id] ? '▶' : '▼'),
            h('span', null, group.label),
            group.note ? h('span', { className: 'pd-chip' }, group.note) : null,
            h('span', { className: 'pd-count' }, '（' + group.entries.length + '）')),

            collapsed[group.id] ? null : group.entries.map((entry) => h('div', {
              className: 'pd-err', key: entry.id,
            },
              h('div', { className: 'pd-err-type' }, entry.type || '(未命名)'),
              h('div', null, entry.lesson || ''),
              // The stored `detail` is what the one-sentence lesson was distilled
              // from. It is deliberately not injected into the prompt (that would
              // cost the tokens the lesson exists to save) but is worth keeping
              // readable here, so it renders as a muted note when present.
              entry.detail ? h('div', { className: 'pd-err-date' }, entry.detail) : null,
              h('div', { className: 'pd-inline' },
                h('span', { className: 'pd-err-date' }, (entry.date || '') + ' · ' + categoryLabel(categories, entry.category)),
                h(CategorySelect, {
                  categories,
                  value: entry.category,
                  onChange: (value) => setCategory(entry.id, value),
                }),
                h('button', {
                  type: 'button', className: 'pd-ghost',
                  onClick: () => removeAt(entry.id),
                }, '删除')))))),

          /*
           * Manual entry, behind a disclosure.
           *
           * The always-visible row it replaces made the panel read as a form to fill
           * in rather than a record to review, and automatic capture is now the main
           * way entries arrive. It is kept reachable because capture only fires on a
           * confession, and a mistake the user notices and the agent does not would
           * otherwise have nowhere to go.
           */
          h('div', { className: 'pd-row' },
            h('button', {
              type: 'button', className: 'pd-ghost',
              onClick: () => setManualOpen((v) => !v),
            }, manualOpen ? '收起手动新增' : '+ 手动新增一条')),
          manualOpen ? h('div', null,
            h('input', {
              className: 'pd-area', style: { minHeight: 'auto', marginTop: '6px' },
              placeholder: '类型，如：把“没读到”当成“不存在”',
              value: manualType, onChange: (e) => setManualType(e.target.value),
            }),
            h('input', {
              className: 'pd-area', style: { minHeight: 'auto', marginTop: '6px' },
              placeholder: '一句教训，如：声称完成前先独立复核产物存在',
              value: manualLesson, onChange: (e) => setManualLesson(e.target.value),
            }),
            h('div', { className: 'pd-row' },
              h('button', { type: 'button', className: 'pd-primary', onClick: addManual }, '添加'),
              h('span', { className: 'pd-note' }, '新条目先落在「其他」，可在上面用下拉框归档'))) : null,
        ));
    }

    /**
     * The header entry: both buttons and both panels in ONE registration.
     *
     * Why one registration instead of two: the two panels must be mutually
     * exclusive — opening one closes the other. With a separate registration each
     * panel would own its own `useState`, and two independent booleans cannot
     * express "at most one open" without a shared store bolted on top. Holding
     * `openPanel` here makes the exclusivity structural: there is exactly one
     * piece of state, so two panels cannot both be open by construction.
     *
     * The trade-off is that the two buttons cannot be reordered independently. In
     * exchange, no cross-component subscription can desync, and no panel can
     * survive the other's entry being torn down.
     */
    function DeskHeader(props) {
      /** `null` | 'prompt' | 'errors' — never two at once. */
      const [openPanel, setOpenPanel] = React.useState(null);
      const wrapRef = React.useRef(null);
      const { pending, refresh } = usePendingBadge();

      /*
       * Opening the errors panel is itself a read of the queue, so the badge is
       * re-fetched then: without this it would still show the count from up to a
       * poll interval ago at the moment the user opens the panel that answers it.
       */
      const toggle = (which) => {
        setOpenPanel((current) => (current === which ? null : which));
        if (which === 'errors') refresh();
      };

      /*
       * Clicking anywhere outside the header group closes the open panel; Escape does
       * too. Both listeners are bound only while a panel is open, so with nothing on
       * screen this plugin adds no document-level listeners at all.
       *
       * `pointerdown` covers mouse, touch and pen in one listener, and it fires before
       * the click that a control underneath would otherwise receive. The capture phase
       * is what makes "click outside" reliable even when the thing clicked is inside a
       * nested handler: a bubbling listener on `document` can be pre-empted by a
       * `stopPropagation` further down the tree.
       *
       * The containment test is against this wrapper, which holds the buttons *and*
       * both panels — so pressing a button, typing in a field, dragging the panel's
       * scrollbar, or selecting text inside it all count as "inside" and keep it open.
       */
      React.useEffect(() => {
        if (openPanel === null) return undefined;
        const onPointerDown = (event) => {
          const wrap = wrapRef.current;
          const target = event.target;
          if (wrap !== null && target !== null && wrap.contains(target)) return;
          setOpenPanel(null);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpenPanel(null);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [openPanel]);

      return h('div', { className: 'pd-wrap', ref: wrapRef },
        h(DeskButton, {
          open: openPanel === 'prompt',
          label: '提示词',
          title: '编辑全局提示词、本次对话提示词，并查看实际注入的文本',
          onToggle: () => toggle('prompt'),
        }),
        h(DeskButton, {
          open: openPanel === 'errors',
          label: '错误库',
          badge: pending,
          title: pending > 0
            ? '有 ' + pending + ' 条自动捕获的错误待确认'
            : '查看分类后的错误经验库',
          onToggle: () => toggle('errors'),
        }),
        h(PromptPanel, {
          open: openPanel === 'prompt',
          sessionId: props.sessionId,
          onStateChanged: refresh,
        }),
        h(ErrorsPanel, {
          open: openPanel === 'errors',
          sessionId: props.sessionId,
          onStateChanged: refresh,
        }));
    }

    return {
      // `slots` is the only service this half needs; `sessionId` arrives as a slot
      // prop because `conversation.session.header.utilities` is session-scoped.
      inject: ['slots'],
      apply(ctx) {
        // The stylesheet is registered as an effect so unloading the plugin (or an
        // HMR reload) removes it instead of stacking a second copy.
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-prompt-ErrorNotes-desk';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => { tag.remove(); };
        });

        // ONE registration for both buttons and both panels: see DeskHeader for why
        // the mutual exclusivity is a consequence of this shape rather than a rule
        // the components have to enforce.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'prompt-desk',
          order: 30,
        }, DeskHeader));
      },
    };
  },
});
