'use strict';
/**
 * Code Manager — Enterprise Script Runner
 * ---------------------------------------
 * Designed for repositories with thousands of scripts.
 *
 * Metadata convention (encoded in file / folder NAMES):
 *   <order><sep><name>--<marker>--<marker>...
 *     order   : leading digits -> execution order (01, 02, 010, ...)
 *     markers : info | text | kode | cli | rec | par | skip | tag=<name>
 *
 * Core API is 100% pure Node (no `vscode`) so it is unit-testable.
 * `activate(context)` is the only vscode-aware entry point.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const VERSION = '1.0.0';
const RUNNABLE_EXTS = ['.ps1', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs', '.sh', '.exe'];
const DEFAULT_IGNORE = [
  '.git',
  '.hg',
  '.svn',
  '.codemanager',
  '.vscode',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.reports',
];
const DEFAULT_MAX_OUTPUT = 262144; // 256 KiB kept per stream
const MAX_DEPTH = 24;

/* ------------------------------------------------------------------ *
 * Metadata                                                           *
 * ------------------------------------------------------------------ */

/** Parse `order` + `kind` + `tags` + flags out of a file/folder name. */
function parseMeta(name) {
  const ext = path.extname(name);
  const isDirLike = ext === '';
  let base = isDirLike ? name : name.slice(0, name.length - ext.length);
  if (base === '') base = name;

  const orderMatch = /^(\d+)/.exec(name);
  let order = orderMatch ? parseInt(orderMatch[1], 10) : null;

  const parts = base.split('--');
  const markers = [];
  let plain = [];

  // A bare numeric part is the order placeholder (e.g. `01--init`).
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    const low = raw.toLowerCase();
    if (low === '') continue;
    if (/^\d+$/.test(low)) {
      if (order === null) order = parseInt(low, 10);
      continue;
    }
    if (low === 'info' || low === 'text' || low === 'kode' || low === 'cli') {
      markers.push({ type: 'kind', value: low });
      continue;
    }
    if (low === 'rec') {
      markers.push({ type: 'rec' });
      continue;
    }
    if (low === 'par') {
      markers.push({ type: 'par' });
      continue;
    }
    if (low === 'skip') {
      markers.push({ type: 'skip' });
      continue;
    }
    if (low.startsWith('tag=') || low.startsWith('t=')) {
      const value = low.slice(low.indexOf('=') + 1);
      if (value) markers.push({ type: 'tag', value: value });
      continue;
    }
    if (
      low.startsWith('depend=') ||
      low.startsWith('dep=') ||
      low.startsWith('after=') ||
      low.startsWith('needs=')
    ) {
      const value = low.slice(low.indexOf('=') + 1);
      if (value) markers.push({ type: 'depend', value: value });
      continue;
    }
    plain.push(raw);
  }

  let kind = 'file';
  const kinds = markers.filter((m) => m.type === 'kind').map((m) => m.value);
  // The LAST kind marker wins: `report--kode--cli` -> cli
  if (kinds.length) kind = kinds[kinds.length - 1];

  return {
    order: order,
    kind: kind,
    tags: markers.filter((m) => m.type === 'tag').map((m) => m.value),
    deps: markers.filter((m) => m.type === 'depend').map((m) => m.value),
    rec: markers.some((m) => m.type === 'rec'),
    parallel: markers.some((m) => m.type === 'par'),
    skip: markers.some((m) => m.type === 'skip'),
    base: plain.length ? plain.join('--') : base,
  };
}

const KIND_RANK = { kode: 0, file: 1, cli: 2, text: 3, info: 4 };

/** Deterministic enterprise ordering: numbers first (numeric!), then names. */
function compareItems(a, b) {
  const ao = a.order === null || a.order === undefined ? Infinity : a.order;
  const bo = b.order === null || b.order === undefined ? Infinity : b.order;
  if (ao !== bo) return ao - bo;
  const ar = KIND_RANK[a.kind] !== undefined ? KIND_RANK[a.kind] : 1;
  const br = KIND_RANK[b.kind] !== undefined ? KIND_RANK[b.kind] : 1;
  if (ar !== br) return ar - br;
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
}

function isIgnored(name, ignore) {
  if (ignore.indexOf(name) !== -1) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * Index (fast recursive discovery)                                   *
 * ------------------------------------------------------------------ */

function entryItem(abs, rel, isDir, st) {
  const name = path.basename(abs);
  const meta = parseMeta(name);
  const ext = isDir ? '' : path.extname(name).toLowerCase();
  const runnable =
    !isDir &&
    RUNNABLE_EXTS.indexOf(ext) !== -1 &&
    meta.kind !== 'info' &&
    meta.kind !== 'text' &&
    meta.kind !== 'cli' &&
    !meta.skip;
  return {
    abs: abs,
    rel: rel,
    dir: path.dirname(abs),
    name: name,
    base: meta.base,
    ext: ext,
    isDir: isDir,
    kind: meta.kind,
    tags: meta.tags,
    deps: meta.deps,
    order: meta.order,
    parallel: meta.parallel,
    skip: meta.skip,
    rec: meta.rec,
    runnable: runnable,
    size: st ? st.size : 0,
    mtimeMs: st ? st.mtimeMs : 0,
  };
}

function buildIndex(root, options) {
  const opt = options || {};
  // SECURITY: user extras are MERGED with the defaults, never replace them,
  // otherwise adding one custom folder would start scanning node_modules/.git.
  const ignore = DEFAULT_IGNORE.slice();
  const extras = opt.ignore || [];
  for (let i = 0; i < extras.length; i++) {
    if (extras[i] && ignore.indexOf(extras[i]) === -1) ignore.push(extras[i]);
  }
  const recursive = opt.recursive !== false;
  const items = [];
  const warnings = [];
  const stack = [{ dir: root, rel: '', depth: 0 }];
  let scannedDirs = 0;
  let skippedDirs = 0;

  if (!root || !fs.existsSync(root)) {
    return {
      root: root,
      items: items,
      warnings: ['root does not exist: ' + root],
      stats: { files: 0, dirs: 0, runnable: 0, skippedDirs: 0, durationMs: 0 },
    };
  }

  const t0 = Date.now();
  while (stack.length) {
    const cur = stack.pop();
    if (!recursive && cur.depth > 0) continue;
    let entries;
    try {
      entries = fs.readdirSync(cur.dir, { withFileTypes: true });
    } catch (err) {
      warnings.push('cannot read ' + cur.rel + ': ' + err.code);
      continue;
    }
    scannedDirs++;
    for (let i = 0; i < entries.length; i++) {
      const de = entries[i];
      const abs = path.join(cur.dir, de.name);
      const rel = cur.rel ? cur.rel + '/' + de.name : de.name;
      let isDir = de.isDirectory();
      if (de.isSymbolicLink()) {
        try {
          isDir = fs.statSync(abs).isDirectory();
        } catch (e) {
          continue;
        }
        continue; // never follow symlinks -> no cycles
      }
      if (isIgnored(de.name, ignore)) {
        if (isDir) skippedDirs++;
        continue;
      }
      const meta = parseMeta(de.name);
      if (meta.skip && isDir) {
        skippedDirs++;
        continue;
      }
      let st = null;
      try {
        st = fs.statSync(abs);
      } catch (e) {
        continue;
      }
      items.push(entryItem(abs, rel, isDir, st));
      if (isDir && recursive && cur.depth + 1 < MAX_DEPTH) {
        stack.push({ dir: abs, rel: rel, depth: cur.depth + 1 });
      }
    }
  }

  const runnable = items.filter((x) => x.runnable);
  return {
    root: root,
    items: items,
    warnings: warnings,
    stats: {
      files: items.filter((x) => !x.isDir).length,
      dirs: items.filter((x) => x.isDir).length + scannedDirs,
      runnable: runnable.length,
      skippedDirs: skippedDirs,
      durationMs: Date.now() - t0,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Plan scopes — `--rec` folders become nested stages                  *
 * ------------------------------------------------------------------ */

/** Map a flat index into `rel -> node` so it can be walked as a tree. */
function indexTree(index) {
  const nodes = new Map();
  const ensure = (rel) => {
    let n = nodes.get(rel);
    if (!n) {
      n = { rel: rel, items: [] };
      nodes.set(rel, n);
    }
    return n;
  };
  ensure('');
  for (const it of index.items) {
    const parts = String(it.rel).split('/');
    const parentRel = parts.slice(0, -1).join('/');
    ensure(parentRel).items.push(it);
    if (it.isDir) ensure(it.rel);
  }
  return nodes;
}

/**
 * Top-level units of one scope.
 *
 * A `--rec` folder is ONE unit (a stage) that carries its own children, so the
 * parent plan shows a nested stage instead of a flat dump of every script.
 * Ordinary folders are flattened into the current scope, which keeps a deep
 * tree behaving exactly like before.
 */
function scopeUnits(node, nodes, matches) {
  const units = [];
  const items = (node && node.items) || [];
  for (const it of items) {
    if (it.isDir) {
      const child = nodes.get(it.rel);
      const kids = child ? scopeUnits(child, nodes, matches) : [];
      if (!kids.length) continue;
      if (it.rec) units.push({ item: it, stage: true, children: kids });
      else for (const k of kids) units.push(k);
    } else if (matches(it)) {
      units.push({ item: it, stage: false });
    }
  }
  units.sort((a, b) => compareItems(a.item, b.item));
  return units;
}

/** Number of runnable scripts in a step list, counting nested stages. */
function countLeaves(steps) {
  let n = 0;
  for (const s of steps) n += s.type === 'stage' ? countLeaves(s.children || []) : 1;
  return n;
}

function countStages(steps) {
  let n = 0;
  for (const s of steps) {
    if (s.type === 'stage') {
      n++;
      n += countStages(s.children || []);
    }
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * Dependencies (`--depend=<tag|order|name>`)                          *
 * ------------------------------------------------------------------ */

/**
 * Resolve `deps` to concrete steps and return a deterministic topological
 * order. Numeric `order` is the tie-breaker, so a plan without dependencies
 * keeps its plain numeric order and stays 100% repeatable.
 *
 * On a cycle we fail safe: the numeric order is kept and a warning is added,
 * because losing work is worse than running in a slightly odd order.
 */
function resolveDependencies(steps, warnings) {
  const warn = warnings || [];
  const byTag = new Map();
  const byOrder = new Map();
  const byName = new Map();

  steps.forEach(function (s) {
    if (s.order !== null && s.order !== undefined) byOrder.set(String(s.order), s);
    byName.set(s.rel, s);
    byName.set(s.name, s);
    (s.tags || []).forEach(function (t) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(s);
    });
  });

  const unknown = [];
  steps.forEach(function (s) {
    const resolved = [];
    (s.deps || []).forEach(function (d) {
      let hit = null;
      if (byTag.has(d)) {
        byTag.get(d).forEach(function (t) {
          if (t !== s && resolved.indexOf(t) === -1) resolved.push(t);
        });
        hit = true;
      } else if (d.startsWith('@')) {
        hit = false;
      }
      if (!hit) {
        let byKey = byOrder.get(String(d));
        // `--depend=09` must find the step whose order is 9.
        if (!byKey && /^\d+$/.test(d)) byKey = byOrder.get(String(parseInt(d, 10)));
        if (!byKey) byKey = byName.get(d);
        if (byKey && byKey !== s && resolved.indexOf(byKey) === -1) resolved.push(byKey);
        else if (!byTag.has(d)) unknown.push({ step: s.rel, dep: d });
      }
    });
    s.resolvedDeps = resolved;
  });

  unknown.forEach(function (u) {
    if (warn.indexOf('unknown dependency') === -1) warn.push('unknown dependency');
    warn.push('  "' + u.dep + '" -> not found (needed by ' + u.step + ')');
  });

  // Kahn's algorithm; always take the smallest ready step => deterministic.
  const ordered = [];
  const remaining = steps.slice();
  const done = new Set();
  let guard = steps.length * steps.length + 2;

  while (remaining.length && guard-- > 0) {
    remaining.sort(compareItems);
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const ready = remaining[i].resolvedDeps.every(function (d) {
        return done.has(d);
      });
      if (ready) {
        picked = i;
        break;
      }
    }
    if (picked === -1) break; // cycle
    const s = remaining.splice(picked, 1)[0];
    done.add(s);
    ordered.push(s);
  }

  if (remaining.length) {
    const cycles = remaining.map(function (s) {
      return s.rel;
    });
    warn.push('dependency cycle detected, kept numeric order: ' + cycles.join(', '));
    return { steps: steps.slice().sort(compareItems), cycles: cycles, unknown: unknown };
  }
  return { steps: ordered, cycles: [], unknown: unknown };
}

/** Order-sensitive fingerprint of a plan, used to validate checkpoints. */
function planFingerprint(steps) {
  let h = 5381;
  let count = 0;
  const walk = (list) => {
    const l = list || [];
    for (let i = 0; i < l.length; i++) {
      const s = l[i];
      count++;
      const str =
        String(s.rel) +
        '|' +
        String(s.exec && s.exec.bin ? s.exec.bin : s.type || '') +
        '|' +
        String(s.order) +
        '|' +
        String((s.children || []).length);
      for (let j = 0; j < str.length; j++) h = ((h * 33) ^ str.charCodeAt(j)) >>> 0;
      if (s.children) walk(s.children);
    }
  };
  walk(steps);
  return count + '-' + h.toString(16);
}

/* ------------------------------------------------------------------ *
 * Plan                                                               *
 * ------------------------------------------------------------------ */

function buildPlan(root, options) {
  const opt = options || {};
  const index = opt.index || buildIndex(root, opt);
  const include =
    opt.includeExtensions && opt.includeExtensions.length ? opt.includeExtensions : null;
  const numberedOnly = !!opt.numberedOnly;
  const tag = opt.tag ? String(opt.tag).toLowerCase() : null;
  const nameRe = opt.nameRe ? new RegExp(opt.nameRe, 'i') : null;
  const limit = opt.limit && opt.limit > 0 ? opt.limit : 0;

  const matches = (it) => {
    if (!it.runnable) return false;
    if (include && include.indexOf(it.ext) === -1) return false;
    if (numberedOnly && (it.order === null || it.order === undefined)) return false;
    if (tag && it.tags.indexOf(tag) === -1) return false;
    if (nameRe && !nameRe.test(it.rel)) return false;
    return true;
  };

  const nodes = indexTree(index);
  const warnings = index.warnings.slice(0);
  const unsupported = [];

  const toStep = (u) => {
    const it = u.item;
    if (u.stage) {
      const kids = u.children.map(toStep).filter(Boolean);
      if (!kids.length) return null;
      return {
        type: 'stage',
        abs: it.abs,
        rel: it.rel,
        name: it.name,
        dir: path.dirname(it.abs),
        ext: '',
        kind: 'rec',
        tags: it.tags,
        deps: it.deps || [],
        order: it.order,
        parallel: false,
        cwd: it.abs,
        exec: null,
        children: kids,
      };
    }
    const exec = resolveExec(it.abs, opt);
    if (!exec) {
      unsupported.push(it.rel);
      return null;
    }
    return {
      type: 'file',
      abs: it.abs,
      rel: it.rel,
      name: it.name,
      dir: it.dir,
      ext: it.ext,
      kind: it.kind,
      tags: it.tags,
      deps: it.deps || [],
      order: it.order,
      parallel: it.parallel,
      cwd: path.dirname(it.abs),
      exec: exec,
    };
  };

  // Dependencies are resolved INSIDE each scope (top level, then every stage),
  // and indexes are numbered per scope: 1., 2. … and 1.1, 1.2 inside a stage.
  const cycles = [];
  const layOut = (list, scopeRel) => {
    const res = resolveDependencies(list, warnings);
    for (const c of res.cycles) cycles.push(c);
    return res.steps.map(function (s, i) {
      const out = Object.assign({}, s);
      out.index = i + 1;
      out.scope = scopeRel;
      out.deps = s.deps || [];
      out.dependsOn = (s.resolvedDeps || []).map((d) => d.rel);
      delete out.resolvedDeps;
      if (s.type === 'stage') out.children = layOut(s.children || [], s.rel);
      return out;
    });
  };

  const units = scopeUnits(nodes.get('') || { items: [] }, nodes, matches);
  const rawSteps = (limit ? units.slice(0, limit) : units).map(toStep).filter(Boolean);
  const planSteps = layOut(rawSteps, '');
  const scripts = countLeaves(planSteps);

  return {
    root: index.root,
    createdAt: new Date().toISOString(),
    steps: planSteps,
    unsupported: unsupported,
    fingerprint: planFingerprint(planSteps),
    cycles: cycles,
    stats: {
      scanned: index.items.length,
      candidates: planSteps.length,
      scripts: scripts,
      stages: countStages(planSteps),
      unsupported: unsupported.length,
      parallel: planSteps.filter((s) => s.parallel).length,
      withDeps: planSteps.filter((s) => (s.deps || []).length).length,
      excluded: index.items.filter((x) => !x.isDir).length - scripts,
      indexMs: index.stats ? index.stats.durationMs : 0,
    },
    warnings: warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Executable resolution                                              *
 * ------------------------------------------------------------------ */

const binCache = Object.create(null);

function whichBin(name) {
  if (!name) return null;
  if (binCache[name] !== undefined) return binCache[name];
  if (name.indexOf(path.sep) !== -1 || name.indexOf('/') !== -1) {
    binCache[name] = fs.existsSync(name) ? name : null;
    return binCache[name];
  }
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (let i = 0; i < dirs.length; i++) {
    for (let j = 0; j < exts.length; j++) {
      const p = path.join(dirs[i], name + exts[j]);
      try {
        if (fs.existsSync(p)) {
          binCache[name] = p;
          return p;
        }
      } catch (e) {
        /* ignore */
      }
    }
  }
  binCache[name] = null;
  return null;
}

function resolveExec(abs, options) {
  const opt = options || {};
  const ext = path.extname(abs).toLowerCase();
  const q = function (s) {
    return '"' + s + '"';
  };
  if (ext === '.ps1') {
    const ps = opt.pwshPath || whichBin('pwsh') || whichBin('powershell');
    if (!ps) return null;
    return {
      cmd: ps,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        abs,
      ],
      display: 'pwsh -File ' + q(abs),
    };
  }
  if (ext === '.bat' || ext === '.cmd') {
    return {
      cmd: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', abs],
      display: 'cmd /c ' + q(abs),
    };
  }
  if (ext === '.py') {
    const py = opt.pythonPath || whichBin('python') || whichBin('python3');
    if (!py) return null;
    return { cmd: py, args: [abs], display: 'python ' + q(abs) };
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return { cmd: process.execPath, args: [abs], display: 'node ' + q(abs) };
  }
  if (ext === '.sh') {
    const bash = whichBin('bash') || 'bash';
    return { cmd: bash, args: [abs], display: 'bash ' + q(abs) };
  }
  if (ext === '.exe') {
    return { cmd: abs, args: [], display: q(abs) };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Runner                                                             *
 * ------------------------------------------------------------------ */

function normalizeRunOptions(options) {
  const o = options || {};
  return {
    stopOnError: o.stopOnError !== false,
    timeoutMs: o.timeoutMs && o.timeoutMs > 0 ? o.timeoutMs : 0,
    retries: o.retries && o.retries > 0 ? Math.floor(o.retries) : 0,
    maxParallel: o.maxParallel && o.maxParallel > 0 ? Math.floor(o.maxParallel) : 4,
    maxOutputBytes: o.maxOutputBytes || DEFAULT_MAX_OUTPUT,
    dryRun: !!o.dryRun,
    env: o.env || null,
    cwd: o.cwd || null,
    fromIndex: o.fromIndex && o.fromIndex > 1 ? Math.floor(o.fromIndex) : 1,
    checkpointFile: o.checkpointFile || null,
  };
}

function groupBatches(steps) {
  const batches = [];
  let cur = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    // A step with dependencies must run alone: its gate needs the result of
    // the steps before it, which a `--par` batch cannot guarantee.
    const gated = !!(s.dependsOn && s.dependsOn.length);
    if (s.parallel && s.exec && !gated) {
      if (!cur) {
        cur = [];
        batches.push(cur);
      }
      cur.push(s);
    } else {
      cur = null;
      batches.push([s]);
    }
  }
  return batches;
}

function keepTail(text, cap) {
  if (!cap || text.length <= cap) return text;
  return '[...truncated...]\n' + text.slice(text.length - cap);
}

function killTree(child) {
  if (!child || child.killed || !child.pid) {
    try {
      if (child) child.kill('SIGKILL');
    } catch (e) {
      /* ignore */
    }
    return;
  }
  try {
    if (process.platform === 'win32') {
      cp.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (e) {
        child.kill('SIGTERM');
      }
    }
  } catch (e) {
    /* ignore */
  }
  try {
    child.kill('SIGKILL');
  } catch (e) {
    /* ignore */
  }
}

function makeResult(step, exec, startedAt, status, code, signal, stdout, stderr) {
  return {
    index: step.index,
    rel: step.rel,
    abs: step.abs,
    ext: step.ext,
    cmd: exec ? exec.display : '',
    status: status,
    exitCode: code === undefined ? null : code,
    signal: signal || null,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    attempts: 1,
    stdout: stdout || '',
    stderr: stderr || '',
  };
}

function spawnOnce(step, opt, signal, emit) {
  return new Promise(function (resolve) {
    const exec = step.exec;
    const startedAt = Date.now();
    let child;
    if (signal && signal.aborted) {
      return resolve(makeResult(step, exec, startedAt, 'cancelled', null, null, '', ''));
    }
    try {
      child = cp.spawn(exec.cmd, exec.args, {
        cwd: step.cwd || opt.cwd || path.dirname(step.abs),
        env: Object.assign({}, process.env, opt.env || {}),
        windowsHide: true,
        shell: false,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      return resolve(
        makeResult(step, exec, startedAt, 'failed', null, null, '', 'spawn error: ' + err.message)
      );
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timer = null;

    const cap = opt.maxOutputBytes;
    const cleanup = function () {
      if (timer) clearTimeout(timer);
      timer = null;
      if (signal && signal.removeEventListener) signal.removeEventListener('abort', onAbort);
    };
    const onAbort = function () {
      cancelled = true;
      killTree(child);
    };

    if (signal && signal.addEventListener)
      signal.addEventListener('abort', onAbort, { once: true });

    if (opt.timeoutMs > 0) {
      timer = setTimeout(function () {
        timedOut = true;
        killTree(child);
      }, opt.timeoutMs);
      if (timer.unref) timer.unref();
    }

    const push = function (stream, data) {
      const text = data.toString('utf8');
      if (stream === 'stdout') stdout = keepTail(stdout + text, cap);
      else stderr = keepTail(stderr + text, cap);
      emit({ type: 'output', stream: stream, step: step, chunk: text });
    };

    if (child.stdout)
      child.stdout.on('data', function (d) {
        push('stdout', d);
      });
    if (child.stderr)
      child.stderr.on('data', function (d) {
        push('stderr', d);
      });

    child.on('error', function (err) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(
        makeResult(step, exec, startedAt, 'failed', null, null, stdout, stderr + '\n' + err.message)
      );
    });

    child.on('close', function (code, sig) {
      if (settled) return;
      settled = true;
      cleanup();
      let status;
      if (timedOut) status = 'timeout';
      else if (cancelled) status = 'cancelled';
      else status = code === 0 ? 'ok' : 'failed';
      resolve(makeResult(step, exec, startedAt, status, code, sig, stdout, stderr));
    });
  });
}

async function runStep(step, opt, signal, emit) {
  emit({ type: 'stepStart', step: step });
  const maxAttempts = opt.retries + 1;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) {
      last = makeResult(step, step.exec, Date.now(), 'cancelled', null, null, '', '');
      last.attempts = attempt;
      break;
    }
    last = await spawnOnce(step, opt, signal, emit);
    last.attempts = attempt;
    if (last.status === 'ok' || last.status === 'cancelled' || last.status === 'timeout') break;
    if (attempt < maxAttempts) emit({ type: 'retry', step: step, attempt: attempt });
  }
  emit({ type: 'stepEnd', step: step, result: last });
  return last;
}

/** Module-level handle so `cancelCurrent()` can stop the active run. */
let currentRun = null;

function cancelCurrent() {
  if (currentRun && currentRun.controller) {
    currentRun.controller.abort();
    return true;
  }
  return false;
}

async function runPlan(plan, options, hooks) {
  const opt = normalizeRunOptions(options);
  const h = hooks || {};
  const emit = function (ev) {
    try {
      if (h.onEvent) h.onEvent(ev);
    } catch (e) {
      /* never break the run because a hook threw */
    }
  };

  const startedAt = Date.now();
  const controller = new AbortController();
  currentRun = { controller: controller, plan: plan, startedAt: startedAt };
  const signal = controller.signal;

  const steps = plan.steps || [];
  const total = steps.length;
  const results = [];
  let status = 'success';
  let completed = 0;

  const record = function (res) {
    results.push(res);
    completed++;
    emit({ type: 'progress', completed: completed, total: total, result: res });
    saveCheckpoint(opt.checkpointFile, plan, opt, results, startedAt);
  };

  // --- resume: everything before `fromIndex` is reported, not re-executed ---
  const pending = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (opt.fromIndex > 1 && s.index < opt.fromIndex) {
      const skipped = makeResult(s, s.exec, Date.now(), 'skipped', null, null, '', '');
      skipped.reason = 'resumed from step ' + opt.fromIndex;
      results.push(skipped);
      emit({ type: 'progress', completed: completed, total: total, result: skipped });
    } else {
      pending.push(s);
    }
  }

  // --- dependency gate: a step runs only when every dependency succeeded ---
  const statusByIndex = new Map();
  results.forEach(function (r) {
    statusByIndex.set(r.index, r.status);
  });
  const indexOfRel = new Map();
  steps.forEach(function (s) {
    indexOfRel.set(s.rel, s.index);
  });
  const blockedBy = function (step) {
    const deps = step.dependsOn || [];
    for (let i = 0; i < deps.length; i++) {
      const idx = indexOfRel.get(deps[i]);
      if (idx === undefined) continue;
      if (statusByIndex.get(idx) !== 'ok') return deps[i];
    }
    return null;
  };

  const batches = groupBatches(opt.dryRun ? [] : pending);

  /**
   * A `--rec` folder runs as ONE stage, strictly sequentially: `--par` is
   * ignored inside it, the dependency gate is evaluated inside the stage, and
   * the stage reports a rolled-up result with the child results nested.
   */
  const runStage = async (stage) => {
    const startedAt = Date.now();
    const kids = [];
    const seen = new Map();
    let agg = 'ok';
    const childEmit = function (ev) {
      if (ev) emit(Object.assign({}, ev, { stage: stage }));
    };
    for (const child of stage.children || []) {
      if (signal.aborted) {
        agg = 'stopped';
        break;
      }
      const blocked = (child.dependsOn || []).find(function (d) {
        return seen.get(d) !== 'ok';
      });
      if (blocked) {
        const r = makeResult(child, child.exec, Date.now(), 'blocked', null, null, '', '');
        r.reason = 'dependency did not succeed: ' + blocked;
        kids.push(r);
        seen.set(child.rel, r.status);
        agg = 'failed';
        childEmit({ type: 'childEnd', step: child, result: r });
        if (opt.stopOnError) break;
        continue;
      }
      // A child can itself be a `--rec` stage, so recurse instead of trying to
      // spawn it (a stage has no interpreter and would fail instantly).
      const r =
        child.type === 'stage'
          ? await runStage(child)
          : await runStep(child, opt, signal, childEmit);
      kids.push(r);
      seen.set(child.rel, r.status);
      if (r.status !== 'ok') {
        agg = 'failed';
        if (opt.stopOnError) break;
      }
    }
    if (signal.aborted) agg = 'stopped';
    const out = makeResult(
      stage,
      { bin: 'stage', display: '[stage] ' + stage.rel },
      startedAt,
      agg,
      null,
      null,
      '',
      ''
    );
    out.children = kids;
    out.scripts = kids.length;
    return out;
  };

  if (opt.dryRun) {
    emit({ type: 'progress', completed: total, total: total, result: null });
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    if (signal.aborted) {
      status = 'stopped';
      break;
    }
    const before = results.length;
    if (batch.length === 1 || opt.maxParallel <= 1) {
      for (let i = 0; i < batch.length; i++) {
        if (signal.aborted) break;
        const blocked = blockedBy(batch[i]);
        if (blocked) {
          const res = makeResult(
            batch[i],
            batch[i].exec,
            Date.now(),
            'blocked',
            null,
            null,
            '',
            ''
          );
          res.reason = 'dependency did not succeed: ' + blocked;
          statusByIndex.set(res.index, res.status);
          record(res);
          if (opt.stopOnError) break;
          continue;
        }
        const res =
          batch[i].type === 'stage'
            ? await runStage(batch[i])
            : await runStep(batch[i], opt, signal, emit);
        statusByIndex.set(res.index, res.status);
        record(res);
        if (res.status !== 'ok' && opt.stopOnError) break;
      }
    } else {
      // Bounded parallel pool for `--par` batches.
      let cursor = 0;
      const workers = [];
      const width = Math.min(opt.maxParallel, batch.length);
      for (let w = 0; w < width; w++) {
        workers.push(
          (async function () {
            while (true) {
              if (signal.aborted) return;
              const idx = cursor++;
              if (idx >= batch.length) return;
              const res = await runStep(batch[idx], opt, signal, emit);
              record(res);
            }
          })()
        );
      }
      await Promise.all(workers);
    }

    const batchFailed = results.slice(before).some(function (r) {
      return r.status !== 'ok';
    });
    if (signal.aborted) {
      status = 'stopped';
      break;
    }
    if (batchFailed && opt.stopOnError) {
      status = 'failed';
      break;
    }
  }

  if (signal.aborted && status === 'success') status = 'stopped';
  if (results.some((r) => r.status === 'failed') && status === 'success') status = 'failed';
  if (status === 'success' && results.some((r) => r.status === 'timeout')) status = 'failed';
  if (status === 'success' && results.some((r) => r.status === 'blocked')) status = 'failed';

  const finishedAt = Date.now();
  const report = {
    runner: 'code-manager-runner',
    version: VERSION,
    id: new Date(startedAt).toISOString().replace(/[:.]/g, '-'),
    root: plan.root,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    status: status,
    cancelled: signal.aborted,
    options: {
      stopOnError: opt.stopOnError,
      timeoutMs: opt.timeoutMs,
      retries: opt.retries,
      maxParallel: opt.maxParallel,
      dryRun: opt.dryRun,
    },
    plan: {
      total: total,
      completed: completed,
      skipped: Math.max(0, total - completed),
      fingerprint: planFingerprint(steps),
    },
    resumedFrom: opt.fromIndex > 1 ? opt.fromIndex : null,
    results: results,
    totals: {
      ok: results.filter((r) => r.status === 'ok').length,
      failed: results.filter((r) => r.status === 'failed').length,
      timeout: results.filter((r) => r.status === 'timeout').length,
      cancelled: results.filter((r) => r.status === 'cancelled').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      durationMs: finishedAt - startedAt,
    },
  };
  currentRun = null;
  emit({ type: 'done', report: report });
  return report;
}

/* ------------------------------------------------------------------ *
 * Checkpoints (crash-safe resume)                                    *
 * ------------------------------------------------------------------ */

function checkpointFile(root, options) {
  const opt = options || {};
  if (opt.checkpointFile) return opt.checkpointFile;
  if (!root) return null;
  return path.join(root, '.codemanager', 'checkpoint.json');
}

/**
 * Written after EVERY step, so a killed / crashed run can be resumed instead
 * of started from scratch. Never throws — a checkpoint must not break a run.
 */
function saveCheckpoint(file, plan, opt, results, startedAt) {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          version: VERSION,
          fingerprint: planFingerprint(plan.steps),
          root: plan.root,
          startedAt: new Date(startedAt).toISOString(),
          updatedAt: new Date().toISOString(),
          fromIndex: (opt && opt.fromIndex) || 1,
          done: results.map((r) => ({ index: r.index, rel: r.rel, status: r.status })),
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (e) {
    /* ignore */
  }
}

function loadCheckpoint(root, options) {
  const file = checkpointFile(root, options);
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * 1-based index of the first step that still has to run, or 1 when there is
 * nothing to resume. A stale checkpoint (tree changed) is ignored.
 */
function resumeIndex(plan, checkpoint) {
  if (!plan || !plan.steps || !plan.steps.length) return 1;
  if (!checkpoint || checkpoint.fingerprint !== planFingerprint(plan.steps)) return 1;
  const done = new Set();
  (checkpoint.done || []).forEach(function (d) {
    if (d.status === 'ok' || d.status === 'blocked' || d.status === 'skipped') done.add(d.index);
  });
  let idx = 1;
  while (idx <= plan.steps.length && done.has(idx)) idx++;
  return idx;
}

function hasResumePoint(root, plan, options) {
  const cp = loadCheckpoint(root, options);
  const idx = resumeIndex(plan, cp);
  const total = plan && plan.steps ? plan.steps.length : 0;
  // Without a checkpoint there is nothing to resume — never offer it just
  // because the plan happens to have steps.
  return { resumable: !!(cp && total > 0 && idx <= total), fromIndex: idx, checkpoint: cp };
}

function clearCheckpoint(root, options) {
  const file = checkpointFile(root, options);
  if (!file) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Watch mode                                                         *
 * ------------------------------------------------------------------ */

/**
 * Watch `root` recursively and call `onChange` after a quiet period.
 * Returns a handle with close(); close() is safe to call more than once.
 */
function watchRoot(root, options, onChange) {
  const opt = options || {};
  const debounceMs = opt.debounceMs && opt.debounceMs > 0 ? opt.debounceMs : 400;
  const ignore = DEFAULT_IGNORE.concat(opt.ignore || []);
  const state = { closed: false, pending: null, events: 0 };

  let watcher = null;
  try {
    watcher = fs.watch(root, { recursive: true }, function (evt, filename) {
      if (state.closed) return;
      const rel = filename ? String(filename) : '';
      const top = rel.split(/[\\/]/)[0];
      if (top && ignore.indexOf(top) !== -1) return;
      if (rel.indexOf('.codemanager') !== -1) return;
      state.events++;
      if (state.pending) clearTimeout(state.pending);
      state.pending = setTimeout(function () {
        state.pending = null;
        if (state.closed) return;
        try {
          onChange({ event: evt, file: rel, events: state.events });
        } catch (e) {
          /* a consumer must never break the watcher */
        }
      }, debounceMs);
      if (state.pending.unref) state.pending.unref();
    });
  } catch (e) {
    return {
      close: function () {},
      error: e,
      events: function () {
        return 0;
      },
      isClosed: function () {
        return true;
      },
    };
  }

  return {
    close: function () {
      state.closed = true;
      if (state.pending) clearTimeout(state.pending);
      state.pending = null;
      try {
        watcher.close();
      } catch (e) {
        /* ignore */
      }
    },
    events: function () {
      return state.events;
    },
    isClosed: function () {
      return state.closed;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Reports / state                                                    *
 * ------------------------------------------------------------------ */

function reportsRoot(root, options) {
  const opt = options || {};
  if (opt.reportsDir) return opt.reportsDir;
  return path.join(root, '.codemanager', 'reports');
}

function writeArtifacts(report, root, options) {
  const base = reportsRoot(root, options);
  const runDir = path.join(base, report.id);
  const logsDir = path.join(runDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  let i = 0;
  for (const res of report.results) {
    i++;
    const safe = String(res.rel)
      .replace(/[\\/]/g, '__')
      .replace(/[^\w.\-]+/g, '_');
    const file = path.join(logsDir, String(i).padStart(3, '0') + '-' + safe + '.log');
    let body =
      '# ' +
      res.rel +
      '\n# cmd: ' +
      res.cmd +
      '\n# status: ' +
      res.status +
      ' exit=' +
      res.exitCode +
      ' duration=' +
      res.durationMs +
      'ms attempts=' +
      res.attempts +
      '\n\n--- stdout ---\n' +
      res.stdout +
      '\n--- stderr ---\n' +
      res.stderr +
      '\n';
    // A `--rec` stage keeps its children nested inside its own log so the run
    // report stays readable instead of exploding into dozens of files.
    if (res.children && res.children.length) {
      body += '\n--- nested stage (' + res.children.length + ' scripts) ---\n';
      for (const child of res.children) {
        body +=
          '\n### ' +
          child.rel +
          '\n# status: ' +
          child.status +
          ' exit=' +
          child.exitCode +
          ' duration=' +
          child.durationMs +
          'ms' +
          (child.reason ? '\n# reason: ' + child.reason : '') +
          '\n--- stdout ---\n' +
          child.stdout +
          '\n--- stderr ---\n' +
          child.stderr +
          '\n';
      }
    }
    try {
      fs.writeFileSync(file, body, 'utf8');
      res.logFile = file;
    } catch (e) {
      /* ignore */
    }
  }

  const reportFile = path.join(runDir, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  const mdFile = path.join(runDir, 'summary.md');
  fs.writeFileSync(mdFile, formatReportMarkdown(report), 'utf8');

  const stateDir = path.join(root, '.codemanager');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'state.json'),
    JSON.stringify(
      {
        lastReport: reportFile,
        lastRunDir: runDir,
        lastStatus: report.status,
        lastFinishedAt: report.finishedAt,
        failed: report.results.filter((r) => r.status !== 'ok').map((r) => r.abs),
      },
      null,
      2
    ),
    'utf8'
  );

  return { runDir: runDir, reportFile: reportFile, mdFile: mdFile, logsDir: logsDir };
}

function loadState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.codemanager', 'state.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function loadLastReport(root) {
  const st = loadState(root);
  if (!st || !st.lastReport) return null;
  try {
    return JSON.parse(fs.readFileSync(st.lastReport, 'utf8'));
  } catch (e) {
    return null;
  }
}

/** Build a plan that re-runs only the failures of the previous run. */
function planFromReport(report) {
  const failed = (report.results || []).filter((r) => r.status !== 'ok');
  const steps = failed.map(function (r, i) {
    return {
      index: i + 1,
      abs: r.abs,
      rel: r.rel,
      name: path.basename(r.abs),
      dir: path.dirname(r.abs),
      ext: path.extname(r.abs).toLowerCase(),
      kind: 'file',
      tags: [],
      order: null,
      parallel: false,
      cwd: path.dirname(r.abs),
      exec: resolveExec(r.abs, {}),
    };
  });
  return {
    root: report.root,
    createdAt: new Date().toISOString(),
    steps: steps.filter((s) => s.exec),
    unsupported: [],
    stats: { scanned: steps.length, candidates: steps.length },
    warnings: [],
  };
}

/* ------------------------------------------------------------------ *
 * Formatting                                                         *
 * ------------------------------------------------------------------ */

function pad(n, w) {
  const s = String(n);
  return s.length >= w ? s : new Array(w - s.length + 1).join(' ') + s;
}

function formatPlanText(plan) {
  const lines = [];
  const scripts = countLeaves(plan.steps);
  const stages = countStages(plan.steps);
  lines.push('Run plan: ' + plan.root);
  lines.push(
    'steps: ' +
      plan.steps.length +
      '   scripts: ' +
      scripts +
      (stages ? '   stages: ' + stages : '') +
      '   unsupported: ' +
      plan.unsupported.length
  );
  lines.push('');
  const render = (list, depth) => {
    const ind = '   '.repeat(depth);
    for (const s of list) {
      if (s.type === 'stage') {
        const n = countLeaves(s.children || []);
        lines.push(
          ind +
            pad(s.index, 3) +
            '. [stage] ' +
            s.rel +
            '   (' +
            n +
            ' script' +
            (n === 1 ? '' : 's') +
            ')'
        );
        render(s.children || [], depth + 1);
      } else {
        lines.push(
          ind +
            pad(s.index, 3) +
            '. ' +
            (s.parallel ? '[par] ' : '') +
            s.rel +
            (s.exec ? '' : '   <unsupported>')
        );
      }
    }
  };
  render(plan.steps, 0);
  if (!plan.steps.length) lines.push('(nothing to run)');
  if (plan.unsupported.length) {
    lines.push('');
    lines.push('unsupported: ' + plan.unsupported.join(', '));
  }
  return lines.join('\n');
}

function formatReportMarkdown(report) {
  const lines = [];
  lines.push('# Code Manager run report');
  lines.push('');
  lines.push('| field | value |');
  lines.push('| --- | --- |');
  lines.push('| id | `' + report.id + '` |');
  lines.push('| root | `' + report.root + '` |');
  lines.push('| status | **' + report.status + '** |');
  lines.push('| duration | ' + report.durationMs + ' ms |');
  lines.push(
    '| ok / failed / timeout | ' +
      report.totals.ok +
      ' / ' +
      report.totals.failed +
      ' / ' +
      report.totals.timeout +
      ' |'
  );
  lines.push('| stopOnError | ' + report.options.stopOnError + ' |');
  lines.push('| timeout | ' + report.options.timeoutMs + ' ms |');
  lines.push('| retries | ' + report.options.retries + ' |');
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  lines.push('| # | script | status | exit | ms | attempts |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of report.results) {
    lines.push(
      '| ' +
        r.index +
        ' | `' +
        r.rel +
        '` | ' +
        r.status +
        ' | ' +
        (r.exitCode === null ? '-' : r.exitCode) +
        ' | ' +
        r.durationMs +
        ' | ' +
        r.attempts +
        ' |'
    );
  }
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Search                                                             *
 * ------------------------------------------------------------------ */

function searchIndex(index, query, options) {
  const opt = options || {};
  let q = String(query === undefined || query === null ? '' : query);
  let content = !!opt.content;
  // `!` prefix = full-text search (the command layer may also pass opt.content)
  if (q.charAt(0) === '!') {
    content = true;
    q = q.slice(1);
  }
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const maxBytes = opt.maxContentBytes || 262144;
  const out = [];
  for (const it of index.items) {
    if (it.isDir) continue;
    const hay = (it.rel + ' ' + it.tags.join(' ') + ' ' + it.kind).toLowerCase();
    let text = null; // lazy: read the file only when the name does not match
    let all = true;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      if (t.indexOf('tag=') === 0 || t.indexOf('t=') === 0) {
        if (it.tags.indexOf(t.slice(4)) === -1 && it.tags.indexOf(t.slice(2)) === -1) {
          all = false;
          break;
        }
        continue;
      }
      if (hay.indexOf(t) !== -1) continue;
      if (content) {
        if (text === null) {
          try {
            text = it.size <= maxBytes ? fs.readFileSync(it.abs, 'utf8').toLowerCase() : '';
          } catch (e) {
            text = '';
          }
        }
        if (text.indexOf(t) !== -1) continue;
      }
      all = false;
      break;
    }
    if (!all) continue;
    out.push(it);
    if (opt.limit && out.length >= opt.limit) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * vscode integration                                                 *
 * ------------------------------------------------------------------ */

const STATE_KEY = 'runner.state';

function readConfig(vscode) {
  const cfg = vscode.workspace.getConfiguration('wf-code-manager');
  const get = (k, d) => {
    try {
      const v = cfg.get(k);
      return v === undefined || v === null ? d : v;
    } catch (e) {
      return d;
    }
  };
  return {
    root: get('runner.root', '') || cfg.get('rootPath') || '',
    stopOnError: get('runner.stopOnError', true),
    timeoutSeconds: Number(get('runner.timeoutSeconds', 0)) || 0,
    retries: Number(get('runner.retries', 0)) || 0,
    maxParallel: Number(get('runner.maxParallel', 4)) || 4,
    numberedOnly: !!get('runner.numberedOnly', false),
    recursive: get('runner.recursive', true) !== false,
    confirmBeforeRun: get('runner.confirmBeforeRun', true) !== false,
    ignoreFolders: get('runner.ignoreFolders', null),
    includeExtensions: get('runner.includeExtensions', null),
    pwshPath: get('runner.pwshPath', '') || '',
    pythonPath: get('runner.pythonPath', '') || '',
    reportsDir: get('runner.reportsDir', '') || '',
  };
}

function resolveTargetFolder(vscode, context, item) {
  if (item && item.filePath) {
    if (item.isDirectory) return item.filePath;
    return path.dirname(item.filePath);
  }
  if (item && item.resourceUri && item.resourceUri.fsPath) {
    return item.resourceUri.fsPath;
  }
  const cfgRoot = resolveRoot(vscode, context);
  return cfgRoot;
}

function resolveRoot(vscode, context) {
  try {
    const cfg = vscode.workspace.getConfiguration('wf-code-manager');
    const r = cfg.get('runner.root') || cfg.get('rootPath');
    if (r) return r;
  } catch (e) {
    /* ignore */
  }
  try {
    const g = context && context.globalState && context.globalState.get('rootPath');
    if (g) return g;
  } catch (e) {
    /* ignore */
  }
  const folders = (vscode.workspace.workspaceFolders || [])[0];
  return folders ? folders.uri.fsPath : '';
}

/* ------------------------------------------------------------------ *
 * Shared output channel + command hub                                 *
 * ------------------------------------------------------------------ */

let sharedChannel = null;

/**
 * The single output channel of the whole extension. The runner and the tree
 * "info" hook both write here, so the user has exactly ONE place to look
 * instead of hunting through several channels in the Output dropdown.
 */
function getChannel() {
  if (sharedChannel) return sharedChannel;
  try {
    sharedChannel = require('vscode').window.createOutputChannel('Code Manager');
  } catch (e) {
    sharedChannel = null;
  }
  return (
    sharedChannel || {
      append: function () {},
      appendLine: function () {},
      show: function () {},
      dispose: function () {},
    }
  );
}

/**
 * Single source of truth for the "More…" hub. Every command is listed here
 * (including the ones hidden from the menus), so nothing becomes unreachable
 * and the hub can never drift away from the manifest — a test enforces that
 * this list equals `contributes.commands` minus the hub itself.
 */
const HUB = [
  {
    id: 'wf-code-manager.runFolder',
    icon: '$(play)',
    title: 'Run Folder (recursive sequence)',
    detail: 'Run every numbered script in the folder, in order',
  },
  {
    id: 'wf-code-manager.dryRun',
    icon: '$(preview)',
    title: 'Preview Plan (dry run)',
    detail: 'Show what would run — executes nothing',
  },
  {
    id: 'wf-code-manager.resumeRun',
    icon: '$(debug-continue)',
    title: 'Resume Interrupted Run',
    detail: 'Continue from the last checkpoint',
  },
  {
    id: 'wf-code-manager.watchFolder',
    icon: '$(eye)',
    title: 'Watch Folder (auto re-run)',
    detail: 'Re-run on file changes (toggle)',
  },
  {
    id: 'wf-code-manager.stopRun',
    icon: '$(debug-stop)',
    title: 'Stop Current Run',
    detail: 'Kill the running script',
  },
  {
    id: 'wf-code-manager.rerunFailed',
    icon: '$(debug-rerun)',
    title: 'Rerun Failed Scripts',
    detail: 'Re-run only the failures of the last run',
  },
  {
    id: 'wf-code-manager.openFile',
    icon: '$(go-to-file)',
    title: 'Open File',
    detail: 'Open the selected item in the editor',
  },
  {
    id: 'wf-code-manager.runInTerminal',
    icon: '$(terminal)',
    title: 'Run in Terminal (single script)',
    detail: 'Send this one script to the active terminal',
  },
  {
    id: 'wf-code-manager.runCode',
    icon: '$(play)',
    title: 'Run with Code Runner',
    detail: 'Delegate to the Code Runner extension',
  },
  {
    id: 'wf-code-manager.cli',
    icon: '$(list-selection)',
    title: 'Run CLI Menu (--cli)',
    detail: 'Pick a line from a --cli file and run it',
  },
  {
    id: 'wf-code-manager.infoFile',
    icon: '$(info)',
    title: 'Mark as Info (--info)',
    detail: 'Rename to <name>--info: text shown when the folder opens',
  },
  {
    id: 'wf-code-manager.textImport',
    icon: '$(note)',
    title: 'Insert Text Content (--text)',
    detail: 'Insert the file content at the cursor',
  },
  {
    id: 'wf-code-manager.renameFile',
    icon: '$(edit)',
    title: 'Rename…',
    detail: 'Rename the item (keeps type markers)',
  },
  {
    id: 'wf-code-manager.duplicateFile',
    icon: '$(copy)',
    title: 'Duplicate',
    detail: 'Create a “(copy)” next to the file',
  },
  {
    id: 'wf-code-manager.copyContent',
    icon: '$(clippy)',
    title: 'Copy Content',
    detail: 'Copy the whole file to the clipboard',
  },
  {
    id: 'wf-code-manager.copyPath',
    icon: '$(files)',
    title: 'Copy Path',
    detail: 'Copy the full path',
  },
  {
    id: 'wf-code-manager.deleteFiles',
    icon: '$(trash)',
    title: 'Delete',
    detail: 'Delete item (asks for confirmation)',
  },
  {
    id: 'wf-code-manager.newFile',
    icon: '$(new-file)',
    title: 'New File…',
    detail: 'Create a file with an optional type marker',
  },
  {
    id: 'wf-code-manager.newFolder',
    icon: '$(new-folder)',
    title: 'New Folder…',
    detail: 'Normal or recursive (--rec) folder',
  },
  {
    id: 'wf-code-manager.revealInExplorer',
    icon: '$(folder-opened)',
    title: 'Reveal in File Explorer',
    detail: 'Show the item in the OS file manager',
  },
  {
    id: 'wf-code-manager.openTerminalAtFile',
    icon: '$(terminal)',
    title: 'Open Terminal Here',
    detail: 'cd into this folder in the terminal',
  },
  {
    id: 'wf-code-manager.openInNewWindow',
    icon: '$(empty-window)',
    title: 'Open Folder in New Window',
  },
  {
    id: 'wf-code-manager.openStructure',
    icon: '$(root-folder)',
    title: 'Open as Structure Root',
    detail: 'Make this folder the tree root',
  },
  {
    id: 'wf-code-manager.selectDirectory',
    icon: '$(gear)',
    title: 'Set Directory',
    detail: 'Pick the root folder of the tree',
  },
  {
    id: 'wf-code-manager.showCurrentFolder',
    icon: '$(folder-opened)',
    title: 'Show Current Workspace Folder',
    detail: 'Which folder is open in VS Code right now',
  },
  { id: 'wf-code-manager.refreshTreeView', icon: '$(refresh)', title: 'Refresh' },
  {
    id: 'wf-code-manager.buildIndex',
    icon: '$(list-tree)',
    title: 'Rebuild Script Index',
    detail: 'Scan the tree and report statistics',
  },
  {
    id: 'wf-code-manager.searchScripts',
    icon: '$(search)',
    title: 'Search Scripts…',
    detail: 'Search by name, tag, kind or content',
  },
  { id: 'wf-code-manager.showLastReport', icon: '$(report)', title: 'Show Last Run Report' },
  { id: 'wf-code-manager.showRunStatus', icon: '$(pulse)', title: 'Show Runner Status' },
  {
    id: 'wf-code-manager.openReportsFolder',
    icon: '$(folder-opened)',
    title: 'Open Reports Folder',
  },
  { id: 'wf-code-manager.runAll', icon: '$(history)', title: 'Run All (legacy — use Run Folder)' },
  {
    id: 'wf-code-manager.newCommand',
    icon: '$(history)',
    title: 'New Command (legacy — use New File…)',
  },
  {
    id: 'wf-code-manager.newRecursiveFolder',
    icon: '$(history)',
    title: 'New Recursive Folder (legacy — use New Folder…)',
  },
];

const ICONS = {
  ok: '$(check)',
  failed: '$(error)',
  timeout: '$(watch)',
  cancelled: '$(circle-slash)',
};

function activate(context) {
  const vscode = require('vscode');
  const out = getChannel();
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  // The status bar is the always-visible entry point to the command hub.
  statusItem.command = 'wf-code-manager.more';
  context.subscriptions.push(statusItem);

  let running = false;
  let watcher = null;

  const cfgOf = () => readConfig(vscode);
  const rootOf = () => cfgOf().root || resolveRoot(vscode, context);

  async function withIndex(root, cfg, useCache) {
    if (useCache && indexCache.root === root) return indexCache.index;
    const index = buildIndex(root, {
      ignore: cfg.ignoreFolders && cfg.ignoreFolders.length ? cfg.ignoreFolders : DEFAULT_IGNORE,
      recursive: cfg.recursive,
    });
    indexCache = { root: root, index: index, builtAt: Date.now() };
    return index;
  }

  let indexCache = { root: null, index: null, builtAt: 0 };

  function planOptions(cfg) {
    return {
      recursive: cfg.recursive,
      numberedOnly: cfg.numberedOnly,
      ignore: cfg.ignoreFolders && cfg.ignoreFolders.length ? cfg.ignoreFolders : DEFAULT_IGNORE,
      includeExtensions: cfg.includeExtensions,
      pwshPath: cfg.pwshPath,
      pythonPath: cfg.pythonPath,
    };
  }

  function runOptions(cfg) {
    return {
      stopOnError: cfg.stopOnError,
      timeoutMs: cfg.timeoutSeconds > 0 ? cfg.timeoutSeconds * 1000 : 0,
      retries: cfg.retries,
      maxParallel: cfg.maxParallel,
      reportsDir: cfg.reportsDir,
    };
  }

  function setStatus(text, tooltip) {
    try {
      statusItem.text = text;
      statusItem.tooltip = tooltip || '';
      statusItem.show();
    } catch (e) {
      /* ignore */
    }
  }

  async function executePlan(plan, root, cfg, extra) {
    if (running) {
      vscode.window.showWarningMessage('Code Manager: a run is already in progress.');
      return null;
    }
    if (!plan.steps.length) {
      vscode.window.showWarningMessage(
        'Code Manager: nothing to run in ' +
          root +
          (plan.unsupported.length ? ' (unsupported only)' : '')
      );
      return null;
    }
    if (cfg.confirmBeforeRun) {
      const preview = plan.steps
        .slice(0, 8)
        .map((s) => '  ' + s.rel)
        .join('\n');
      const more = plan.steps.length > 8 ? '\n  ... +' + (plan.steps.length - 8) + ' more' : '';
      const answer = await vscode.window.showWarningMessage(
        'Run ' + plan.steps.length + ' script(s) in ' + root + '?\n' + preview + more,
        { modal: true },
        'Run'
      );
      if (answer !== 'Run') return null;
    }

    running = true;
    out.show(true);
    out.appendLine('='.repeat(78));
    out.appendLine('Code Manager runner — ' + new Date().toISOString());
    out.appendLine('root   : ' + root);
    out.appendLine('steps  : ' + plan.steps.length);
    out.appendLine(
      'scripts: ' +
        countLeaves(plan.steps) +
        (plan.stats && plan.stats.stages ? '   stages: ' + plan.stats.stages : '')
    );
    out.appendLine(
      'options: stopOnError=' +
        cfg.stopOnError +
        ' timeout=' +
        cfg.timeoutSeconds +
        's retries=' +
        cfg.retries +
        ' maxParallel=' +
        cfg.maxParallel
    );
    out.appendLine('='.repeat(78));

    const t0 = Date.now();
    let done = 0;
    const report = await runPlan(
      plan,
      Object.assign(runOptions(cfg), extra || {}, {
        checkpointFile: checkpointFile(root, { reportsDir: cfg.reportsDir }),
      }),
      {
        onEvent(ev) {
          if (ev.type === 'stepStart') {
            out.appendLine('');
            if (ev.stage) {
              out.appendLine(
                '  > ' +
                  ev.stage.rel +
                  '  [' +
                  ev.step.index +
                  '/' +
                  (ev.stage.children || []).length +
                  '] ' +
                  ev.step.rel
              );
            } else {
              out.appendLine(
                '--- [' + ev.step.index + '/' + plan.steps.length + '] ' + ev.step.rel + ' ---'
              );
            }
            out.appendLine('$ ' + (ev.step.exec ? ev.step.exec.display : ''));
            if (!ev.stage)
              setStatus(
                '$(sync~spin) ' + ev.step.index + '/' + plan.steps.length + ' ' + ev.step.rel
              );
          } else if (ev.type === 'output') {
            out.append(ev.chunk);
          } else if (ev.type === 'retry') {
            out.appendLine('>> retry #' + (ev.attempt + 1));
          } else if (ev.type === 'stepEnd') {
            const r = ev.result;
            if (ev.stage) {
              out.appendLine('  << ' + r.rel + ' -> ' + r.status);
            } else {
              done++;
              out.appendLine('');
              out.appendLine(
                '<< ' +
                  r.status +
                  ' exit=' +
                  (r.exitCode === null ? '-' : r.exitCode) +
                  ' in ' +
                  r.durationMs +
                  'ms (attempts ' +
                  r.attempts +
                  ')'
              );
              setStatus('$(sync~spin) ' + done + '/' + plan.steps.length);
            }
          }
        },
      }
    );

    running = false;
    let written = null;
    try {
      written = writeArtifacts(report, plan.root || root, runOptions(cfg));
    } catch (err) {
      out.appendLine('!! failed to write report: ' + err.message);
    }

    const icon = report.status === 'success' ? '$(check)' : '$(error)';
    setStatus(
      icon +
        ' last run: ' +
        report.totals.ok +
        ' ok / ' +
        report.totals.failed +
        ' failed (' +
        Math.round(report.durationMs / 1000) +
        's)',
      written ? written.reportFile : ''
    );
    out.appendLine('');
    out.appendLine(
      'DONE ' +
        report.status +
        ' | ok=' +
        report.totals.ok +
        ' failed=' +
        report.totals.failed +
        ' timeout=' +
        report.totals.timeout +
        ' | ' +
        report.durationMs +
        'ms'
    );
    if (written) out.appendLine('report: ' + written.reportFile);

    const buttons = ['Show Report'];
    if (report.totals.failed > 0 || report.totals.timeout > 0) buttons.push('Rerun Failed');
    buttons.push('Open Reports Folder');
    const choice = await vscode.window.showInformationMessage(
      'Code Manager: ' +
        report.totals.ok +
        '/' +
        report.plan.total +
        ' ok, ' +
        report.totals.failed +
        ' failed (' +
        (report.durationMs / 1000).toFixed(1) +
        's)',
      ...buttons
    );
    if (choice === 'Show Report' && written) {
      await vscode.window.showTextDocument(vscode.Uri.file(written.mdFile));
    } else if (choice === 'Rerun Failed') {
      await vscode.commands.executeCommand('wf-code-manager.rerunFailed');
    } else if (choice === 'Open Reports Folder' && written) {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(written.runDir));
    }
    return report;
  }

  async function planForFolder(item) {
    const cfg = cfgOf();
    // A folder the user clicked ALWAYS wins over the configured root. Using
    // `cfg.root` first made every run scan the whole tree, even when a single
    // sub-folder was selected.
    const fromItem = item ? resolveTargetFolder(vscode, context, item) : '';
    const root = fromItem || cfg.root || resolveRoot(vscode, context);
    if (!root) {
      vscode.window.showErrorMessage('Code Manager: no root folder. Use "Set Directory" first.');
      return null;
    }
    const index = await withIndex(root, cfg, true);
    const plan = buildPlan(root, Object.assign(planOptions(cfg), { index: index }));
    return { plan: plan, root: root, cfg: cfg };
  }

  const disposables = [
    vscode.commands.registerCommand('wf-code-manager.runFolder', async (item) => {
      const ctx = await planForFolder(item);
      if (!ctx) return;
      await executePlan(ctx.plan, ctx.root, ctx.cfg);
    }),

    vscode.commands.registerCommand('wf-code-manager.dryRun', async (item) => {
      const ctx = await planForFolder(item);
      if (!ctx) return;
      out.show(true);
      out.appendLine('='.repeat(78));
      out.appendLine('DRY RUN (no script executed) — ' + new Date().toISOString());
      out.appendLine('='.repeat(78));
      out.appendLine(formatPlanText(ctx.plan));
      vscode.window.showInformationMessage(
        'Code Manager plan: ' +
          ctx.plan.steps.length +
          ' script(s) would run. See "Code Manager Runner".'
      );
    }),

    vscode.commands.registerCommand('wf-code-manager.rerunFailed', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      if (!root) return void vscode.window.showErrorMessage('Code Manager: no root folder.');
      const last = loadLastReport(root);
      if (!last)
        return void vscode.window.showWarningMessage('Code Manager: no previous run found.');
      const plan = planFromReport(last);
      if (!plan.steps.length)
        return void vscode.window.showInformationMessage(
          'Code Manager: nothing failed in the last run.'
        );
      await executePlan(plan, root, Object.assign({}, cfg, { confirmBeforeRun: false }));
    }),

    vscode.commands.registerCommand('wf-code-manager.stopRun', () => {
      const ok = cancelCurrent();
      vscode.window.showInformationMessage(
        ok ? 'Code Manager: stopping the current run...' : 'Code Manager: no run in progress.'
      );
    }),

    vscode.commands.registerCommand('wf-code-manager.showRunStatus', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      const last = root ? loadLastReport(root) : null;
      if (!last) return void vscode.window.showInformationMessage('Code Manager: no runs yet.');
      vscode.window.showInformationMessage(
        'Last run: ' +
          last.status +
          ' | ok=' +
          last.totals.ok +
          ' failed=' +
          last.totals.failed +
          ' in ' +
          last.durationMs +
          'ms'
      );
    }),

    vscode.commands.registerCommand('wf-code-manager.showLastReport', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      if (!root) return;
      const st = loadState(root);
      if (!st || !st.lastReport)
        return void vscode.window.showWarningMessage('Code Manager: no report found.');
      await vscode.window.showTextDocument(
        vscode.Uri.file(st.lastReport.replace(/report\.json$/, 'summary.md'))
      );
    }),

    vscode.commands.registerCommand('wf-code-manager.buildIndex', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      if (!root) return void vscode.window.showErrorMessage('Code Manager: no root folder.');
      const t0 = Date.now();
      const index = await withIndex(root, cfg, false);
      vscode.window.showInformationMessage(
        'Code Manager index: ' +
          index.stats.files +
          ' files, ' +
          index.stats.runnable +
          ' runnable, ' +
          index.stats.skippedDirs +
          ' dirs skipped in ' +
          (Date.now() - t0) +
          'ms'
      );
    }),

    vscode.commands.registerCommand('wf-code-manager.searchScripts', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      if (!root) return void vscode.window.showErrorMessage('Code Manager: no root folder.');
      const index = await withIndex(root, cfg, true);
      const q = await vscode.window.showInputBox({
        prompt: 'Search scripts (name, tags, kind). Prefix with "!" for full-text search.',
        placeHolder: 'e.g. deploy, tag=db, !password',
      });
      if (!q) return;
      const hits = searchIndex(index, q, { limit: 500 });
      if (!hits.length)
        return void vscode.window.showInformationMessage('Code Manager: no matches.');
      const picks = hits.map((h) => ({
        label: h.name,
        description: h.rel,
        detail:
          'tags: ' + (h.tags.join(', ') || '-') + '   kind: ' + h.kind + '   ' + h.size + ' B',
        item: h,
      }));
      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: hits.length + ' match(es)',
      });
      if (!pick) return;
      await vscode.window.showTextDocument(vscode.Uri.file(pick.item.abs), { preview: true });
    }),

    vscode.commands.registerCommand('wf-code-manager.resumeRun', async (item) => {
      const cfg = cfgOf();
      const root = (item && resolveTargetFolder(vscode, context, item)) || rootOf();
      if (!root) return void vscode.window.showErrorMessage('Code Manager: no root folder.');
      const index = await withIndex(root, cfg, true);
      const plan = buildPlan(root, Object.assign({ index: index }, planOptions(cfg)));
      const probe = hasResumePoint(root, plan, { reportsDir: cfg.reportsDir });
      if (!probe.resumable)
        return void vscode.window.showInformationMessage(
          'Code Manager: nothing to resume (no matching checkpoint).'
        );
      const answer = await vscode.window.showWarningMessage(
        'Resume from step ' + probe.fromIndex + ' of ' + plan.steps.length + ' in ' + root + '?',
        { modal: true },
        'Resume'
      );
      if (answer !== 'Resume') return;
      return executePlan(plan, root, cfg, { fromIndex: probe.fromIndex });
    }),

    vscode.commands.registerCommand('wf-code-manager.watchFolder', async (item) => {
      const cfg = cfgOf();
      const root = (item && resolveTargetFolder(vscode, context, item)) || rootOf();
      if (!root) return void vscode.window.showErrorMessage('Code Manager: no root folder.');
      if (watcher) {
        watcher.close();
        watcher = null;
        return void vscode.window.showInformationMessage('Code Manager: watch stopped.');
      }
      watcher = watchRoot(root, { ignore: cfg.ignoreFolders }, async (info) => {
        if (running) return;
        out.appendLine('');
        out.appendLine('[watch] ' + info.file + ' changed -> re-planning');
        const index = await withIndex(root, cfg, false);
        const plan = buildPlan(root, Object.assign({ index: index }, planOptions(cfg)));
        if (!plan.steps.length) return;
        await executePlan(plan, root, cfg);
      });
      vscode.window.showInformationMessage('Code Manager: watching ' + root);
    }),

    vscode.commands.registerCommand('wf-code-manager.more', async () => {
      const picks = HUB.map(function (h) {
        return {
          label: (h.icon ? h.icon + ' ' : '') + h.title,
          detail: h.detail || '',
          cmd: h.id,
        };
      });
      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Code Manager — all commands',
        matchOnDetail: true,
      });
      if (!pick) return;
      await vscode.commands.executeCommand(pick.cmd);
    }),

    vscode.commands.registerCommand('wf-code-manager.openReportsFolder', async () => {
      const cfg = cfgOf();
      const root = cfg.root || resolveRoot(vscode, context);
      if (!root) return;
      const dir = reportsRoot(root, { reportsDir: cfg.reportsDir });
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        /* ignore */
      }
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
    }),
  ];

  for (const d of disposables) context.subscriptions.push(d);
  return disposables;
}

/* ------------------------------------------------------------------ */

module.exports = {
  VERSION: VERSION,
  RUNNABLE_EXTS: RUNNABLE_EXTS,
  DEFAULT_IGNORE: DEFAULT_IGNORE,
  parseMeta: parseMeta,
  compareItems: compareItems,
  buildIndex: buildIndex,
  buildPlan: buildPlan,
  resolveExec: resolveExec,
  whichBin: whichBin,
  runPlan: runPlan,
  cancelCurrent: cancelCurrent,
  groupBatches: groupBatches,
  writeArtifacts: writeArtifacts,
  loadState: loadState,
  loadLastReport: loadLastReport,
  planFromReport: planFromReport,
  formatPlanText: formatPlanText,
  formatReportMarkdown: formatReportMarkdown,
  searchIndex: searchIndex,
  reportsRoot: reportsRoot,
  resolveDependencies: resolveDependencies,
  planFingerprint: planFingerprint,
  checkpointFile: checkpointFile,
  saveCheckpoint: saveCheckpoint,
  loadCheckpoint: loadCheckpoint,
  resumeIndex: resumeIndex,
  hasResumePoint: hasResumePoint,
  clearCheckpoint: clearCheckpoint,
  watchRoot: watchRoot,
  getChannel: getChannel,
  HUB: HUB,
  activate: activate,
  _currentRun: () => currentRun,
};
