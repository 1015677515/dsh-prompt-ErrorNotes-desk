/**
 * dsh-prompt-ErrorNotes-desk — Host half.
 *
 * Owns the durable state behind the two conversation-header panels:
 *
 *   1. **提示词**   — the cross-conversation global prompt (the file the official
 *      `dsh-agent-instructions` plugin already loads, i.e. `$DSH_HOME/AGENTS.md`)
 *      plus a per-session addition that survives into the next conversation.
 *   2. **错误经验** — a dated list of the agent's recurring mistakes, each a short
 *      type plus one-sentence lesson, so a later turn can absorb them cheaply.
 *
 * The browser half never touches the filesystem: it reads and writes through the
 * same-origin routes registered here. Keeping the file I/O on the Host means the
 * Client stays a pure renderer and nothing silently writes outside `$DSH_HOME`.
 *
 * Contract with the Client (lib/client.js):
 *   GET  /prompt-desk/state          -> { globalPrompt, sessionPrompt, errors, ui }
 *   POST /prompt-desk/state {patch}  -> the updated state
 *
 * `webServer` is injected optionally: a profile without an HTTP server loads this
 * plugin and it simply stays inactive instead of throwing.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Route prefix. The Client hardcodes the same string; keep them in sync. */
const BASE = '/prompt-desk';

/** Cap on a request body, so a malformed POST cannot buffer without bound. */
const MAX_BODY_BYTES = 512 * 1024;

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

/** Shape written when no state file exists yet. */
function emptyState() {
  return {
    version: 1,
    sessionPrompt: '',
    errors: [],
    ui: { showPrompt: true, showErrors: false },
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
 */
function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, path);
}

/**
 * Coerce arbitrary parsed JSON into the state shape.
 *
 * The state file is on disk and therefore editable by hand or half-written by an
 * older version: every field is validated here rather than trusted, so a corrupt
 * file degrades to defaults instead of producing a `TypeError` on every read.
 */
function sanitizeState(raw) {
  const out = emptyState();
  if (raw === null || typeof raw !== 'object') return out;

  if (typeof raw.sessionPrompt === 'string') out.sessionPrompt = raw.sessionPrompt;

  if (Array.isArray(raw.errors)) {
    out.errors = raw.errors
      .filter((e) => e !== null && typeof e === 'object')
      .map((e) => ({
        date: typeof e.date === 'string' && e.date !== '' ? e.date : new Date().toISOString().slice(0, 10),
        type: typeof e.type === 'string' ? e.type : '',
        lesson: typeof e.lesson === 'string' ? e.lesson : '',
        detail: typeof e.detail === 'string' ? e.detail : '',
      }));
  }

  if (raw.ui !== null && typeof raw.ui === 'object') {
    if (typeof raw.ui.showPrompt === 'boolean') out.ui.showPrompt = raw.ui.showPrompt;
    if (typeof raw.ui.showErrors === 'boolean') out.ui.showErrors = raw.ui.showErrors;
  }
  return out;
}

function loadState() {
  return sanitizeState(JSON.parse(readTextFile(statePath(), 'null') || 'null'));
}

function saveState(state) {
  writeTextFile(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

/** The full payload the Client renders. */
function currentState() {
  const state = loadState();
  const hasSession = state.sessionPrompt.trim() !== '';
  const injected = Math.min(state.errors.length, INJECT_ERROR_LIMIT);
  return {
    // The global prompt is the harness's own AGENTS.md, read fresh every time so
    // an edit made in a text editor shows up on the next panel open.
    globalPrompt: readTextFile(globalPromptPath(), ''),
    globalPromptPath: globalPromptPath(),
    sessionPrompt: state.sessionPrompt,
    errors: state.errors,
    ui: state.ui,
    /*
     * Injection accounting, computed HERE rather than in the Client.
     *
     * The panel shows "N of M entries are being injected"; if the browser counted
     * for itself it would have to duplicate INJECT_ERROR_LIMIT, and the two copies
     * would drift the moment the limit changes — the panel would then confidently
     * report a number that the prompt assembler does not agree with. One source,
     * projected to the Client.
     */
    injection: {
      sessionPromptActive: hasSession,
      globalPromptActive: (readTextFile(globalPromptPath(), '')).trim() !== '',
      errorsInjected: injected,
      errorsTotal: state.errors.length,
      errorLimit: INJECT_ERROR_LIMIT,
    },
  };
}

/**
 * How many error entries reach the prompt.
 *
 * The library exists to save tokens, so it must not become a token sink: a user
 * who logs every slip for a year would otherwise carry hundreds of lines into
 * every request. Only the most recent slice is injected; the full list stays
 * readable in the panel.
 */
const INJECT_ERROR_LIMIT = 20;

/**
 * Build the text this plugin contributes to the system prompt.
 *
 * Deliberately terse and imperative. Two rules shape it:
 *
 *   · **Type + lesson only** — the stored `detail` explains the incident but is
 *     not injected. It is the most token-expensive field and the least
 *     actionable; the lesson is the distilled instruction.
 *   · **Newest first** — a fresh mistake is more likely to recur than an old one,
 *     so when the limit truncates, the oldest entries are the ones dropped.
 *
 * Returns `''` when there is nothing to say. An empty section is skipped by the
 * assembler, so a user with no prompt and no errors pays nothing.
 */
function buildPromptText() {
  const state = loadState();
  const parts = [];

  const session = state.sessionPrompt.trim();
  if (session !== '') {
    parts.push('## Session instructions (from the user, this conversation)\n' + session);
  }

  const errors = state.errors;
  if (errors.length > 0) {
    const recent = errors.slice(-INJECT_ERROR_LIMIT).reverse();
    const lines = recent.map((e) => {
      const type = (e.type || '').trim();
      const lesson = (e.lesson || '').trim();
      if (type !== '' && lesson !== '') return `- ${type} → ${lesson}`;
      return `- ${type || lesson}`;
    });
    parts.push(
      '## Mistakes you have made before — do not repeat them\n'
      + lines.join('\n')
      + (errors.length > INJECT_ERROR_LIMIT
        ? `\n(Showing the most recent ${INJECT_ERROR_LIMIT} of ${errors.length}.)`
        : ''),
    );
  }

  return parts.join('\n\n');
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

/**
 * Apply a Client patch onto the stored state and persist it.
 *
 * Only these keys are accepted — an unknown key is ignored rather than written,
 * so a stale Client cannot inject arbitrary fields into the file.
 */
function applyPatch(patch) {
  const state = loadState();
  if (patch !== null && typeof patch === 'object') {
    if (typeof patch.sessionPrompt === 'string') state.sessionPrompt = patch.sessionPrompt;
    if (typeof patch.globalPrompt === 'string') writeTextFile(globalPromptPath(), patch.globalPrompt);
    if (Array.isArray(patch.errors)) {
      state.errors = sanitizeState({ errors: patch.errors }).errors;
    }
    if (patch.ui !== null && typeof patch.ui === 'object') {
      if (typeof patch.ui.showPrompt === 'boolean') state.ui.showPrompt = patch.ui.showPrompt;
      if (typeof patch.ui.showErrors === 'boolean') state.ui.showErrors = patch.ui.showErrors;
    }
  }
  saveState(state);
  return currentState();
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
 * `ctx.inject(['webServer'], ...)` below, which is the documented way to keep an
 * optional service from gating activation.
 *
 * (Verified against the installed harness: plugin `inject` exports are string
 * arrays such as `['tools']`; there is no `{optional: [...]}` object form.)
 */
export function apply(ctx) {
  /*
   * Prompt injection — the whole point of the plugin.
   *
   * `ctx.inject(['systemPrompt'], ...)` rather than a top-level `inject` export:
   * a profile that composes no system-prompt service should load this plugin and
   * simply have no injection, instead of parking. The service is reached through
   * `ctx`, never through a module import, so this half needs no host package to
   * resolve.
   *
   * `text` is a **function**, not a string: the assembler calls it on every
   * assembly, so an edit in the panel takes effect on the next turn with no
   * restart and no re-registration. (Verified against the installed harness:
   * `PromptSection.text` is typed `string | ((context: AssembleContext) => string)`.)
   *
   * `order` uses the literal `10200` (DEPLOYMENT_PERSONA_SUFFIX) deliberately
   * instead of `getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')`: the latter is a
   * name-keyed lookup whose value could move between harness versions, and this
   * prompt belongs after the tool documentation either way. Registering at that
   * boundary keeps it out of the tool region entirely.
   */
  ctx.inject(['systemPrompt'], (scope) => {
    // This text is additive guidance, not a replacement for the harness prompt, so
    // an empty result is fine and simply contributes nothing.
    scope.systemPrompt.section({
      name: 'prompt-desk:mistakes-and-instructions',
      order: 10200,
      text: () => {
        try {
          return buildPromptText();
        } catch {
          // A malformed state file must never break prompt assembly for the turn.
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
              sendJson(res, 200, currentState());
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
                sendJson(res, 200, applyPatch(patch));
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
  });
}
