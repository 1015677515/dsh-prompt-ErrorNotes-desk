# 安装说明 / Installation

本插件只发布在 GitHub，未发布到 npm。

- 仓库：https://github.com/1015677515/dsh-prompt-ErrorNotes-desk
- 版本：0.1.0
- 要求：DSH `>=0.2.0-rc.1`，Node `^22.19.0 || >=24.0.0`

---

## 一、最简单的方式（应用内安装）

1. 打开 **设置 → 插件**
2. 点 **安装**
3. 在输入框里填下面这一行，然后确认：

```
github:1015677515/dsh-prompt-ErrorNotes-desk
```

4. 安装完成后**重启 DSH**（原因见下）

### 为什么不用写 commit SHA

安装界面接受的三种输入是：npm 包名、GitHub 地址、本地目录路径。填 GitHub
短地址时，市场会自己把默认分支的 HEAD 解析成 40 位 commit SHA，再把
`github:owner/repo#<sha>` 这种已固定的形式交给 pnpm。

这样做的意义：profile 是从 lockfile 里**按 codeload URL 结尾的 40 位 SHA**
反查插件版本的。所以必须 pin 到提交，版本号才显示得出来。

> ⚠️ **不要自己加 `#HEAD`**，也不要让安装源停在会移动的分支上。
> 源码注释原文：HEAD 形态的 tarball「installs perfectly and then reports no
> version forever」——能装上，但版本栏永远为空，而且之后检测不到更新。

---

## 二、本地目录方式（开发时用）

已经克隆到本机时，直接填目录：

```
A:\大肥鱼工作区\dsh-prompt-ErrorNotes-desk
```

安装界面会提示「本地目录」，填目录即可（不用填到 `package.json`）。

**开发时的好处**：local 安装默认是**目录链接**（Windows 上是 Junction），
改完源码刷新页面就生效，不必重装。想确认是否链接形态，可以看
`profile/node_modules/<包名>` 的属性里有没有 `LinkType: Junction`。

---

## 三、手动写进 profile

在自己的 bundle 的 `cordis.patch.yml` 里加一行：

```yaml
- insert:
    - id: prompt-desk
      name: dsh-prompt-ErrorNotes-desk
```

---

## 四、装完之后

### 必须重启 DSH

浏览器半边会热重载，但**宿主半边不会**——官方文档写明
「replacing an installed package requires restart to load a fresh JavaScript
module generation」。而往系统提示词里注入内容正是宿主半边负责的，所以：

- 不重启：面板能打开、能编辑，但**注入不生效**
- 重启后：注入才真正开始影响对话

### 怎么确认装好了

对话标题栏右侧会出现两个按钮：**「提示词」**与**「错误库」**。
点面板以外的空白处会自动关闭（按 Esc 也可以）。

### 怎么确认注入生效了

打开「错误库」面板，列表上方会显示：

```
已注入全部 N 条（下一轮对话生效）
```

或条目超过上限时显示：

```
已注入最近 10 条，共 M 条（下一轮对话生效）
```

看到这行说明宿主半边已加载并把内容送进了系统提示词。

紧接着就是**注入条数上限**输入框，下面那行小字写着当前状态，例如：

```
默认 10 条，当前跟随默认。条数越多，每轮请求注入的 token 越多，消耗随之增加；填 0 则完全不注入，上限 200。清空输入框并保存 = 恢复跟随默认。
```

改完点「保存」即可，下一轮对话生效。（面板以外的空白处点一下、或按 Esc，都会关掉面板。）

---

## 五、常见问题

**装完看不到按钮？**
先重启 DSH。还不行就看插件是否启用，以及 profile 是否有 HTTP 服务
（浏览器半边靠 `GET|POST /prompt-desk/state` 与宿主通信）。

**面板能开但没有「已注入」提示？**
宿主半边还是旧版。重启 DSH。

**提示词改了什么时候生效？**
下一轮对话。注入用的是一个每次组装都会求值的函数，所以不需要重启，
但也不会影响已经发出的那一轮。

**数据存在哪？**

| 内容 | 位置 |
|---|---|
| 全局提示词 | `$DSH_HOME/AGENTS.md` |
| 本次对话提示词、错误库、面板开关 | `$DSH_HOME/prompt-desk/state.json` |

全局提示词**就是** DSH 官方 `dsh-agent-instructions` 读的那个文件，
本插件不另存副本——否则会出现两个都自称「全局提示词」的文件，
只有一个真正生效。

**会不会写坏我的文件？**
写入是原子的（先写 `.tmp` 再改名），崩溃不会截断内容；
读入时每个字段都会校验，手改坏了的文件会退回默认值而不是报错。
浏览器半边完全不碰文件系统，所有读写都在宿主半边，不会写到 `$DSH_HOME` 之外。

**要卸载怎么办？**
在插件页面卸载即可。数据文件（`$DSH_HOME/prompt-desk/`、`$DSH_HOME/AGENTS.md`）
不会被自动删除——它们是你的内容，需要自己决定留不留。
