# dsh-prompt-ErrorNotes-desk

Two small panels in the DeepSeek Harness conversation header. They are **mutually
exclusive** — opening one closes the other.

| Panel | What it does |
|---|---|
| **提示词 / Prompt** | Edits the cross-conversation global prompt and a per-session prompt that carries into the next conversation. Shows which half is currently reaching the model. |
| **错误库 / Error library** | A dated list of recurring mistakes — a short type plus a one-sentence lesson each. The most recent entries are injected into the system prompt, so a later turn can absorb them cheaply. |

The point of the second panel: an agent that keeps repeating the same class of
mistake gets a short, dated reminder of it in its own context, at a token cost
far below re-discovering the mistake.

## Install

From the app: **设置 → 插件 → 安装**, then paste the package name
`dsh-prompt-ErrorNotes-desk`, the repository URL, or a local directory path.

Or add it to a profile by hand:

```yaml
# cordis.patch.yml of your bundle
- insert:
    - id: prompt-desk
      name: dsh-prompt-ErrorNotes-desk
```

The browser half needs an HTTP server to talk to the host half; a profile without
one loads the plugin and it stays inactive rather than failing.

## What it does to your files

The global prompt **is** the harness's own `$DSH_HOME/AGENTS.md` — the same file
the official `dsh-agent-instructions` plugin already loads. This plugin keeps no
second copy: two files both claiming to be "the global prompt" would drift, and
only one of them would actually reach the model.

| Data | Location |
|---|---|
| Global prompt | `$DSH_HOME/AGENTS.md` |
| Session prompt, error library, panel visibility | `$DSH_HOME/prompt-desk/state.json` |

Writes are atomic (`.tmp` sibling + rename), so a crash cannot truncate your
prompt. The browser half never touches the filesystem — all I/O lives on the host
half, so nothing can write outside `$DSH_HOME`.

## How the injection works

The session prompt and the **most recent 20** error entries are contributed
through `ctx.systemPrompt.section()` at order `10200`
(`DEPLOYMENT_PERSONA_SUFFIX`), i.e. after the tool documentation.

- `text` is a **function**, so an edit takes effect on the next turn — no restart,
  no re-registration.
- Only **type + lesson** is injected. The stored `detail` explains the incident
  but is the most token-expensive and least actionable field, so it stays in the
  panel.
- The limit keeps the library from becoming a token sink: the full list stays
  readable in the panel, and the prompt says when it is showing a subset.

## Design notes

- **Mutual exclusivity is structural, not enforced.** Both buttons and both panels
  live in one slot registration sharing one `openPanel` state. With two separate
  registrations each panel would own its own `useState`, and "at most one open"
  would need cross-component coordination — a desync waiting to happen.
- **Opaque surfaces on purpose.** The panels use `--dsw-static-neutral-bluish-*`
  rather than `--dsw-alias-bg-layer-*`: a liquid-glass theme plugin (such as
  `dsh-plugin-wallpaper-engine`) rewrites those aliases into translucent films, so
  anything painted with them lets the wallpaper show through and the text becomes
  hard to read.
- **State on disk is never trusted.** Every field is validated on read, so a
  hand-edited or half-written file degrades to defaults instead of raising a
  `TypeError` on each request.
- **Styles and registrations are effects**, so unloading the plugin (or an HMR
  reload) removes the stylesheet and both slot registrations.

## Verified against the installed harness

These were checked in source rather than assumed:

- Plugin `inject` exports are string arrays (`['tools']`); there is no
  `{optional: [...]}` object form. Optional services are taken with
  `ctx.inject([...], cb)` so they do not gate activation.
- `webServer.register({ kind, path, handler })` returns a disposer.
- `PromptSection.text` is typed `string | ((context: AssembleContext) => string)`.
- `conversation.session.header.utilities` is a `list`, session-scoped slot; its
  components receive `{ sessionId, useSessions }`.
- The dark-theme attribute is `data-ds-dark-theme`.

## Licence

MIT
