/**
 * dsh-prompt-ErrorNotes-desk — Host half.
 *
 * Owns the durable state behind the two conversation-header panels:
 *
 *   1. **提示词**   — the cross-conversation global prompt (the file the official
 *      `dsh-agent-instructions` plugin already loads, i.e. `$DSH_HOME/AGENTS.md`)
 *      plus a per-session addition that survives into the next conversation.
 *   2. **错误经验** — a categorised list of the agent's recurring mistakes, each a
 *      short type plus one-sentence lesson, so a later turn can absorb them cheaply.
 *
 * The browser half never touches the filesystem: it reads and writes through the
 * same-origin routes registered here. Keeping the file I/O on the Host means the
 * Client stays a pure renderer and nothing silently writes outside `$DSH_HOME`.
 *
 * Contract with the Client (client.js):
 *   GET  /prompt-desk/state   -> the full payload described by `currentState()`
 *   GET  /prompt-desk/pending -> { pending: number }  (cheap; the header badge polls this)
 *   POST /prompt-desk/state {patch} -> the updated state
 *
 * `webServer` is injected optionally: a profile without an HTTP server loads this
 * plugin and it simply stays inactive instead of throwing.
 *
 * Configuration: the `Config` schema below exposes one field, `injectLimit` — how
 * many recent error entries reach the system prompt (default 10; 0 injects none).
 * The host renders it in the plugin settings, and it can equally be set from the
 * profile's `cordis.patch.yml`.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/*
 * `@deepseek-ai/schemastery` is a *host* package, not an ordinary dependency.
 *
 * It cannot be resolved from a plugin directory by plain Node resolution, and it is
 * not installed anywhere in the profile — pnpm's own `.modules.yaml` lists neither
 * it nor any `@deepseek-ai/*` package — yet every plugin in this profile imports it
 * and runs, so the harness supplies it at runtime through its own module hooks.
 *
 * The import is taken defensively because of what is at stake: a plugin that fails
 * to load takes the whole harness down with it (DSH's startup is all-or-nothing), so
 * the failure mode here has to be "no settings form", never "no harness". Without the
 * schema the limit still arrives through `apply`'s `config` argument — which is the
 * loader's job, not the schema's — and the built-in default still applies.
 */
let Schema = null;
try {
  ({ default: Schema } = await import('@deepseek-ai/schemastery'));
} catch {
  Schema = null;
}

/** Route prefix. The Client hardcodes the same string; keep them in sync. */
const BASE = '/prompt-desk';

/** Cap on a request body, so a malformed POST cannot buffer without bound. */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * How many error entries reach the prompt when the profile sets nothing.
 *
 * Ten rather than "as many as fit": the library exists so the model absorbs a
 * reminder, and a list long enough to skim is a list that stops being read.
 */
const DEFAULT_INJECT_LIMIT = 10;

/**
 * Hard ceiling on the configured value.
 *
 * The value comes from YAML a user edits by hand or from a settings field, so a
 * typo (an extra zero) must not turn every request into a thousand-line prompt.
 */
const MAX_INJECT_LIMIT = 200;

/**
 * The build identity of this half, echoed in every payload.
 *
 * The Client bundle is served from `/plugins` and the Host runs from the profile's
 * node_modules, so after a rebuild one of the two is routinely a version ahead of
 * the other. Publishing this lets the panel say so outright instead of defending
 * every field against an older peer. Bump it with package.json.
 */
const PLUGIN_VERSION = '0.4.0';

/**
 * Current on-disk state shape.
 *
 * v1 had no ids, no categories and no pending queue; v2 added those plus the
 * export flag and used a separate `uncategorized` bucket; v3 replaces that bucket
 * with the declared `其他` group.
 */
const STATE_VERSION = 3;

/**
 * The category tree.
 *
 * Grouped by **remedy**, not by symptom: every leaf names a different thing to do
 * differently next time, which is what makes a leaf actionable rather than merely
 * descriptive. The top level is the coarse split a reader scans by ("thought it
 * wrong" / "did it wrong" / "none of the above"); the leaves are what the panel
 * filters and what a future conditional injector would key on.
 *
 * A slug is `"<group>/<leaf>"`, or just `"<group>"` for a group that declares no
 * leaves — which is how `其他` works: it is a real, choosable destination for an
 * entry that fits neither of the two meaningful groups, not a bucket the UI
 * invents behind the user's back. Every slug is validated against this tree on
 * read, so a hand-edited state file cannot invent one.
 */
const CATEGORIES = [
  {
    id: 'reasoning',
    label: '判断与依据错误',
    note: '想错了',
    children: [
      { id: 'verification', label: '验证缺位', hint: '没核实就下结论' },
      { id: 'evidence', label: '依据缺位', hint: '凭推测代替取证' },
    ],
  },
  {
    id: 'execution',
    label: '生成与操作错误',
    note: '做错了',
    children: [
      { id: 'syntax', label: '语法生成', hint: '模板串、转义、拼接' },
      { id: 'tooling', label: '工具与编码', hint: '选错工具或破坏编码' },
    ],
  },
  {
    // Leaf-less on purpose: `其他` is one destination, not a parent of invented
    // sub-kinds. Splitting it would only postpone the decision it exists to defer.
    id: 'other',
    label: '其他',
    note: '暂未归类',
    children: [],
  },
];

/**
 * The slug an entry gets when it carries no valid category.
 *
 * A declared group rather than a special-cased bucket, so it flows through the
 * same validation, the same dropdown and the same grouping as the other two. This
 * is where an entry lands when a v1 file had no category at all; the panel shows
 * the group with its count, so those entries stay visible to be filed rather than
 * being silently guessed into a leaf.
 */
const OTHER = 'other';

/**
 * The v2 bucket slug, kept only so the read can recognise it as a repair.
 *
 * v2 shipped a separate `uncategorized` bucket; v3 folded that idea into the
 * declared `其他` group. A stored `uncategorized` is therefore a slug this build no
 * longer knows, which `sanitizeState` already treats as something to migrate.
 */
const LEGACY_UNCATEGORIZED = 'uncategorized';

/** Every legal slug: `group/leaf`, or a bare `group` that declares no leaves. */
const CATEGORY_IDS = new Set();
for (const group of CATEGORIES) {
  if (group.children.length === 0) CATEGORY_IDS.add(group.id);
  else for (const leaf of group.children) CATEGORY_IDS.add(`${group.id}/${leaf.id}`);
}

/**
 * The confession cue injected alongside the library.
 *
 * This is what makes automatic capture possible at all: the Host listens for a
 * fixed marker in the assistant's own output, so a self-reported mistake has to be
 * phrased the same way every time. Free-form prose ("这里我判断错了", "上面那步有问题")
 * varies too much to detect reliably.
 *
 * ## Why labelled fields replaced the `｜` separator
 *
 * The previous format was `我犯了个错误：<错在哪>｜<以后怎么避免>`, split on a fullwidth
 * `｜`. Real drafts proved that unreliable: a sentence *quoting* the separator —
 * "（忘了写 `｜`）" — split in the wrong place and produced two junk drafts, and a
 * line carrying the marker with no separator at all was still captured with an empty
 * lesson. A separator character is simply too easy to mention in prose.
 *
 * The labels `错误经过：` and `教训：` are the fix. They are structural anchors a
 * discussion of this feature rarely reproduces by accident, and requiring both — in
 * that order — rejects every real false positive seen so far while still accepting
 * the two ways a confession naturally gets written.
 *
 * ## The format
 *
 * ```
 * 我发现了个错误：错误经过：<what actually happened> 教训：<one actionable rule>
 * ```
 *
 * Both markers are accepted (`我发现了个错误` and `我犯了个错误`) because the model
 * reaches for either one; the marker may also be omitted in favour of the label
 * alone. The marker must start its line, so a sentence that merely mentions it does
 * not open a capture.
 */
const CUE_TITLE = '## 自我认错';
const CUE_BODY = [
  '发现自身错误时，**必须**主动用下面这一行汇报。插件会捕获它、记为待确认草稿，由用户确认后入库：',
  '我发现了个错误：错误经过：<当时实际发生了什么> 教训：<以后怎么做，一句可执行的规则>',
  '',
  '写法要求：',
  '- 两个标签缺一不可，顺序固定为「错误经过：」在前、「教训：」在后；**缺任一标签的那一行不会被捕获**。',
  '- 「错误经过」写**当时实际发生了什么**，不写「我错了」这类空话。',
  '- 「教训」写**下次怎么做**，要能直接照做。',
  '- 三个部分必须在**同一行**内写完。',
  '- 分类由用户在面板里选，不必写进这一行。',
  '',
  '示例：',
  '我发现了个错误：错误经过：把「命令返回非空」当成「命令执行成功」，没查退出码 教训：凡以返回码判断成败的调用，必须同时检查 exit code 与输出。',
].join('\n');

/**
 * Markers that open a confession. Either is accepted; the earliest occurrence in
 * the text wins. A marker only counts when it starts its line — see
 * {@link parseConfession}.
 */
const CONFESSION_MARKERS = ['我发现了个错误', '我犯了个错误'];

/** Label introducing the "what actually happened" field. */
const INCIDENT_LABEL = /错误经过\s*[：:]/;

/** Label introducing the lesson field. */
const LESSON_LABEL = /教训\s*[：:]/;

/**
 * Ceiling on the pending queue.
 *
 * Detection runs on every assistant message, so an agent that confesses repeatedly
 * (or a false positive that keeps recurring) must not be able to grow the queue
 * without bound. Oldest drafts are dropped: a stale unconfirmed draft is worth less
 * than a fresh one.
 */
const MAX_PENDING = 20;

/**
 * Global toggle for /lessons off.
 *
 * Stored at the module level so both the command handler and the prompt
 * assembler reach the same value. A page reload or plugin reload resets it.
 */
let globalLessonsEnabled = true;

/**
 * The plugin's config surface.
 *
 * The host derives the settings UI from this schema rather than from a namespace
 * the plugin registers (dsh >= 0.1.7 reads the plugin's own `Config`), so the
 * fields declared here are exactly what a user gets to edit. `natural()` is
 * `number().step(1).min(0)` in schemastery, i.e. a non-negative integer field.
 *
 * `undefined` when the host does not provide schemastery: that is indistinguishable
 * from a plugin that declares no `Config`, so the host simply shows no form for it.
 */
export const Config = Schema === null ? undefined : Schema.object({
  injectLimit: Schema.natural().default(DEFAULT_INJECT_LIMIT).description(
    '注入系统提示词的错误经验条数上限（默认 10；0 表示不注入）',
  ),
});

/**
 * Resolve `$DSH_HOME`, the directory the official agent-instructions plugin
 * reads its user-global `AGENTS.md` from. Same precedence as the harness.
 */
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
  return join(homedir(), '.dsh');
}

/** Directory this plugin owns; created on first write. */
function dataDir() {
  return join(dshHome(), 'prompt-desk');
}

/**
 * The cross-conversation prompt file.
 *
 * This is deliberately the `AGENTS.md` the harness already loads: writing a
 * second, private copy would give the user two places that both claim to be
 * "the global prompt", and only one of them would actually reach the model.
 */
function globalPromptPath() {
  return join(dshHome(), 'AGENTS.md');
}

function statePath() {
  return join(dataDir(), 'state.json');
}

/** `YYYY-MM-DD` in local time — the date the panel groups by. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A short, collision-resistant id for one entry.
 *
 * Ids exist because the Client edits entries by identity, not by array index. That
 * matters now that the Host appends to the queue on its own: an index captured in
 * the browser before an automatic append would point at the wrong entry afterwards.
 */
let idCounter = 0;
function newId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/**
 * FNV-1a, used only to mint *stable* ids for legacy entries.
 *
 * A v1 file has no ids. Assigning random ones on every read would make them change
 * between two GETs, so an update sent with the id from the first read would miss.
 * Hashing the content instead makes the id reproducible until the one-time
 * migration write persists it.
 */
function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Accept only a slug this build knows; anything else is filed as `其他`. */
function normalizeCategory(value) {
  return typeof value === 'string' && CATEGORY_IDS.has(value) ? value : OTHER;
}

/** Shape written when no state file exists yet. */
function emptyState() {
  return {
    version: STATE_VERSION,
    sessionPrompt: '',
    errors: [],
    pending: [],
    ui: { showPrompt: true, showErrors: false },
    /*
     * Whether the error library (and the confession cue that feeds it) is exported
     * into the system prompt. On by default: the library only earns its keep by
     * reaching the model, and a feature that must be switched on is one the user
     * has to discover first. Off suppresses the library *and* the cue together —
     * asking the agent to confess into a library that is not read would be a
     * dangling instruction.
     */
    exportToPrompt: true,
    /*
     * The panel's own cap on injected entries, or `null` for "follow the configured
     * default". It lives in state rather than in the config because the panel edits
     * it directly, and this file is the one thing the plugin already owns and writes
     * atomically — there is no risk of corrupting the profile patch that way.
     */
    injectLimit: null,
  };
}

/** Read a UTF-8 file, returning a fallback instead of throwing. */
function readTextFile(path, fallback = '') {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * Atomic write: a `.tmp` sibling then a rename, so a reader never observes a
 * half-written file and a crash cannot truncate the user's prompt.
 *
 * The temporary name is unique per call. It used to be a fixed `${path}.tmp`, which
 * was safe only because every write came from a user action; the Host now also
 * writes on its own (the pending queue), so two writers can overlap and a shared
 * temporary name would let them clobber each other's bytes before the rename.
 */
function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid.toString(36)}${idCounter.toString(36)}.tmp`;
  idCounter += 1;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

/**
 * Coerce one arbitrary parsed object into an entry.
 *
 * `null` when the input is not an object at all, so a caller filtering a list can
 * drop the element rather than store a row of defaults.
 *
 * `legacy` says where the input came from, and it decides how a missing id is
 * filled. Reading a stored document (`legacy: true`) mints a *content-derived* id,
 * because a v1 file has no ids and a fresh random one would differ between two
 * reads — making an update sent with the first read's id miss on the second. A
 * brand-new entry (`legacy: false`) mints a fresh unique id, because two entries
 * that happen to share a date and wording are still two entries, and a derived id
 * would collide and make a delete hit both.
 */
function sanitizeEntry(raw, legacy = false) {
  if (raw === null || typeof raw !== 'object') return null;
  const date = typeof raw.date === 'string' && raw.date !== '' ? raw.date : today();
  const type = typeof raw.type === 'string' ? raw.type : '';
  const lesson = typeof raw.lesson === 'string' ? raw.lesson : '';
  const stored = typeof raw.id === 'string' && raw.id !== '' ? raw.id : null;
  return {
    id: stored !== null
      ? stored
      : (legacy ? `legacy-${hash32(`${date}|${type}|${lesson}`)}` : newId('e')),
    date,
    category: normalizeCategory(raw.category),
    type,
    lesson,
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    source: raw.source === 'auto' ? 'auto' : 'manual',
  };
}

/**
 * Coerce one list of entries read from disk.
 *
 * The arrow is load-bearing: passing `sanitizeEntry` directly would hand it the
 * array index as the `legacy` argument, so every entry after the first would be
 * treated as a stored document and the flag would be silently wrong.
 */
function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => sanitizeEntry(entry, true))
    .filter((entry) => entry !== null);
}

/**
 * Coerce arbitrary parsed JSON into the state shape.
 *
 * The state file is on disk and therefore editable by hand or half-written by an
 * older version: every field is validated here rather than trusted, so a corrupt
 * file degrades to defaults instead of producing a `TypeError` on every read.
 *
 * Returns `{ state, migrated }`. `migrated` is true when this read had to invent
 * something (a missing id, a v1 document upgraded to v2). The HTTP route persists
 * such a read once, so ids stop being recomputed; the prompt assembler never does,
 * because it must not write while a request is being assembled.
 */
function sanitizeState(raw) {
  const out = emptyState();
  if (raw === null || typeof raw !== 'object') return { state: out, migrated: false };

  let migrated = raw.version !== STATE_VERSION;

  if (typeof raw.sessionPrompt === 'string') out.sessionPrompt = raw.sessionPrompt;

  out.errors = sanitizeEntries(raw.errors);
  out.pending = sanitizeEntries(raw.pending).slice(-MAX_PENDING);

  // A legacy entry (or one typed straight into the file) has neither an id nor a
  // category. Either omission is a migration, so the read persists its own repair.
  for (const source of [raw.errors, raw.pending]) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      if (item === null || typeof item !== 'object') continue;
      if (typeof item.id !== 'string' || item.id === '') migrated = true;
      // v2's `uncategorized` bucket is gone in v3 — it is now the declared `其他`
      // group — so a stored copy of the old slug is one more thing to repair.
      if (item.category === LEGACY_UNCATEGORIZED || !CATEGORY_IDS.has(item.category)) migrated = true;
      if (item.source !== 'auto' && item.source !== 'manual') migrated = true;
    }
  }

  if (raw.ui !== null && typeof raw.ui === 'object') {
    if (typeof raw.ui.showPrompt === 'boolean') out.ui.showPrompt = raw.ui.showPrompt;
    if (typeof raw.ui.showErrors === 'boolean') out.ui.showErrors = raw.ui.showErrors;
  }

  // Absent (a v1 file) means "still exported", which is what v1 did unconditionally.
  if (typeof raw.exportToPrompt === 'boolean') out.exportToPrompt = raw.exportToPrompt;

  /*
   * The panel's override. Only a non-negative finite number is accepted; anything
   * else (a string, a fraction of a line, a negative count) is dropped back to
   * `null` rather than coerced, so a hand-edited file cannot smuggle in a value the
   * prompt assembler would then have to guess about.
   */
  if (typeof raw.injectLimit === 'number' && Number.isFinite(raw.injectLimit) && raw.injectLimit >= 0) {
    out.injectLimit = Math.min(MAX_INJECT_LIMIT, Math.trunc(raw.injectLimit));
  }
  return { state: out, migrated };
}

/**
 * Read the state without ever writing.
 *
 * This is the path the prompt assembler takes, and it is deliberately write-free:
 * assembly happens once per model step and can overlap, so a read that repaired the
 * file would race with every other in-flight request.
 */
function readState() {
  return sanitizeState(JSON.parse(readTextFile(statePath(), 'null') || 'null')).state;
}

/** Read the state, persisting a one-time repair so entry ids stop moving. */
function readStateMigrating() {
  const { state, migrated } = sanitizeState(
    JSON.parse(readTextFile(statePath(), 'null') || 'null'),
  );
  if (migrated) saveState(state);
  return state;
}

function saveState(state) {
  writeTextFile(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Coerce the configured limit into an integer in `[0, MAX_INJECT_LIMIT]`.
 *
 * The `Config` schema above already rejects a negative, fractional or non-numeric
 * value (schemastery's `natural()` is `number().step(1).min(0)`), so in practice
 * this sees a clean integer. It still validates, because it is the second of two
 * independent guards: config can also arrive from a profile patch the host did not
 * run through the schema, and `slice(-0)` would silently mean "inject everything".
 *
 * Semantics: `0` is the explicit "inject nothing". A value that is not a usable
 * count at all falls back to the default rather than to `0`, because quietly
 * switching the feature off is a worse failure than ignoring a typo.
 */
function normalizeInjectLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_INJECT_LIMIT;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_INJECT_LIMIT;
  return Math.min(MAX_INJECT_LIMIT, Math.trunc(n));
}

/**
 * The cap actually in force for a given state.
 *
 * Two places can carry a number, so the precedence has to be stated once and only
 * once: **the panel's own value wins when it is set, otherwise the configured
 * default applies.** The panel is where a user tunes this while looking at their
 * library, so an explicit choice made there must not be silently overridden by a
 * `config:` block they set earlier; clearing the field in the panel puts it back on
 * the configured default, which is how the two stay reconcilable.
 */
function effectiveInjectLimit(state, configLimit) {
  return state.injectLimit === null ? configLimit : normalizeInjectLimit(state.injectLimit);
}

/**
 * Build the text this plugin contributes to the system prompt.
 *
 * Deliberately terse and imperative. The rules that shape it:
 *
 *   · **Type + lesson only** — the stored `detail` explains the incident but is
 *     not injected. It is the most token-expensive field and the least
 *     actionable; the lesson is the distilled instruction.
 *   · **Newest first** — a fresh mistake is more likely to recur than an old one,
 *     so when the limit truncates, the oldest entries are the ones dropped.
 *   · **Export is one switch** — the library and the confession cue are gated by
 *     the same flag. They are two halves of one loop (the cue produces entries,
 *     the library reads them back), so a state where one runs without the other is
 *     never useful.
 *   · **Toggle applies to the error block only** — the session prompt and the
 *     self-confession cue always reach the assembler, because the toggle is for
 *     "stop reminding me of past mistakes", not "stop processing what I say".
 *
 * Returns the pieces as well as the joined text: the panel shows the user exactly
 * this block, and the assembly path next to it, so the two cannot drift.
 *
 * A limit of `0` injects no entries (`slice(-0)` would mean "everything", so this
 * is checked). An empty result is skipped by the assembler, so a user with no
 * prompt, no errors and export switched off pays nothing.
 */
function buildSectionText(state, configLimit, { lessonsEnabled = true } = {}) {
  const limit = effectiveInjectLimit(state, configLimit);

  const sessionBlock = state.sessionPrompt.trim() === ''
    ? ''
    : `## Session instructions (from the user, this conversation)\n${state.sessionPrompt.trim()}`;

  let errorBlock = '';
  let injectedCount = 0;
  if (state.exportToPrompt && lessonsEnabled && state.errors.length > 0 && limit > 0) {
    const recent = state.errors.slice(-limit).reverse();
    injectedCount = recent.length;
    const lines = recent.map((entry) => {
      const type = (entry.type || '').trim();
      const lesson = (entry.lesson || '').trim();
      if (type !== '' && lesson !== '') return `- ${type} → ${lesson}`;
      return `- ${type || lesson}`;
    });
    errorBlock = '## Mistakes you have made before — do not repeat them\n'
      + lines.join('\n')
      + (state.errors.length > limit
        ? `\n(Showing the most recent ${limit} of ${state.errors.length}.)`
        : '');
  }

  const cueBlock = state.exportToPrompt ? `${CUE_TITLE}\n${CUE_BODY}` : '';

  const text = [sessionBlock, errorBlock, cueBlock].filter((part) => part !== '').join('\n\n');
  return { text, sessionBlock, errorBlock, cueBlock, injectedCount, limit };
}

/**
 * The full payload the Client renders.
 *
 * Everything the panel needs to describe the current state — including the exact
 * injected text and the build identity — is computed here rather than in the
 * browser. The Client cannot see the filesystem, the config, or the assembler's
 * limit, so any number it derived for itself would be a second opinion that drifts
 * from the one the model actually gets.
 */
function currentState(configLimit, { migrating = false } = {}) {
  const state = migrating ? readStateMigrating() : readState();
  const hasSession = state.sessionPrompt.trim() !== '';
  const globalPrompt = readTextFile(globalPromptPath(), '');
  const built = buildSectionText(state, configLimit, { lessonsEnabled: globalLessonsEnabled });

  return {
    // The build handshake: the panel compares this with its own constant and warns
    // when a stale bundle is talking to a newer Host (or the reverse).
    pluginVersion: PLUGIN_VERSION,
    stateVersion: STATE_VERSION,
    categories: CATEGORIES,

    // The global prompt is the harness's own AGENTS.md, read fresh every time so
    // an edit made in a text editor shows up on the next panel open.
    globalPrompt,
    globalPromptPath: globalPromptPath(),
    sessionPrompt: state.sessionPrompt,
    errors: state.errors,
    pending: state.pending,
    ui: state.ui,
    exportToPrompt: state.exportToPrompt,

    /*
     * Injection accounting, computed HERE rather than in the Client.
     *
     * The panel shows "N of M entries are being injected"; if the browser counted
     * for itself it would have to duplicate the limit, and the two copies would
     * drift the moment the limit changes — the panel would then confidently report
     * a number that the prompt assembler does not agree with. One source, projected
     * to the Client, including the limit that is actually in force and where that
     * number came from, so the field in the panel can show its own state.
     */
    injection: {
      sessionPromptActive: hasSession,
      globalPromptActive: globalPrompt.trim() !== '',
      errorsInjected: built.injectedCount,
      errorsTotal: state.errors.length,
      errorLimit: built.limit,
      errorLimitDefault: configLimit,
      errorLimitCustom: state.injectLimit,
      exportToPrompt: state.exportToPrompt,
      cueActive: built.cueBlock !== '',
      /*
       * The `/lessons off` state. It is reported so the panel can show it: a mode
       * that suppresses output without appearing anywhere in the UI is one the user
       * will forget they turned on and then blame on a broken plugin.
       */
      lessonsEnabled: globalLessonsEnabled,
    },

    /*
     * The literal text the next assembly will contribute. Rendered verbatim in the
     * panel as a monospace block, because "how many entries are injected" is a
     * statistic while "this is the sentence the model reads" is the thing the user
     * is actually trying to judge.
     */
    preview: {
      sectionText: built.text,
      sessionBlock: built.sessionBlock,
      errorBlock: built.errorBlock,
      cueBlock: built.cueBlock,
    },

    /*
     * Installation self-check. Every field here is something the panel would
     * otherwise have to guess: that its HTTP peer is this plugin (it answered), where
     * the state lives (so a user can look), and whether the export switch is on.
     */
    selfCheck: {
      hostVersion: PLUGIN_VERSION,
      // Reaching this handler at all proves the Host half is loaded and its route is
      // mounted; a failure surfaces in the Client as a fetch error instead.
      hostRouteOk: true,
      statePath: statePath(),
      dataDir: dataDir(),
      errorsTotal: state.errors.length,
      errorsInjected: built.injectedCount,
      pendingTotal: state.pending.length,
      exportToPrompt: state.exportToPrompt,
      lessonsEnabled: globalLessonsEnabled,
    },

    limitBounds: { min: 0, max: MAX_INJECT_LIMIT },
  };
}

/** Collect a request body with a hard byte cap. */
function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

/** Coerce a patch field into a trimmed string, or `undefined` to leave it alone. */
function patchText(value) {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Apply a Client patch onto the stored state and persist it.
 *
 * Operations are **addressed by entry id**, never by array position. The Host now
 * appends to the library on its own, so an index the browser captured before that
 * append would name a different entry by the time the write lands.
 *
 * Only these keys are accepted — an unknown key is ignored rather than written, so
 * a stale Client cannot inject arbitrary fields into the file.
 */
function applyPatch(patch, configLimit) {
  const state = readState();
  if (patch !== null && typeof patch === 'object') {
    const sessionPrompt = patchText(patch.sessionPrompt);
    if (sessionPrompt !== undefined) state.sessionPrompt = sessionPrompt;

    if (typeof patch.globalPrompt === 'string') writeTextFile(globalPromptPath(), patch.globalPrompt);

    if (typeof patch.exportToPrompt === 'boolean') state.exportToPrompt = patch.exportToPrompt;

    /*
     * The temporary `/lessons` pause — settable from the panel as well as from the
     * command, because a mode that is only reachable by remembering a slash command
     * is a mode most users will never find.
     *
     * Deliberately *not* persisted: this is the "don't nag me during this
     * exploration" switch, and a reload restoring the reminders is exactly what
     * makes it safe to flip carelessly. The durable version of the same intent is
     * `exportToPrompt`, which does live in the state file.
     */
    if (typeof patch.lessonsEnabled === 'boolean') globalLessonsEnabled = patch.lessonsEnabled;

    if (patch.ui !== null && typeof patch.ui === 'object') {
      if (typeof patch.ui.showPrompt === 'boolean') state.ui.showPrompt = patch.ui.showPrompt;
      if (typeof patch.ui.showErrors === 'boolean') state.ui.showErrors = patch.ui.showErrors;
    }

    /*
     * The panel's cap. `null` (or the empty string an emptied number field sends)
     * means "follow the configured default", which is what clearing the field does.
     * Garbage is ignored rather than written: the stored value stays what it was,
     * so a typo in the field cannot silently disable the injection.
     */
    if (patch.injectLimit === null || patch.injectLimit === '') {
      state.injectLimit = null;
    } else if (typeof patch.injectLimit === 'number' || typeof patch.injectLimit === 'string') {
      const n = Number(patch.injectLimit);
      if (Number.isFinite(n) && n >= 0) {
        state.injectLimit = Math.min(MAX_INJECT_LIMIT, Math.trunc(n));
      }
    }

    // A new entry typed by hand. Always filed as uncategorised: the Host has no way
    // to read prose, and guessing a category would put the entry somewhere the user
    // did not choose. The panel asks them instead.
    if (patch.errorAdd !== null && typeof patch.errorAdd === 'object') {
      const entry = sanitizeEntry({
        date: today(),
        category: OTHER,
        type: patchText(patch.errorAdd.type) || '',
        lesson: patchText(patch.errorAdd.lesson) || '',
        detail: patchText(patch.errorAdd.detail) || '',
        source: 'manual',
      });
      if (entry !== null && (entry.type !== '' || entry.lesson !== '')) state.errors.push(entry);
    }

    // Re-file or re-word an existing entry.
    if (patch.errorUpdate !== null && typeof patch.errorUpdate === 'object') {
      const id = patchText(patch.errorUpdate.id);
      const entry = id === undefined ? undefined : state.errors.find((item) => item.id === id);
      if (entry !== undefined) {
        const category = patchText(patch.errorUpdate.category);
        if (category !== undefined) entry.category = normalizeCategory(category);
        const type = patchText(patch.errorUpdate.type);
        if (type !== undefined) entry.type = type;
        const lesson = patchText(patch.errorUpdate.lesson);
        if (lesson !== undefined) entry.lesson = lesson;
        const detail = patchText(patch.errorUpdate.detail);
        if (detail !== undefined) entry.detail = detail;
      }
    }

    if (typeof patch.errorDelete === 'string') {
      state.errors = state.errors.filter((entry) => entry.id !== patch.errorDelete);
    }

    // Move a confirmed draft into the library, carrying whatever the user edited.
    if (patch.pendingAccept !== null && typeof patch.pendingAccept === 'object') {
      const id = patchText(patch.pendingAccept.id);
      const index = id === undefined ? -1 : state.pending.findIndex((item) => item.id === id);
      if (index >= 0) {
        const draft = state.pending[index];
        state.pending.splice(index, 1);
        const entry = sanitizeEntry({
          date: draft.date,
          category: patchText(patch.pendingAccept.category) ?? draft.category,
          type: patchText(patch.pendingAccept.type) ?? draft.type,
          lesson: patchText(patch.pendingAccept.lesson) ?? draft.lesson,
          detail: patchText(patch.pendingAccept.detail) ?? draft.detail,
          source: 'auto',
        });
        if (entry !== null) state.errors.push(entry);
      }
    }

    if (typeof patch.pendingDelete === 'string') {
      state.pending = state.pending.filter((item) => item.id !== patch.pendingDelete);
    }

    if (patch.pendingClear === true) state.pending = [];
  }
  saveState(state);
  return currentState(configLimit);
}

/**
 * Parse one confession line into a draft entry.
 *
 * `null` when the text carries no confession. The marker is searched for anywhere
 * in the message rather than anchored to the start, because it legitimately appears
 * mid-sentence (a model often narrates what it is doing first). Only the first
 * occurrence is taken: one message yields at most one draft, so a model that repeats
 * the phrase cannot flood the queue from a single turn.
 *
 * The text after the marker runs to the end of its line, which is what keeps a
 * confession from swallowing the paragraphs that follow it.
 */
/**
 * Upper bound on the "what went wrong" half, in characters.
 *
 * Calibrated against the real library rather than guessed: the longest genuine
 * incident in the user's own entries is 85 characters. 200 leaves generous room for
 * a longer description while still rejecting the failure this exists to stop — a
 * whole paragraph of surrounding prose swept up because the marker happened to
 * appear inside it (one such draft was 30+ characters of a README sentence, another
 * ran to the end of a code comment).
 */
const MAX_INCIDENT_CHARS = 200;

/**
 * Characters that can only start a code fragment, not a natural-language incident.
 *
 * A real "what went wrong" begins with a word. These starts are what a quoted
 * snippet looks like: the marker appears inside source code or an example, and the
 * text right after it is punctuation left over from the quoting.
 */
const CODE_START = /^[;:'"`)\]},.<>|/\\]/;

/**
 * Parse one assistant message for a confession.
 *
 * Returns a draft, or null when the text is not a confession. Every rejection here
 * is a draft the user does not have to discard by hand, so the checks are
 * deliberately strict — a missed confession costs one manual entry, while a false
 * one costs a review round and erodes trust in the panel.
 *
 * Rejection rules, in order:
 *   1. one of {@link CONFESSION_MARKERS} must appear;
 *   2. it must **start its line** (only whitespace, list bullets or blockquote
 *      markers before it) — a sentence that merely mentions the marker is not a
 *      confession. This is what stops a message *about* this feature from being
 *      captured;
 *   3. the marker's line must carry {@link INCIDENT_LABEL} and then
 *      {@link LESSON_LABEL}, in that order;
 *   4. both fields must be non-empty after trimming;
 *   5. neither may contain angle brackets (an echo of the template itself);
 *   6. the incident must not begin with code punctuation, and must not exceed
 *      {@link MAX_INCIDENT_CHARS}.
 *
 * The two labels are what replaced the old `｜` separator. A separator character
 * gets quoted in prose ("（忘了写 `｜`）") and splits in the wrong place; the labels
 * are far harder to reproduce by accident, and demanding both in order is what
 * rejects the junk drafts users were discarding by hand.
 */
function parseConfession(text) {
  if (typeof text !== 'string') return null;

  // The earliest marker wins, so `我发现了个错误` before `我犯了个错误` reads naturally.
  let at = -1;
  for (const marker of CONFESSION_MARKERS) {
    const index = text.indexOf(marker);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  if (at < 0) return null;

  /*
   * The marker must open its line.
   *
   * Quoting the marker mid-sentence is the normal way a discussion of this feature
   * reads, and every such sentence used to become a draft. Only whitespace, list
   * bullets, ordered-list numbers and blockquote markers may precede it.
   */
  const lineStart = text.lastIndexOf('\n', at) + 1;
  if (!/^[\s\-*+>\d.]*$/.test(text.slice(lineStart, at))) return null;

  // Both labels must sit on the marker's own line; a confession is one line.
  const line = text.slice(at).split(/\r?\n/, 1)[0];

  const incidentMatch = INCIDENT_LABEL.exec(line);
  if (incidentMatch === null) return null;
  const lessonMatch = LESSON_LABEL.exec(line);
  if (lessonMatch === null) return null;
  // Order is fixed: a lesson before the incident is not the documented format.
  if (lessonMatch.index <= incidentMatch.index) return null;

  const incident = line
    .slice(incidentMatch.index + incidentMatch[0].length, lessonMatch.index)
    .trim();
  const rule = line.slice(lessonMatch.index + lessonMatch[0].length).trim();
  if (incident === '' || rule === '') return null;

  /*
   * Reject an echo of the instruction itself.
   *
   * The cue lives in the system prompt and spells the template out in full, so a
   * model that quotes the format back — "错误经过：<当时实际发生了什么> 教训：<…>" — would
   * otherwise be captured verbatim as a confession whose incident is "<当时实际发生了什么>".
   * Angle brackets are the tell: a genuine confession describes an incident and does
   * not wrap it in placeholders. Dropping the line is the right failure here; a
   * false draft costs the user a review round for nothing.
   */
  if (/[<>]/.test(incident) || /[<>]/.test(rule)) return null;

  // A quoted code fragment, not a description of what went wrong.
  if (CODE_START.test(incident)) return null;

  // Too short to describe anything, or so long it is clearly swept-up prose.
  if (incident.length < 4 || incident.length > MAX_INCIDENT_CHARS) return null;

  return {
    date: today(),
    category: OTHER,
    type: incident,
    lesson: rule,
    detail: '',
    source: 'auto',
  };
}

/**
 * Queue a draft, ignoring a repeat of something already waiting.
 *
 * The dedupe key is the incident text: an agent that confesses the same slip in
 * three consecutive messages should produce one draft to confirm, not three. A
 * previously *confirmed* entry is not consulted — if the same mistake happens again
 * after being recorded, that is a real recurrence worth re-recording.
 */
function queuePending(draft) {
  const state = readState();
  const key = (entry) => `${entry.type}\u0000${entry.lesson}`;
  if (state.pending.some((entry) => key(entry) === key(draft))) return false;
  state.pending.push(sanitizeEntry(draft));
  state.pending = state.pending.slice(-MAX_PENDING);
  saveState(state);
  return true;
}

/** Cordis plugin name (also the Loader row id in cordis.patch.yml). */
export const name = 'prompt-desk';

/**
 * No `inject` export on purpose.
 *
 * `webServer` is an *optional* service for this plugin: a profile without an HTTP
 * server has no panel to reach it from, so the plugin must stay loadable instead
 * of parking. Declaring it in the export list would make the Loader wait for it
 * and never activate the plugin there. The dependency is taken lazily with
 * `ctx.inject([...], ...)` below, which is the documented way to keep an
 * optional service from gating activation.
 *
 * (Verified against the installed harness: plugin `inject` exports are string
 * arrays such as `['tools']`; there is no `{optional: [...]}` object form.)
 */
export function apply(ctx, config) {
  /*
   * Resolve the *configured default* cap once, here.
   *
   * `config` is this row's `config:` block from the Loader, already shaped by the
   * `Config` schema above (so a profile that sets nothing still sees the default).
   * Validating it once means neither prompt assembly nor the HTTP route has to
   * re-validate a hand-edited YAML value on every call.
   *
   * This is only the fallback: the panel can override it at runtime, and the
   * override lives in the state file, so the value in force is resolved per call
   * (`effectiveInjectLimit`) rather than frozen here.
   */
  const configLimit = normalizeInjectLimit(config?.injectLimit);

  /*
   * Prompt injection — registered once through `systemPrompt.section`.
   *
   * `scope` here is the injection scope, not an agent scope. The `text`
   * function reads `globalLessonsEnabled` by closure to respect /lessons off.
   */
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'prompt-desk:mistakes-and-instructions',
      order: 10200,
      text: () => {
        try {
          return buildSectionText(readState(), configLimit, {
            lessonsEnabled: globalLessonsEnabled,
          }).text;
        } catch {
          return '';
        }
      },
    });
  });


  // `ctx.inject` runs the callback once the service appears and disposes its
  // registrations when it goes away, so HMR and profile edits stay clean.
  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.webServer;

    scope.effect(() => {
      const dispose = webServer.register({
        kind: 'exact',
        path: `${BASE}/state`,
        handler: (req, res) => {
          const method = (req.method || 'GET').toUpperCase();

          if (method === 'GET') {
            try {
              // The GET route is the one place a repair write is allowed: it is a
              // user-driven read with no assembly in flight, and persisting migrated
              // ids once is what makes them stable for the edits that follow.
              sendJson(res, 200, currentState(configLimit, { migrating: true }));
            } catch (error) {
              sendJson(res, 500, { error: String(error && error.message ? error.message : error) });
            }
            return;
          }

          if (method !== 'POST') {
            res.statusCode = 405;
            res.end('method not allowed');
            return;
          }

          readBody(req).then(
            (text) => {
              let patch = null;
              try {
                patch = JSON.parse(text || '{}');
              } catch {
                sendJson(res, 400, { error: 'invalid JSON body' });
                return;
              }
              try {
                sendJson(res, 200, applyPatch(patch, configLimit));
              } catch (error) {
                sendJson(res, 500, { error: String(error && error.message ? error.message : error) });
              }
            },
            (error) => {
              sendJson(res, 400, { error: String(error && error.message ? error.message : error) });
            },
          );
        },
      });

      // `register` returns a disposer; hand it back so the route is removed when
      // this plugin unloads or reloads.
      return typeof dispose === 'function' ? dispose : undefined;
    });

    /*
     * A second, deliberately trivial route for the header badge.
     *
     * The badge has to stay current while both panels are closed, so it polls. It
     * must not poll the full state route: that reads AGENTS.md and rebuilds the whole
     * injection preview on every tick, which is real work to answer a question whose
     * answer is a single integer.
     */
    scope.effect(() => {
      const dispose = webServer.register({
        kind: 'exact',
        path: `${BASE}/pending`,
        handler: (req, res) => {
          try {
            const state = readState();
            sendJson(res, 200, {
              pending: state.pending.length,
              pluginVersion: PLUGIN_VERSION,
            });
          } catch (error) {
            sendJson(res, 500, { error: String(error && error.message ? error.message : error) });
          }
        },
      });
      return typeof dispose === 'function' ? dispose : undefined;
    });
  });

  /*
   * Automatic capture — wired to the harness event feed.
   *
   * The Host listens for the assistant's own stream to detect confessions.
   * Stream frames are scoped to an agent, so the listener is registered through
   * `scope` on the `systemPrompt` service (or an agent's own ctx), but since
   * the event is `Scoped<Agent>` and the plugin uses `ctx.on`, the global
   * listener receives *every* agent's stream regardless of scope.
   *
   * The protocol:
   *   · Start a frame-buffer per agent when a `start` frame arrives.
   *   · Accumulate `text-delta` chunks from the same attempt.
   *   · On `committed` end: join the deltas, run `parseConfession`, and if
   *     a draft was found call `queuePending`.
   *   · On `abandoned` end: discard the buffer (the model's output was never
   *     committed to the conversation, so nothing was "said").
   *
   * A WeakMap keyed on the Agent id (a string) holds in-flight buffers.
   * It never holds a reference that prevents GC: an `end` frame removes the
   * entry, and a disposed agent leaves a stale entry that will never be read
   * again, so the Map is a memory leak only in volume (a few hundred bytes
   * per orphaned entry, bounded by the number of agents that ever streamed).
   */
  const streamBuffers = new Map();

  const onAssistantStream = (payload) => {
    try {
      const agentKey = payload.agent.id;

      if (payload.frame.type === 'start') {
        // Reset buffer for this stream attempt. Multiple starts before an end
        // shouldn't happen, but if they do, the latest start wins.
        streamBuffers.set(agentKey, []);
        return;
      }

      if (payload.frame.type === 'chunk' && payload.frame.chunk.type === 'text-delta') {
        const buf = streamBuffers.get(agentKey);
        if (buf !== undefined) buf.push(payload.frame.chunk.text);
        return;
      }

      if (payload.frame.type === 'end') {
        const buf = streamBuffers.get(agentKey);
        streamBuffers.delete(agentKey);
        if (buf === undefined || buf.length === 0) return;

        // Abandoned — the output never reached the conversation, skip it.
        if (payload.frame.outcome.kind === 'abandoned') return;

        const fullText = buf.join('');
        const draft = parseConfession(fullText);
        if (draft !== null) queuePending(draft);
      }
    } catch {
      // A listener failure must not break the event dispatch.
    }
  };

  /*
   * Subscribing is best-effort on purpose.
   *
   * Whether a listener registered on this plugin's global `ctx` actually receives
   * `agent/assistant-stream` — dispatched as `Scoped<Agent>` — could not be settled
   * from the API catalog, and it can go wrong in two different ways. The benign one
   * is that the event never arrives and capture stays inert. The dangerous one is
   * that the subscription call itself throws while the plugin is loading: DSH
   * startup is all-or-nothing, so a throw here would take the whole harness down
   * with it. Wrapping costs nothing and turns the worst case into "no automatic
   * capture" instead of "no harness".
   */
  try {
    ctx.on('agent/assistant-stream', onAssistantStream);
  } catch {
    // Leave capture inert; every other feature is unaffected.
  }

  /*
   * Global /lessons off command.
   *
   * Registered through `ctx.commands.register(...)` at the global scope. The
   * commands service says "global definitions are registered from a plain
   * context; definitions registered through a command-injected child of an
   * agent context shadow globals for that agent". A global command serves
   * every session.
   *
   * The `text()` function for the prompt section only receives an opaque
   * `AssembleContext.scope` object — not the Agent id string that the command
   * handler sees on `invocation.agent.id`. Until the scope → id mapping is
   * proven by runtime inspection, the toggle is *global*: `/lessons off`
   * affects all agents. The user types it in one conversation and every
   * session stops receiving library injections. That's a safe simplification.
   */
  const lessonsCommand = {
    name: 'lessons',
    description: '临时开关：/lessons off 关闭错误经验注入，/lessons on 恢复。全局生效（跨对话）。',
    input: { hint: 'on 或 off' },
    handler(invocation) {
      const raw = invocation.rawInput.trim().toLowerCase();

      if (raw === 'off') {
        globalLessonsEnabled = false;
        return { kind: 'success', text: '已全局关闭错误经验注入。' };
      }
      if (raw === 'on') {
        globalLessonsEnabled = true;
        return { kind: 'success', text: '已全局恢复错误经验注入。' };
      }
      // A bare `/lessons` toggles. Anything else is a typo, and silently toggling on
      // a typo would leave the user believing they had turned the injection *on*
      // when they had actually turned it off.
      if (raw === '') {
        globalLessonsEnabled = !globalLessonsEnabled;
        return {
          kind: 'success',
          text: globalLessonsEnabled ? '已全局恢复错误经验注入。' : '已全局关闭错误经验注入。',
        };
      }
      return { kind: 'error', text: '用法：/lessons on | /lessons off（不带参数则翻转当前状态）' };
    },
  };

  /*
   * Registration is best-effort for the same reason as the stream subscription
   * above: `register(definition)` was read from the API catalog but never seen at a
   * real call site, and a throw while the plugin is activating can take the whole
   * harness down. If the shape differs, `/lessons` is simply unavailable.
   */
  ctx.inject(['commands'], (scope) => {
    try {
      scope.commands.register(lessonsCommand);
    } catch {
      // A convenience only; nothing else depends on it.
    }
  });
}
