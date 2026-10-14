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

## 安装 / Install

本插件目前只发布在 GitHub（未发布到 npm）。

> 完整的安装步骤、验证方法与常见问题见 **[INSTALL.md](INSTALL.md)**。
> 下面是最短路径。

### 方式一：应用内安装（推荐）

**设置 → 插件 → 安装**，在输入框里填 GitHub 短地址：

```
github:1015677515/dsh-prompt-ErrorNotes-desk
```

也可以填完整网址：

```
https://github.com/1015677515/dsh-prompt-ErrorNotes-desk
```

安装界面提示「输入插件的包名、GitHub 仓库地址或本地目录路径」，上面两种都是它接受的写法。

**不需要自己写 commit SHA。** 填不带版本后缀的短地址即可：市场会先把默认分支的
HEAD 解析成 40 位 commit SHA，再把 `github:owner/repo#<sha>` 这种已 pin 的形式交给
pnpm。这样 lockfile 里记录的是可追溯的提交，安装后**版本号能正常显示**。

> ⚠️ 反过来要注意：**不要**自己写 `#HEAD` 或让源停留在浮动分支上。源码里写明，
> HEAD 形态的 tarball「installs perfectly and then reports no version forever」——
> 能装上，但版本栏会一直是空的，之后也检测不到更新。

### 方式二：本地目录

已经克隆到本地时，直接填目录路径（安装界面会提示「本地目录」）：

```
A:\大肥鱼工作区\dsh-prompt-ErrorNotes-desk
```

开发时这样最方便：local 安装默认以目录链接（Windows 上是 Junction）接入，
改完源码刷新页面即可，不必重装。

### 方式三：手动写进 profile

```yaml
# cordis.patch.yml of your bundle
- insert:
    - id: prompt-desk
      name: dsh-prompt-ErrorNotes-desk
```

装好后需要**重启 DSH**：浏览器半边会热重载，但宿主半边（负责往系统提示词注入）
要重启才会加载新的模块代次。

### 环境要求

| 依赖 | 要求 |
|---|---|
| DSH | `>=0.2.0-rc.1` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| HTTP 服务 | 必需。宿主半边注册 `GET\|POST /prompt-desk/state`，浏览器半边靠它读写。没有 HTTP 服务的 profile 会加载插件但保持不活动，而不是报错 |

无第三方运行时依赖；浏览器半边只用页面已提供的 `react`，没有构建步骤。

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
