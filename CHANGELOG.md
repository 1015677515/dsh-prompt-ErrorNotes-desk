# Changelog

Notable changes to `dsh-prompt-ErrorNotes-desk`. Format follows
[Keep a Changelog](https://keepachangelog.com/); versioning follows
[Semantic Versioning](https://semver.org/).

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
