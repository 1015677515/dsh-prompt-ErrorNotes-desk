# dsh-prompt-ErrorNotes-desk

> 本项目由 DeepSeek Harness 的 AI 智能体独立开发。

对话标题栏里的两个小面板：编辑提示词、维护错误经验库。两者**互斥**——打开一个会自动关掉另一个。

[English](#english) | 中文

---

## 它做什么

| 面板 | 作用 |
|---|---|
| **提示词** | 编辑**跨对话**的全局提示词，以及**本次对话**的提示词（新对话会延续）。面板顶部显示哪一半当前正在生效。 |
| **错误库** | 按日期归纳反复犯的错误：每条一个简短类型 + 一句教训。**最近 10 条（条数可自己设）会被注入系统提示词**，让后续对话以极低的 token 成本吸取教训。 |

第二个面板的意义：一个反复犯同类错误的 agent，会在自己的上下文里收到一份简短的、带日期的提醒，成本远低于重新踩一遍坑再发现。

两个面板互斥，**点面板以外的空白处会自动关闭**（按 Esc 也可以）。

## 安装

本插件目前只发布在 GitHub（未发布到 npm）。

> 完整的安装步骤、验证方法与常见问题见 **[INSTALL.md](INSTALL.md)**。下面是最短路径。

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

**不需要自己写 commit SHA。** 填不带版本后缀的短地址即可：市场会先把默认分支的 HEAD 解析成 40 位 commit SHA，再把 `github:owner/repo#<sha>` 这种已固定的形式交给 pnpm。这样 lockfile 里记录的是可追溯的提交，安装后**版本号能正常显示**。

> ⚠️ 反过来要注意：**不要**自己写 `#HEAD`，也不要让安装源停留在会移动的分支上。源码里写明，HEAD 形态的 tarball「installs perfectly and then reports no version forever」——能装上，但版本栏会一直是空的，之后也检测不到更新。

### 方式二：本地目录

已经克隆到本地时，直接填目录路径（安装界面会提示「本地目录」）：

```
A:\大肥鱼工作区\dsh-prompt-ErrorNotes-desk
```

开发时这样最方便：local 安装默认以目录链接（Windows 上是 Junction）接入，改完源码刷新页面即可，不必重装。

### 方式三：手动写进 profile

```yaml
# cordis.patch.yml of your bundle
- insert:
    - id: prompt-desk
      name: dsh-prompt-ErrorNotes-desk
```

装好后需要**重启 DSH**：浏览器半边会热重载，但宿主半边（负责往系统提示词注入）要重启才会加载新的模块代次。

### 环境要求

| 依赖 | 要求 |
|---|---|
| DSH | `>=0.2.0-rc.1` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| HTTP 服务 | 必需。宿主半边注册 `GET\|POST /prompt-desk/state`，浏览器半边靠它读写。没有 HTTP 服务的 profile 会加载插件但保持不活动，而不是报错 |

无第三方运行时依赖；浏览器半边只用页面已提供的 `react`，没有构建步骤。

## 它会动你的哪些文件

全局提示词**就是** DSH 自己那个 `$DSH_HOME/AGENTS.md` —— 也就是官方 `dsh-agent-instructions` 插件本来就会读的同一个文件。本插件**不另存副本**：两个都自称「全局提示词」的文件必然会漂移，而且只有一个真正会送达模型。

| 数据 | 位置 |
|---|---|
| 全局提示词 | `$DSH_HOME/AGENTS.md` |
| 本次对话提示词、错误库、面板开关 | `$DSH_HOME/prompt-desk/state.json` |

写入是**原子**的（先写 `.tmp` 再改名），崩溃不会截断你的提示词。浏览器半边完全不碰文件系统——所有读写都在宿主半边，所以不会写到 `$DSH_HOME` 之外。

## 注入是怎么工作的

本次对话提示词、以及**最近 10 条**错误经验，通过 `ctx.systemPrompt.section()` 注入，顺序值 `10200`（`DEPLOYMENT_PERSONA_SUFFIX`），即排在工具文档之后。

- `text` 传的是**函数**，所以改完**下一轮对话就生效**——不用重启，也不用重新注册。
- 只注入**类型 + 教训**。存下来的 `detail` 解释了事情经过，但它是 token 最贵、最不具行动性的一项，所以只留在面板里。
- 条数上限是为了不让经验库变成 token 黑洞：完整列表始终在面板里可读，提示词里也会说明当前只显示了其中一部分。

### 注入条数可以自己设

**在错误库面板里直接填**（最方便）：面板里有一个「注入条数上限」输入框，填好点「保存」即可，下一轮对话生效。

| 字段 | 默认 | 含义 |
|---|---|---|
| `injectLimit` | `10` | 注入系统提示词的错误经验条数上限。`0` = 一条都不注入（会话提示词不受影响）；最大 `200`，填更大也会被夹到 200 |

**优先级**：面板里填的值优先；清空输入框并保存（或点「恢复默认」）就回到"跟随插件配置"。

下面两种改法改的是**默认值**（面板没填时用它）：

1. **设置 → 插件 → 插件配置**（宿主从本插件的 `Config` schema 生成这个表单）
2. 写进 profile 的 `cordis.patch.yml`：

```yaml
- id: prompt-desk
  name: dsh-prompt-ErrorNotes-desk
  config:
    injectLimit: 20      # 只接受非负整数
```

只接受**非负整数**：负数、小数、非数字会被拒绝（面板里会提示；schema 会给出具体原因，例如 `expected number >= 0 but got -5`）。

> 个别精简宿主可能不提供 `@deepseek-ai/schemastery`（设置表单由它生成）。那种情况下**功能不受影响**：面板里的输入框和 patch 的 `config` 都照常工作，只是设置里不会出现这个字段。

## 设计取舍

- **互斥是结构性保证，不是靠"打开时去关另一个"实现的。** 两个按钮和两个面板在**同一个插槽注册**里、共用同一个 `openPanel` 状态。若拆成两个注册，每个面板各自持有 `useState`，"最多开一个"就得靠跨组件协调——那是等着出事的状态不同步。
- **面板刻意用不透明底。** 用 `--dsw-static-neutral-bluish-*` 而不是 `--dsw-alias-bg-layer-*`：液态玻璃主题插件（例如 `dsh-plugin-wallpaper-engine`）会把后者重写成半透明膜，用它绘制的地方会透出壁纸，文字变得难读。
- **磁盘上的状态一律不信任。** 每个字段读入时都校验，手改坏或写了一半的文件会退回默认值，而不是每次请求抛 `TypeError`。
- **样式与注册都是 effect**，所以卸载插件（或 HMR 重载）会移除样式表与两个插槽注册。

## 已对安装的宿主逐条取证

以下都是读源码确认过的，不是假设：

- 插件的 `inject` 导出是**字符串数组**（如 `['tools']`），没有 `{optional: [...]}` 对象写法。可选服务用 `ctx.inject([...], cb)` 获取，这样它不会拦住插件的激活。
- `webServer.register({ kind, path, handler })` 返回一个 disposer。
- `PromptSection.text` 的类型是 `string | ((context: AssembleContext) => string)`。
- `conversation.session.header.utilities` 是 `list` 类型、`session` 作用域的插槽；其组件收到的 props 是 `{ sessionId, useSessions }`。
- 暗色主题的属性名是 `data-ds-dark-theme`。

## 许可证

MIT

---

<a id="english"></a>

# English

> Developed independently by an AI agent running on DeepSeek Harness.

Two small panels in the DeepSeek Harness conversation header: edit prompts, keep an error-experience library. They are **mutually exclusive** — opening one closes the other.

[中文](#dsh-prompt-errornotes-desk) | English

## What it does

| Panel | What it does |
|---|---|
| **Prompt** | Edits the cross-conversation global prompt and a per-session prompt that carries into the next conversation. Shows which half is currently reaching the model. |
| **Error library** | A dated list of recurring mistakes — a short type plus a one-sentence lesson each. The most recent 10 (a configurable number) are injected into the system prompt, so a later turn can absorb them cheaply. |

The point of the second panel: an agent that keeps repeating the same class of mistake gets a short, dated reminder of it in its own context, at a token cost far below re-discovering the mistake.

The two panels are mutually exclusive, and **clicking anywhere outside an open panel closes it** (Escape works too).

## Install

This plugin is published on GitHub only (not on npm).

> Full steps, verification and FAQ: **[INSTALL.md](INSTALL.md)**. The short path follows.

### Option 1 — from inside the app (recommended)

**Settings → Plugins → Install**, then paste the GitHub shorthand:

```
github:1015677515/dsh-prompt-ErrorNotes-desk
```

The full URL works too:

```
https://github.com/1015677515/dsh-prompt-ErrorNotes-desk
```

The install field accepts a package name, a GitHub address, or a local directory path — both forms above are accepted.

**You do not need to write a commit SHA yourself.** The shorthand without a version suffix is enough: the market resolves the default branch's HEAD into a 40-character commit SHA first, then hands pnpm the pinned `github:owner/repo#<sha>` form. The lockfile therefore records a traceable commit and the installed **version shows up correctly**.

> ⚠️ The reverse matters too: do **not** write `#HEAD` yourself, and do not leave the source on a moving branch. The source says a HEAD tarball "installs perfectly and then reports no version forever" — it installs, but the version column stays empty and updates are never detected.

### Option 2 — a local directory

When you already have a clone, point at the directory (the install field labels this "local directory"):

```
A:\大肥鱼工作区\dsh-prompt-ErrorNotes-desk
```

This is the convenient path while developing: a local install is wired in as a directory link (a Junction on Windows), so editing the source takes effect on a page refresh — no reinstall.

### Option 3 — write it into the profile by hand

```yaml
# cordis.patch.yml of your bundle
- insert:
    - id: prompt-desk
      name: dsh-prompt-ErrorNotes-desk
```

**Restart DSH afterwards.** The browser half hot-reloads, but the host half — the one that injects into the system prompt — only picks up a fresh module generation on restart.

### Requirements

| Dependency | Requirement |
|---|---|
| DSH | `>=0.2.0-rc.1` |
| Node | `^22.19.0 \|\| >=24.0.0` |
| HTTP server | Required. The host half registers `GET\|POST /prompt-desk/state`; the browser half reads and writes through it. A profile without an HTTP server loads the plugin and it stays inactive rather than failing |

No third-party runtime dependencies; the browser half uses only the `react` the page already provides, and there is no build step.

## What it does to your files

The global prompt **is** the harness's own `$DSH_HOME/AGENTS.md` — the same file the official `dsh-agent-instructions` plugin already loads. This plugin keeps no second copy: two files both claiming to be "the global prompt" would drift, and only one of them would actually reach the model.

| Data | Location |
|---|---|
| Global prompt | `$DSH_HOME/AGENTS.md` |
| Session prompt, error library, panel visibility | `$DSH_HOME/prompt-desk/state.json` |

Writes are atomic (`.tmp` sibling + rename), so a crash cannot truncate your prompt. The browser half never touches the filesystem — all I/O lives on the host half, so nothing can write outside `$DSH_HOME`.

## How the injection works

The session prompt and the **most recent 10** error entries are contributed through `ctx.systemPrompt.section()` at order `10200` (`DEPLOYMENT_PERSONA_SUFFIX`), i.e. after the tool documentation.

- `text` is a **function**, so an edit takes effect on the next turn — no restart, no re-registration.
- Only **type + lesson** is injected. The stored `detail` explains the incident but is the most token-expensive and least actionable field, so it stays in the panel.
- The cap keeps the library from becoming a token sink: the full list stays readable in the panel, and the prompt says when it is showing a subset.

### The number of injected entries is yours to set

**Set it right in the error-library panel** (the convenient way): the panel has a "注入条数上限" field — type a number, press 保存, and it takes effect on the next turn.

| Field | Default | Meaning |
|---|---|---|
| `injectLimit` | `10` | Cap on how many error entries reach the system prompt. `0` injects none (the session prompt is unaffected); `200` is the ceiling, and anything larger is clamped to it |

**Precedence**: a value entered in the panel wins. Emptying the field and saving (or pressing 恢复默认) puts it back on "follow the plugin config".

The two routes below set the **default** (what applies while the panel field is unset):

1. **Settings → Plugins → plugin config** (the host builds that form from this plugin's `Config` schema)
2. The profile's `cordis.patch.yml`:

```yaml
- id: prompt-desk
  name: dsh-prompt-ErrorNotes-desk
  config:
    injectLimit: 20      # non-negative integers only
```

Only a **non-negative integer** is accepted: a negative, fractional or non-numeric value is refused (the panel says so; the schema gives a specific reason such as `expected number >= 0 but got -5`).

> A stripped-down host may not provide `@deepseek-ai/schemastery` — the package that renders the settings form. Nothing breaks in that case: the panel's field and the patch's `config` both keep working; the field simply does not appear in Settings.

## Design notes

- **Mutual exclusivity is structural, not enforced.** Both buttons and both panels live in one slot registration sharing one `openPanel` state. With two separate registrations each panel would own its own `useState`, and "at most one open" would need cross-component coordination — a desync waiting to happen.
- **Opaque surfaces on purpose.** The panels use `--dsw-static-neutral-bluish-*` rather than `--dsw-alias-bg-layer-*`: a liquid-glass theme plugin (such as `dsh-plugin-wallpaper-engine`) rewrites those aliases into translucent films, so anything painted with them lets the wallpaper show through and the text becomes hard to read.
- **State on disk is never trusted.** Every field is validated on read, so a hand-edited or half-written file degrades to defaults instead of raising a `TypeError` on each request.
- **Styles and registrations are effects**, so unloading the plugin (or an HMR reload) removes the stylesheet and both slot registrations.

## Verified against the installed harness

These were checked in source rather than assumed:

- Plugin `inject` exports are string arrays (`['tools']`); there is no `{optional: [...]}` object form. Optional services are taken with `ctx.inject([...], cb)` so they do not gate activation.
- `webServer.register({ kind, path, handler })` returns a disposer.
- `PromptSection.text` is typed `string | ((context: AssembleContext) => string)`.
- `conversation.session.header.utilities` is a `list`, session-scoped slot; its components receive `{ sessionId, useSessions }`.
- The dark-theme attribute is `data-ds-dark-theme`.

## Licence

MIT
