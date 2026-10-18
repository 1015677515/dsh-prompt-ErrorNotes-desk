# Changelog

Notable changes to `dsh-prompt-ErrorNotes-desk`. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[Semantic Versioning](https://semver.org/).

## [1.1.3] — 2026-10-18

### Changed

- **两个提示词框的高度会记住，且右下角把手统一。** 之前用的是浏览器原生
  `resize:vertical`，它有两个无法绕开的限制：把手由浏览器渲染，`::-webkit-resizer`
  只接受 `background`、**改不了命中面积**（所以两个框的把手天然不一样大）；而它写入
  的是节点内联样式，面板一关 `PanelShell` 就把节点销毁，高度不可能留住。
  现在关闭原生 `resize`，改由 `client.js` 自绘 `.pd-grip` 把手接管拖拽：两个框共用
  `--pd-grip`（18px）尺寸，命中面积逐像素一致；高度按框分别存 `localStorage`
  （`pd.height.globalPrompt` / `pd.height.sessionPrompt`），关面板、刷新页面都保持。
  拖拽用 pointer capture 实现，指针移出把手后仍继续跟随，`pointerup` 收尾——高度只在
  那一刻落盘一次，不在拖动过程中反复写。
  高度**不**进 `state.json`：它是这台浏览器的窗口属性，不是对话状态，也不该让两台机器
  互相覆盖。读取时校验范围（44–1200px），损坏或手改过的值退回默认高度而不是撑爆面板；
  `localStorage` 不可用（隐私模式）时拖拽照常，只是不记忆。
  刻意没动注入文本预览的 `.pd-mono`：它仍用原生把手，且按你的要求不参与记忆。
  两个框的起始高度同时减半：`.pd-grow` 168→84px、`.pd-grow-sm` 144→72px，校验下限
  随之 88→44px。这两条规则仍是 `min-height` 覆盖 `.pd-area` 的 96px 基值——84/72 比
  96 更小，所以**顺序变成承重条件**，写在 `.pd-area` 之前就不再是"没生效"，而是两个框
  反而比基值更高。

## [1.1.2] — 2026-10-18

### Changed

- **三个文本框都能竖向拖拽，默认也更高。** 全局提示词与本次对话提示词原本就带
  `resize:vertical`，但 `.pd-area` 的 `min-height:96px` 只够三行，看上去像"不能调"；
  现在两者分别用 `.pd-grow`（168px）与 `.pd-grow-sm`（144px）抬高起点，仍可向下拖。
  注入文本预览原本是 `<pre class="pd-mono">`，其 `max-height:220px` 会把拖拽卡死在
  半路——把手在动、框不变。改为 `height:260px;min-height:120px;max-height:none` 并
  补 `resize:vertical`（`resize` 只对 `overflow != visible` 的元素生效，而它本来就有
  `overflow:auto`）。
  刻意没有动 `.pd-area` 本身：它还被草稿卡的两个 `<input>` 和条数上限的数字框复用，
  那些都用内联 `minHeight:auto` 压回单行——抬高共享类会把它们一起变高。

### Added

- **「下一轮实际注入的文本」可以隐藏，且默认隐藏。** 该区块是面板里最高的一块，
  在笔记本屏幕上会把底部的导出开关顶出视野。标签行右侧新增「隐藏 / 显示」按钮；
  状态写入 `state.json` 的 `ui.showPreview`（与既有的 `ui.showPrompt` /
  `ui.showErrors` 同构，因此 `sanitizeState` 与 `applyPatch` 各加一行即可），刷新、
  重开面板都保持。旧状态文件没有该字段时按 `false` 读取，与全新安装一致，
  不会出现"升级后面板突然变高"。
  拖动出来的高度**不**记忆：那是纯视觉偏好，重新打开回到默认高度。

## [1.1.1] — 2026-10-16

### Fixed

- **`CLIENT_VERSION` was left at `0.4.0`**, so the panel reported
  "界面与宿主版本不一致（界面 0.4.0，宿主 1.1.1）" on every load and asked the user
  to refresh — which could not help, because the stale number was in the source
  rather than a caching artefact. This is the **second** version constant to be
  missed (the first was `PLUGIN_VERSION` in 1.0.0); the two halves are loaded by
  different machinery and each carries its own build identity, documented as
  "Bump it with package.json". Both are now checked against `package.json` by the
  release script, so the next bump cannot silently skip one.
- **The declared DSH compatibility range silently excluded every future
  prerelease.** `engines.dsh` and `dshhub.compatibility.dsh` read `>=0.2.0-rc.1`,
  which matches the current `0.2.0-rc.2` but not `0.3.0-rc.1` — node-semver only
  lets a prerelease satisfy a range when some comparator sits on the *same*
  `major.minor.patch` tuple and carries a prerelease tag of its own, and that range
  has such a comparator only on `0.2.0`. Measured: `0.3.0-rc.1`, `0.4.0-rc.1`,
  `0.5.0-rc.1` and `1.0.0-rc.1` all came back false. The range now carries an
  explicit prerelease branch per minor version, which is what the marketplace's
  contributing guide asks for. Only `2.0.0-rc.1` remains outside it — a major
  version bump is a deliberate re-declaration, not something to pre-empt.

## [1.1.0] — 2026-10-15

### Fixed

- **A confession was lost when the message mentioned the marker first.** The parser
  inspected only the *earliest* marker occurrence; if that one did not open its line
  it gave up on the whole message. So the commonest shape of all — quote the marker,
  show the format, discuss the feature, *then* confess — was dropped **silently**,
  with no draft and no error. Measured: ``先说 `我犯了个错误` 这个词，然后\n我犯了个错误：错误经过：真实错误 教训：真实教训``
  returned `null`. Rejected occurrences are now skipped and the search continues, so
  the real confession is found. Every rejection rule is unchanged and still applied
  to each candidate in turn.
- **`PLUGIN_VERSION` was left at `0.4.0`** while `package.json` said `1.0.0`, so the
  panel reported the wrong build. The constant is documented as needing to move with
  `package.json`; it now matches.

### Changed

- The cue asks for brevity — incident and lesson each within 20 characters. Guidance,
  not enforcement: the parser still accepts a 4–200 character incident and places no
  bound on the lesson. It is kept in the cue because a captured entry is re-injected
  on every later turn, so a shorter entry pays for itself many times over.

## [1.0.0] — 2026-10-15

### Fixed

- **False-positive drafts from marker quotations.** The confession parser treated
  any occurrence of the marker as a confession, so a code sample, a README excerpt,
  or a message *discussing* this feature became a draft the user had to discard by
  hand. Real examples that reached the panel: `';`, `」`, a fragment of a code
  comment, and a sentence of README prose. The marker must now **start its line**
  (only whitespace, list bullets, ordered-list numbers or `>` may precede it).
- **The `｜` separator split in the wrong place.** A sentence containing
  "（忘了写 `｜`）" put the separator in the middle of prose, producing two junk
  drafts from one line. The separator is no longer used at all — see the format
  change below.

### Changed

- **New confession format, replacing the `｜` separator with labelled fields:**

  ```
  我犯了个错误：错误经过：<what actually happened> 教训：<one actionable rule>
  ```

  Both labels are required, their order is fixed, and they must sit on the marker's
  own line — which is what rejects the marker quotations above while still accepting
  how a confession is naturally written. Either marker is accepted (`我犯了个错误`,
  which the cue demonstrates, and `我发现了个错误`); the earliest occurrence in the
  text wins. **The old `我犯了个错误：xxx｜yyy` format (separator, no labels) is no
  longer captured.**
- **The cue is now roughly a third of its former length.** It is injected on every
  request, so its size is a per-turn cost for the whole session: the previous version
  cost 349 characters (~188–302 tokens), most of it style advice the model only needs
  to read once. What remains is what the parser *enforces* — both labels, their
  order, and the one-line rule (a confession split across two lines is dropped with
  no error, so omitting that rule would trade a silent failure for ~10 tokens). The
  error-list heading and its truncation note are Chinese now as well, which is about
  a third the length of the English for the same meaning.
- **The cue asks for brevity**: incident and lesson should each stay within 20
  characters. This is guidance, not enforcement — the parser still accepts an
  incident of 4–200 characters and places no bound on the lesson. It is kept in the
  cue despite being advice because a captured entry is re-injected on every later
  turn, so a shorter entry pays for itself many times over.
- The category is still chosen in the panel rather than written into the line, and
  the cue says so, which answers "how do I fill in the library" at the point the
  model reads it.
- The empty-state note in the panel and both READMEs were updated to the new format,
  and now show the injected cue verbatim.

## [0.4.0] — 2026-10-15

### Added

- **Categories.** Every entry now belongs to one of three top-level groups —
  `判断与依据错误` (with 验证缺位 / 依据缺位), `生成与操作错误` (with 语法生成 /
  工具与编码) and `其他` — shown as collapsible groups with a per-row dropdown for
  re-filing. The split is by remedy, not symptom: each leaf names a concrete thing
  to do differently next time. `其他` is a declared, leaf-less group rather than a
  bucket the UI invents, so it flows through the same validation and the same
  dropdown as the other two.
- **Automatic capture of self-reported mistakes.** The Host subscribes to
  `agent/assistant-stream`, accumulates the assistant's text deltas, and on a
  committed end runs the confession parser over the message. A recognized
  confession becomes a **draft** in the panel's 待确认 queue — never a library entry
  — with a count badge on the 错误库 header button. Drafts are editable (both the
  wording and the category) and can be accepted or discarded.
- **The confession cue** (`我犯了个错误：<错在哪>｜<以后怎么避免>`) is now part of the
  injected text. It is what makes capture possible at all: free-form prose cannot be
  detected reliably. The fullwidth `｜` separator avoids colliding with markdown
  tables, code, or the arrows the lesson text already uses.
- **Injection preview.** The prompt panel renders the plugin's entire contribution
  as a monospace block, produced by the same builder the assembler calls, so the
  preview cannot drift from what the model actually receives.
- **Install self-check and a version handshake.** The panel reports Host liveness,
  the state-file location, the injected count, the pending count, and whether the
  bundle and the Host agree on `pluginVersion` — the last of which replaces the
  previous per-field defence against an older peer.
- **`/lessons` command and a temporary-pause switch.** `/lessons off`, `/lessons on`
  or a bare `/lessons` (toggle) pauses the error list; the same control is a
  checkbox at the top of the prompt panel. It is **global** and **deliberately not
  persisted**. A mistyped argument returns usage rather than silently toggling.
- **`GET /prompt-desk/pending`** — a deliberately trivial route so the header badge
  can poll a single integer instead of reading `AGENTS.md` and rebuilding the whole
  preview on every tick.

### Changed

- **The panel's write protocol is addressed by entry id, not array index.** The Host
  now appends to the queue on its own, so an index the browser captured before that
  append would name a different entry. `errors` is no longer replaced wholesale: the
  patch carries `errorAdd` / `errorUpdate` / `errorDelete` / `pendingAccept` /
  `pendingDelete` / `pendingClear` / `lessonsEnabled`.
- **State is v3.** A v1 (no ids, no categories) or v2 (`uncategorized` bucket)
  document is migrated by the first read that has to repair it, and the repaired
  file is written once. Migration is one-way; there is no downgrade path.
- **Temporary files are now unique per write.** The atomic write used a fixed
  `${path}.tmp`, which was safe only while every write came from a user action. The
  Host writes on its own now, so two overlapping writers could have clobbered each
  other's bytes before the rename.
- The prompt panel's two injection switches were moved to opposite ends of the
  panel. They overlap in effect but differ in scope, and sitting adjacent made them
  read as one control with two states.

### Notes

- `/lessons` is global because no reliable mapping from `AssembleContext.scope` (an
  opaque `ScopeKey`) to `invocation.agent.id` was found in the installed harness.
  Guessing one would have produced a per-session switch that silently behaved
  globally anyway.
- A listener registered on the plugin's global `ctx` **does** receive the
  `Scoped<Agent>` `agent/assistant-stream` event. Verified at runtime in the desktop
  profile on 2026-10-15: a confession emitted in a real conversation was parsed into
  a pending draft (`source: "auto"`) in `state.json`.
- The panel's write path is verified at runtime as well: accepting a captured draft
  and re-filing it to another category through the dropdown both persisted correctly
  to `state.json` — the promoted entry kept `source: "auto"` and was given a fresh
  unique id rather than reusing the draft's. The live `GET /prompt-desk/state`
  payload also carries the three-group tree, so the dropdown's five options are
  delivered by the Host, not invented by the bundle.
- Still unverified at the time of writing: the `/lessons` command registration shape.
  It is isolated by `try`/`catch`, so a mismatch degrades to "command unavailable"
  rather than a failed plugin load.

## [0.3.0] — 2026-10-14

### Added

- **The cap is editable from the error-library panel.** A number field, a 保存
  button and a 恢复默认 button sit inside the panel, next to the readout that says
  how many entries are actually reaching the model. The field's default and its
  bounds come from the Host, so it cannot drift from what the prompt assembler
  enforces, and it carries the reason to care: more entries means more tokens
  injected on every request.
- **Clicking outside an open panel closes it**, and so does Escape. The listeners
  exist only while a panel is open, and the containment test covers both buttons
  and both panels, so pressing a button or typing in a field counts as inside.

### Changed

- The cap now resolves per call from two sources, with one stated precedence: the
  panel's own value (stored in `state.json` as `injectLimit`) wins when set, and
  the plugin config's `injectLimit` is the default it falls back to. Clearing the
  panel field — or 恢复默认 — returns it to that default.
- The panel payload gained `errorLimitDefault`, `errorLimitCustom` and
  `limitBounds`, so the Client renders the field's state from Host data instead of
  duplicating the rules.
- The injection readout no longer points at Settings, since the setting is now in
  the panel it describes.

## [0.2.0] — 2026-10-14

### Changed

- **The injection cap now defaults to 10, down from 20.** The library exists so the
  model absorbs a reminder, and a list long enough to skim is a list that stops
  being read. Raise it again from the plugin config when the library is doing real
  work.

### Added

- **`injectLimit` config field** — how many recent error entries reach the system
  prompt (`10` by default, `0` injects none, clamped to `200`). It is declared as
  the plugin's `Config` schema, so the host renders it under **Settings → Plugins →
  plugin config**, and it can equally be set from the profile's `cordis.patch.yml`
  (`config.injectLimit`). A negative, fractional or non-numeric value is rejected by
  the schema with a specific reason.
- The panel readout now prints the effective cap and where to change it, so the
  number on screen is one the user can act on.
- `@deepseek-ai/schemastery` is declared as a peer dependency (`^3.18.1`).

## [0.1.0] — 2026-10-14

First release.

### Added

- **Two panels in the conversation header** (`conversation.session.header.utilities`),
  mutually exclusive by construction: a single `openPanel` state means two panels
  cannot both be open.
- **Prompt panel** — edits the cross-conversation global prompt (the harness's own
  `$DSH_HOME/AGENTS.md`, so it is the same file the official
  `dsh-agent-instructions` plugin loads) and a per-session prompt that carries into
  the next conversation. Shows which half is currently reaching the model.
- **Error library panel** — a dated list of recurring mistakes, each a short type
  plus a one-sentence lesson, with the original detail kept readable below it.
- **System-prompt injection** — the session prompt and the most recent 20 error
  entries are contributed via `ctx.systemPrompt.section()` at
  `DEPLOYMENT_PERSONA_SUFFIX` (10200). `text` is a function, so an edit takes
  effect on the next turn with no restart.
- **Host-side persistence** — state lives in `$DSH_HOME/prompt-desk/state.json`,
  written atomically (`.tmp` sibling + rename). The browser half never touches the
  filesystem; it reads and writes through `GET|POST /prompt-desk/state`.

### Notes

- The global prompt is deliberately **not** a private copy: two files both claiming
  to be "the global prompt" would drift, and only one of them would reach the model.
- Panels use `--dsw-static-neutral-bluish-*` rather than
  `--dsw-alias-bg-layer-*`, so a liquid-glass theme plugin (which rewrites the
  aliases into translucent films) cannot make them see-through.
