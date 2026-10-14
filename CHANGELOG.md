# Changelog

Notable changes to `dsh-prompt-ErrorNotes-desk`. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[Semantic Versioning](https://semver.org/).

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
