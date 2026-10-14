/**
 * dsh-prompt-ErrorNotes-desk — Client half.
 *
 * Two small panels hung in `conversation.session.header.utilities` (the header's
 * right-hand utility group, a `list` slot): one edits the prompt, the other
 * shows the dated error-experience library. Either panel can be switched off.
 *
 * The Client is a pure renderer: every read and write goes to the Host half over
 * the same-origin `/prompt-desk/state` route. It never touches the filesystem, so
 * nothing here can write outside `$DSH_HOME`.
 *
 * Styling follows the harness plugin rules: only `--dsw-alias-*` theme tokens are
 * referenced (a renamed token degrades the look but never breaks rendering), and
 * no host Client package is imported as a module.
 */
window.__ModuleLoader__.load({
  id: 'dsh-prompt-ErrorNotes-desk',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Host route prefix; mirrors BASE in index.js. */
    const STATE_URL = '/prompt-desk/state';

    /**
     * Panel styles. Literal colors appear only as fallbacks *behind* a
     * `--dsw-alias-*` token, never as the primary value.
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
      '.pd-btn{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;',
      'border-radius:6px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);',
      'color:var(--dsw-alias-label-secondary,inherit);',
      'font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}',
      'body[data-ds-dark-theme] .pd-btn{background:var(--dsw-static-neutral-bluish-875,#1e1f26)}',
      '.pd-btn:hover{border-color:var(--dsw-alias-border-l1,rgba(128,128,128,.4))}',
      '.pd-btn[data-on="1"]{color:var(--dsw-alias-label-primary,inherit);',
      'border-color:var(--dsw-alias-border-l1,rgba(128,128,128,.4))}',
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
      '.pd-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:520px;',
      'max-height:70vh;overflow:auto;padding:12px;border-radius:10px;box-sizing:border-box;',
      'border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));',
      'background:var(--dsw-static-neutral-bluish-00,#ffffff);',
      'color:var(--dsw-alias-label-primary,inherit);',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)}',
      // Dark theme: the static pair's other half. A plain attribute selector, so it
      // does not depend on any theme plugin being present.
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
      '.pd-err{border-top:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2));',
      'padding:6px 0;font-size:12px}',
      '.pd-err-date{font-size:10px;color:var(--dsw-alias-label-secondary,inherit)}',
      '.pd-err-type{font-weight:600}',
      '.pd-fail{font-size:12px;color:var(--dsw-alias-state-business-danger,#d33)}',
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

    /** A header button that toggles one panel. */
    function DeskButton(props) {
      return h('button', {
        type: 'button',
        className: 'pd-btn',
        'data-on': props.open ? '1' : '0',
        'aria-expanded': props.open,
        title: props.title,
        onClick: props.onToggle,
      }, props.label);
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
     * Panel 1 — the prompt.
     *
     * Two textareas on purpose: the global prompt is the harness's own
     * `AGENTS.md` (cross-conversation), while the session prompt is this plugin's
     * own file. Keeping them visually separate is what stops a user from
     * believing a one-off instruction became permanent.
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

      return h(PanelShell, { open, title: '提示词', error },
        data === null ? h('div', { className: 'pd-note' }, '加载中…') : h(React.Fragment, null,
          /*
           * Whether each half is currently reaching the model. The global prompt is
           * loaded by the official agent-instructions plugin (from AGENTS.md) and
           * the session prompt by this plugin; they take different paths, so a user
           * editing both deserves to see which one is actually live.
           */
          data.injection ? h('div', { className: 'pd-note', style: { marginBottom: '8px' } },
            (data.injection.globalPromptActive ? '● 全局提示词已生效' : '○ 全局提示词为空')
            + '　'
            + (data.injection.sessionPromptActive ? '● 本次提示词已生效' : '○ 本次提示词为空')) : null,
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
        ));
    }

    /**
     * Panel 2 — the dated error library.
     *
     * Grouped by date because that is how the user asked to read it, and each row
     * carries only `type` + one-sentence `lesson`: the same shape that gets
     * injected into the prompt, so what the user reviews here is exactly what the
     * model will later be told.
     */
    function ErrorsPanel(props) {
      const open = props.open;
      const { data, error, save } = useDeskData(open);
      const [type, setType] = React.useState('');
      const [lesson, setLesson] = React.useState('');

      const add = () => {
        if (type.trim() === '' && lesson.trim() === '') return;
        const entry = {
          date: new Date().toISOString().slice(0, 10),
          type: type.trim(),
          lesson: lesson.trim(),
          detail: '',
        };
        const next = ((data && data.errors) || []).concat([entry]);
        save({ errors: next }).then(() => { setType(''); setLesson(''); });
      };

      const removeAt = (index) => {
        const next = ((data && data.errors) || []).filter((_, i) => i !== index);
        save({ errors: next });
      };

      const errors = (data && data.errors) || [];
      const byDate = new Map();
      errors.forEach((e, i) => {
        const key = e.date || '(无日期)';
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key).push({ e, i });
      });
      const dates = Array.from(byDate.keys()).sort().reverse();

      return h(PanelShell, { open, title: '错误经验库（' + errors.length + ' 条）', error },
        data === null ? h('div', { className: 'pd-note' }, '加载中…') : h(React.Fragment, null,
          h('label', { className: 'pd-label' }, '新增一条（类型 / 一句教训）'),
          h('div', { className: 'pd-row' },
            h('input', {
              className: 'pd-area', style: { minHeight: 'auto', flex: '1 1 160px' },
              placeholder: '类型，如：把“没读到”当成“不存在”',
              value: type, onChange: (e) => setType(e.target.value),
            }),
            h('input', {
              className: 'pd-area', style: { minHeight: 'auto', flex: '2 1 220px' },
              placeholder: '一句教训，如：声称完成前先独立复核产物存在',
              value: lesson, onChange: (e) => setLesson(e.target.value),
            }),
            h('button', { type: 'button', className: 'pd-primary', onClick: add }, '添加')),

          errors.length === 0 ? h('div', { className: 'pd-note', style: { marginTop: '10px' } }, '还没有记录。') : null,
          // Injection accounting comes from the Host, which owns INJECT_ERROR_LIMIT.
          // Showing it here is the difference between "the library has entries" and
          // "the library is actually reaching the model" — the second is the whole
          // point, and without a readout a user cannot tell the two apart.
          data && data.injection && errors.length > 0 ? h('div', {
            className: 'pd-note', style: { marginTop: '10px' },
          },
            data.injection.errorsInjected === data.injection.errorsTotal
              ? `已注入全部 ${data.injection.errorsInjected} 条（下一轮对话生效）`
              : `已注入最近 ${data.injection.errorsInjected} 条，共 ${data.injection.errorsTotal} 条`
                + `（上限 ${data.injection.errorLimit}）`) : null,
          dates.map((d) => h('div', { key: d },
            h('div', { className: 'pd-label' }, d),
            byDate.get(d).map(({ e, i }) => h('div', { className: 'pd-err', key: i },
              h('div', { className: 'pd-err-type' }, e.type || '(未命名)'),
              h('div', null, e.lesson || ''),
              // The stored `detail` is what the one-sentence lesson was distilled
              // from. It is deliberately not injected into the prompt (that would
              // cost the tokens the lesson exists to save) but is worth keeping
              // readable here, so it renders as a muted note when present.
              e.detail ? h('div', { className: 'pd-err-date' }, e.detail) : null,
              h('div', { className: 'pd-row' },
                h('button', { type: 'button', className: 'pd-ghost', onClick: () => removeAt(i) }, '删除')))))),
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

      // Clicking the open panel's own button closes it; clicking the other swaps.
      const toggle = (which) => setOpenPanel((current) => (current === which ? null : which));

      return h('div', { className: 'pd-wrap' },
        h(DeskButton, {
          open: openPanel === 'prompt',
          label: '提示词',
          title: '编辑全局提示词与本次对话提示词',
          onToggle: () => toggle('prompt'),
        }),
        h(DeskButton, {
          open: openPanel === 'errors',
          label: '错误库',
          title: '查看按日期归纳的错误经验',
          onToggle: () => toggle('errors'),
        }),
        h(PromptPanel, { open: openPanel === 'prompt', sessionId: props.sessionId }),
        h(ErrorsPanel, { open: openPanel === 'errors', sessionId: props.sessionId }));
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
