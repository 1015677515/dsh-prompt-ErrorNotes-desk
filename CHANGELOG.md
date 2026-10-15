# Changelog

Notable changes to `dsh-prompt-ErrorNotes-desk`. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[Semantic Versioning](https://semver.org/).

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
