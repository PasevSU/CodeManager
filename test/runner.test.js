'use strict';
/**
 * Code Manager — Enterprise Runner test suite.
 * Pure Node. Runs real child processes. Use: node test/runner.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const R = require('../dist/runner.js');

/* ---------------------------------------------------------------- */
/* tiny test runner                                                  */
/* ---------------------------------------------------------------- */
let pass = 0;
let fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    pass++;
    process.stdout.write('  \u2713 ' + name + '\n');
  } catch (e) {
    fail++;
    failures.push({ name: name, message: (e && e.stack) || String(e) });
    process.stdout.write('  \u2717 ' + name + '\n        ' + (e && e.message) + '\n');
  }
}

function section(title) {
  process.stdout.write('\n' + title + '\n' + '-'.repeat(Math.max(10, title.length)) + '\n');
}

/* ---------------------------------------------------------------- */
/* fixtures                                                          */
/* ---------------------------------------------------------------- */
const tmps = [];

function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  tmps.push(d);
  return d;
}

function cleanup() {
  for (const d of tmps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
  }
}

function writeScript(root, rel, tag, opts) {
  const o = opts || {};
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  let body = 'const fs = require("fs");\n';
  body += 'const t = process.env.CM_TRACE;\n';
  if (o.fail)
    body +=
      'if (t) fs.appendFileSync(t, ' +
      JSON.stringify(tag) +
      ' + "\\n");\nprocess.exit(' +
      o.fail +
      ');\n';
  else if (o.flaky) {
    body += 'const f = process.env.CM_TRACE + ".flaky";\n';
    body +=
      'if (fs.existsSync(f)) { if (t) fs.appendFileSync(t, ' +
      JSON.stringify(tag) +
      ' + "\\n"); process.exit(0); }\n';
    body += 'fs.writeFileSync(f, "1");\n';
    body += 'if (t) fs.appendFileSync(t, ' + JSON.stringify(tag) + ' + ":attempt1\\n");\n';
    body += 'process.exit(' + o.flaky + ');\n';
  } else if (o.sleepMs) {
    body +=
      'setTimeout(function(){ if (t) fs.appendFileSync(t, ' +
      JSON.stringify(tag) +
      ' + "\\n"); }, ' +
      o.sleepMs +
      ');\n';
  } else {
    body += 'if (t) fs.appendFileSync(t, ' + JSON.stringify(tag) + ' + "\\n");\n';
    body += 'if (process.env.CM_ECHO) console.log(' + JSON.stringify('hello-from-' + tag) + ');\n';
  }
  fs.writeFileSync(abs, body, 'utf8');
  return abs;
}

function mkTree(prefix) {
  const root = mkTmp(prefix);
  writeScript(root, '01_init.js', '01', { echo: true });
  writeScript(root, '02_mid.js', '02');
  writeScript(root, '03_skip--skip.js', '03-skip');
  writeScript(root, '10_last.js', '10');
  writeScript(root, '20_tag--tag=db.js', '20');
  writeScript(root, '90_kode--kode.js', '90');
  writeScript(root, 'zz_plain.js', 'zz');
  writeScript(root, '30_info--info.js', '30-info');
  writeScript(root, '31_text--text.js', '31-text');
  writeScript(root, '32_cli--cli.js', '32-cli');
  writeScript(root, 'sub/40_sub.js', '40');
  writeScript(root, '.git/99_ignored.js', 'git-ignored');
  writeScript(root, 'node_modules/88_ignored.js', 'nm-ignored');
  fs.writeFileSync(path.join(root, 'readme.md'), '# readme\n', 'utf8');
  fs.writeFileSync(path.join(root, 'info'), 'folder info\n', 'utf8');
  return root;
}

const EXPECTED_ORDER = [
  '01_init.js',
  '02_mid.js',
  '10_last.js',
  '20_tag--tag=db.js',
  'sub/40_sub.js',
  '90_kode--kode.js',
  'zz_plain.js',
];

/* ---------------------------------------------------------------- */
/* 1. metadata                                                       */
/* ---------------------------------------------------------------- */
async function testMeta() {
  section('1. Metadata parsing');

  await test('order from leading digits', () => {
    assert.strictEqual(R.parseMeta('01_init.js').order, 1);
    assert.strictEqual(R.parseMeta('010_x.ps1').order, 10);
    assert.strictEqual(R.parseMeta('3-run.cmd').order, 3);
    assert.strictEqual(R.parseMeta('abc.js').order, null);
  });

  await test('kind markers (last wins)', () => {
    assert.strictEqual(R.parseMeta('01_init.js').kind, 'file');
    assert.strictEqual(R.parseMeta('x--info.js').kind, 'info');
    assert.strictEqual(R.parseMeta('x--text.js').kind, 'text');
    assert.strictEqual(R.parseMeta('x--kode.ps1').kind, 'kode');
    assert.strictEqual(R.parseMeta('x--cli.txt').kind, 'cli');
    assert.strictEqual(R.parseMeta('x--kode--cli.js').kind, 'cli');
    assert.strictEqual(R.parseMeta('info').kind, 'info');
  });

  await test('tags / par / rec / skip flags', () => {
    const m = R.parseMeta('20_db--tag=db--tag=deploy--par--rec.js');
    assert.deepStrictEqual(m.tags, ['db', 'deploy']);
    assert.strictEqual(m.parallel, true);
    assert.strictEqual(m.rec, true);
    assert.strictEqual(R.parseMeta('03_x--skip.js').skip, true);
  });

  await test('filters empty markers (name--.js)', () => {
    const m = R.parseMeta('name--.js');
    assert.strictEqual(m.kind, 'file');
    assert.strictEqual(m.base, 'name');
  });

  await test('numeric ordering is numeric, not lexicographic', () => {
    const items = ['10_c.js', '2_b.js', '1_a.js', '010_d.js'].map((f) => ({
      rel: f,
      order: R.parseMeta(f).order,
      kind: 'file',
      isDir: false,
    }));
    items.sort(R.compareItems);
    // 1, 2, then the 10-tie (010_d vs 10_c) broken deterministically by path
    assert.deepStrictEqual(
      items.map((i) => i.rel),
      ['1_a.js', '2_b.js', '010_d.js', '10_c.js']
    );
  });

  await test('unnumbered sorts after numbered', () => {
    const items = ['zz.js', '01_a.js', 'aa.js'].map((f) => ({
      rel: f,
      order: R.parseMeta(f).order,
      kind: 'file',
      isDir: false,
    }));
    items.sort(R.compareItems);
    assert.deepStrictEqual(
      items.map((i) => i.rel),
      ['01_a.js', 'aa.js', 'zz.js']
    );
  });
}

/* ---------------------------------------------------------------- */
/* 2. index                                                          */
/* ---------------------------------------------------------------- */
async function testIndex(root) {
  section('2. Index');

  await test('discovers scripts, ignores .git / node_modules', () => {
    const idx = R.buildIndex(root, {});
    const rels = idx.items.map((i) => i.rel);
    assert.ok(rels.indexOf('01_init.js') !== -1, 'missing 01_init.js');
    assert.ok(rels.indexOf('sub/40_sub.js') !== -1, 'missing nested script');
    assert.ok(!rels.some((r) => r.indexOf('.git') === 0), '.git not ignored');
    assert.ok(!rels.some((r) => r.indexOf('node_modules') === 0), 'node_modules not ignored');
  });

  await test('runnable classification', () => {
    const idx = R.buildIndex(root, {});
    const byRel = {};
    idx.items.forEach((i) => (byRel[i.rel] = i));
    assert.strictEqual(byRel['01_init.js'].runnable, true);
    assert.strictEqual(byRel['90_kode--kode.js'].runnable, true);
    assert.strictEqual(byRel['03_skip--skip.js'].runnable, false, '--skip must not be runnable');
    assert.strictEqual(byRel['30_info--info.js'].runnable, false, '--info must not be runnable');
    assert.strictEqual(byRel['31_text--text.js'].runnable, false, '--text must not be runnable');
    assert.strictEqual(byRel['32_cli--cli.js'].runnable, false, '--cli must not be runnable');
    assert.strictEqual(byRel['readme.md'].runnable, false, '.md must not be runnable');
    assert.strictEqual(byRel['info'].runnable, false, 'bare info must not be runnable');
  });

  await test('index of a missing root degrades gracefully', () => {
    const idx = R.buildIndex(path.join(root, 'nope-nope'), {});
    assert.deepStrictEqual(idx.items, []);
    assert.ok(idx.warnings.length >= 1);
  });

  await test('custom ignore list is MERGED with the safe defaults', () => {
    const idx = R.buildIndex(root, { ignore: ['my-custom-folder'] });
    const rels = idx.items.map((i) => i.rel);
    assert.ok(!rels.some((r) => r.indexOf('node_modules') === 0), 'node_modules must stay ignored');
    assert.ok(!rels.some((r) => r.indexOf('.git') === 0), '.git must stay ignored');
    assert.ok(rels.indexOf('01_init.js') !== -1);
  });
}

/* ---------------------------------------------------------------- */
/* 3. plan                                                           */
/* ---------------------------------------------------------------- */
async function testPlan(root) {
  section('3. Plan');

  await test('deterministic enterprise order', () => {
    const plan = R.buildPlan(root, {});
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      EXPECTED_ORDER
    );
  });

  await test('plan is stable across repeated builds', () => {
    const a = R.buildPlan(root, {}).steps.map((s) => s.rel);
    const b = R.buildPlan(root, {}).steps.map((s) => s.rel);
    assert.deepStrictEqual(a, b);
  });

  await test('numberedOnly filter', () => {
    const plan = R.buildPlan(root, { numberedOnly: true });
    assert.ok(plan.steps.every((s) => s.order !== null && s.order !== undefined));
    assert.ok(plan.steps.every((s) => s.rel !== 'zz_plain.js'));
  });

  await test('tag filter', () => {
    const plan = R.buildPlan(root, { tag: 'db' });
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['20_tag--tag=db.js']
    );
  });

  await test('name regex + limit', () => {
    const plan = R.buildPlan(root, { nameRe: '_(init|mid|last)', limit: 2 });
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['01_init.js', '02_mid.js']
    );
  });

  await test('non-recursive plan', () => {
    const plan = R.buildPlan(root, { recursive: false });
    assert.ok(!plan.steps.some((s) => s.rel === 'sub/40_sub.js'));
  });

  await test('every step has a resolved interpreter', () => {
    const plan = R.buildPlan(root, {});
    assert.ok(plan.steps.every((s) => s.exec && s.exec.cmd && s.exec.display));
  });

  await test('formatPlanText renders', () => {
    const txt = R.formatPlanText(R.buildPlan(root, {}));
    assert.ok(txt.indexOf('Run plan:') === 0);
    assert.ok(txt.indexOf('01_init.js') !== -1);
  });

  await test('formatPlanText keeps the path column tight', () => {
    const plan = {
      root: 'R',
      unsupported: [],
      steps: [{ index: 1, rel: 'a/b.js', parallel: false, exec: { bin: 'node' } }],
    };
    const line = R.formatPlanText(plan)
      .split('\n')
      .find((l) => l.indexOf('a/b.js') !== -1);
    assert.strictEqual(line, '  1. a/b.js', 'unexpected line: [' + line + ']');
  });
}

/* ---------------------------------------------------------------- */
/* 4. runner                                                         */
/* ---------------------------------------------------------------- */
async function testRunner(root) {
  section('4. Runner');

  const runOpts = (trace, extra) =>
    Object.assign({ stopOnError: true, env: { CM_TRACE: trace, CM_ECHO: '1' } }, extra || {});

  await test('sequential success in order + exit codes + output capture', async () => {
    const trace = path.join(mkTmp('trace'), 't.log');
    fs.writeFileSync(trace, '');
    const plan = R.buildPlan(root, { nameRe: '^(01|02|10|zz)' });
    const report = await R.runPlan(plan, runOpts(trace));
    assert.strictEqual(report.status, 'success', 'status=' + report.status);
    assert.strictEqual(report.totals.ok, plan.steps.length);
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), [
      '01',
      '02',
      '10',
      'zz',
    ]);
    const first = report.results[0];
    assert.strictEqual(first.exitCode, 0);
    assert.ok(first.stdout.indexOf('hello-from-01') !== -1, 'stdout not captured: ' + first.stdout);
    assert.ok(first.durationMs >= 0);
    assert.strictEqual(first.attempts, 1);
  });

  await test('stopOnError stops at the first failure', async () => {
    const r2 = mkTmp('fail');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_ok.js', '01');
    writeScript(r2, '02_bad.js', '02', { fail: 3 });
    writeScript(r2, '03_never.js', '03');
    const plan = R.buildPlan(r2, {});
    const report = await R.runPlan(plan, runOpts(trace));
    assert.strictEqual(report.status, 'failed');
    assert.strictEqual(report.totals.failed, 1);
    assert.strictEqual(report.results.length, 2, 'must stop after the failing step');
    assert.strictEqual(report.results[1].exitCode, 3);
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['01', '02']);
  });

  await test('stopOnError=false continues and reports all failures', async () => {
    const r2 = mkTmp('cont');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_ok.js', '01');
    writeScript(r2, '02_bad.js', '02', { fail: 1 });
    writeScript(r2, '03_bad.js', '03', { fail: 2 });
    writeScript(r2, '04_ok.js', '04');
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { stopOnError: false }));
    assert.strictEqual(report.totals.failed, 2);
    assert.strictEqual(report.status, 'failed');
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), [
      '01',
      '02',
      '03',
      '04',
    ]);
  });

  await test('retries recover a flaky script', async () => {
    const r2 = mkTmp('retry');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_flaky.js', '01', { flaky: 7 });
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { retries: 2 }));
    assert.strictEqual(report.status, 'success', 'status=' + report.status);
    assert.strictEqual(report.results[0].attempts, 2, 'expected 2 attempts');
  });

  await test('retries are bounded and failure is reported', async () => {
    const r2 = mkTmp('retryfail');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_bad.js', '01', { fail: 9 });
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { retries: 2 }));
    assert.strictEqual(report.status, 'failed');
    assert.strictEqual(report.results[0].attempts, 3, '1 run + 2 retries');
  });

  await test('timeout kills a hung script', async () => {
    const r2 = mkTmp('timeout');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_hang.js', '01', { sleepMs: 10000 });
    const t0 = Date.now();
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { timeoutMs: 700 }));
    const elapsed = Date.now() - t0;
    assert.strictEqual(report.status, 'failed');
    assert.strictEqual(report.totals.timeout, 1, 'expected a timeout');
    assert.ok(elapsed < 6000, 'timeout did not kill the process (took ' + elapsed + 'ms)');
  });

  await test('--par batch runs concurrently', async () => {
    const r2 = mkTmp('par');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_pa--par.js', 'pa', { sleepMs: 900 });
    writeScript(r2, '02_pb--par.js', 'pb', { sleepMs: 900 });
    const plan = R.buildPlan(r2, {});
    assert.strictEqual(plan.steps.length, 2);
    assert.ok(
      plan.steps.every((s) => s.parallel),
      'steps should be flagged parallel'
    );
    assert.deepStrictEqual(
      R.groupBatches(plan.steps).map((b) => b.length),
      [2]
    );
    const t0 = Date.now();
    const report = await R.runPlan(plan, runOpts(trace, { maxParallel: 2 }));
    const elapsed = Date.now() - t0;
    assert.strictEqual(report.status, 'success');
    assert.ok(elapsed < 1700, 'not concurrent: ' + elapsed + 'ms (expected < 1700)');
    assert.strictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n').length, 2);
  });

  await test('maxParallel=1 serialises a --par batch', async () => {
    const r2 = mkTmp('par1');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_pa--par.js', 'pa', { sleepMs: 600 });
    writeScript(r2, '02_pb--par.js', 'pb', { sleepMs: 600 });
    const t0 = Date.now();
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { maxParallel: 1 }));
    assert.strictEqual(report.status, 'success');
    assert.ok(Date.now() - t0 >= 1100, 'should have been serialised');
  });

  await test('cancelCurrent() stops the run and kills the child', async () => {
    const r2 = mkTmp('cancel');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_long.js', '01', { sleepMs: 8000 });
    writeScript(r2, '02_after.js', '02');
    const plan = R.buildPlan(r2, {});
    const p = R.runPlan(plan, runOpts(trace));
    setTimeout(() => R.cancelCurrent(), 350);
    const report = await p;
    assert.strictEqual(report.status, 'stopped', 'status=' + report.status);
    assert.strictEqual(report.cancelled, true);
    assert.ok(
      report.results.length <= 1,
      'second script must not run, got ' + report.results.length
    );
    assert.ok(report.results[0].status === 'cancelled', 'first must be cancelled');
    assert.ok(!fs.readFileSync(trace, 'utf8').includes('02'), '02 must not have executed');
  });

  await test('dry run executes nothing', async () => {
    const r2 = mkTmp('dry');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_a.js', '01');
    writeScript(r2, '02_b.js', '02');
    const report = await R.runPlan(R.buildPlan(r2, {}), runOpts(trace, { dryRun: true }));
    assert.strictEqual(report.results.length, 0);
    assert.strictEqual(report.status, 'success');
    assert.strictEqual(fs.readFileSync(trace, 'utf8'), '');
  });

  await test('hooks receive stepStart/stepEnd/progress/done', async () => {
    const r2 = mkTmp('hooks');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_a.js', '01');
    const seen = {};
    await R.runPlan(R.buildPlan(r2, {}), runOpts(trace), {
      onEvent(ev) {
        seen[ev.type] = (seen[ev.type] || 0) + 1;
      },
    });
    assert.strictEqual(seen.stepStart, 1);
    assert.strictEqual(seen.stepEnd, 1);
    assert.strictEqual(seen.progress, 1);
    assert.strictEqual(seen.done, 1);
  });
}

/* ---------------------------------------------------------------- */
/* 5. reports / state / rerun                                        */
/* ---------------------------------------------------------------- */
async function testReports(root) {
  section('5. Reports, state and rerun');

  await test('artifacts written (report.json, summary.md, per-step logs, state.json)', async () => {
    const r2 = mkTmp('artifacts');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_ok.js', '01', { echo: true });
    writeScript(r2, '02_bad.js', '02', { fail: 4 });
    const plan = R.buildPlan(r2, {});
    const report = await R.runPlan(plan, {
      stopOnError: false,
      env: { CM_TRACE: trace, CM_ECHO: '1' },
    });
    const art = R.writeArtifacts(report, r2, {});
    assert.ok(fs.existsSync(art.reportFile), 'report.json missing');
    assert.ok(fs.existsSync(art.mdFile), 'summary.md missing');
    const parsed = JSON.parse(fs.readFileSync(art.reportFile, 'utf8'));
    assert.strictEqual(parsed.results.length, 2);
    const logs = fs.readdirSync(art.logsDir);
    assert.strictEqual(logs.length, 2, 'expected 2 log files, got ' + logs.length);
    const okLog = fs.readFileSync(path.join(art.logsDir, logs[0]), 'utf8');
    assert.ok(okLog.indexOf('hello-from-01') !== -1, 'log must contain captured stdout');
    const md = fs.readFileSync(art.mdFile, 'utf8');
    assert.ok(md.indexOf('| status | **failed** |') !== -1, 'summary must show failed status');
  });

  await test('state.json tracks failures and rerun targets only those', async () => {
    const r2 = mkTmp('rerun');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_ok.js', '01');
    writeScript(r2, '02_bad.js', '02', { fail: 1 });
    writeScript(r2, '03_ok.js', '03');
    const first = await R.runPlan(R.buildPlan(r2, {}), {
      stopOnError: false,
      env: { CM_TRACE: trace },
    });
    R.writeArtifacts(first, r2, {});
    const state = R.loadState(r2);
    assert.strictEqual(state.failed.length, 1);
    assert.ok(state.failed[0].endsWith('02_bad.js'));
    const last = R.loadLastReport(r2);
    assert.strictEqual(last.status, 'failed');
    const plan = R.planFromReport(last);
    assert.deepStrictEqual(
      plan.steps.map((s) => s.name),
      ['02_bad.js']
    );
  });

  await test('searchIndex matches name and content', () => {
    const r2 = mkTmp('search');
    fs.mkdirSync(path.join(r2, 'db'), { recursive: true });
    fs.writeFileSync(path.join(r2, 'db', '10_migrate--tag=db.js'), '// secret-token-xyz\n', 'utf8');
    fs.writeFileSync(path.join(r2, '99_other.js'), 'nothing\n', 'utf8');
    const idx = R.buildIndex(r2, {});
    assert.strictEqual(R.searchIndex(idx, 'tag=db').length, 1);
    assert.strictEqual(R.searchIndex(idx, 'migrate').length, 1);
    assert.strictEqual(R.searchIndex(idx, 'other').length, 1);
    assert.strictEqual(R.searchIndex(idx, '!secret-token').length, 1);
    assert.strictEqual(R.searchIndex(idx, 'nope-not-there').length, 0);
  });
}

/* ---------------------------------------------------------------- */
/* 6. end-to-end through the vscode command layer                    */
/* ---------------------------------------------------------------- */
function mockVscode(root) {
  const registered = {};
  const channel = {
    text: '',
    append(s) {
      this.text += s;
    },
    appendLine(s) {
      this.text += s + '\n';
    },
    show() {},
    dispose() {},
  };
  const status = { text: '', tooltip: '', show() {}, dispose() {}, command: '' };
  const api = {
    Uri: {
      file: (p) => ({ fsPath: p, toString: () => 'file:///' + String(p).replace(/\\/g, '/') }),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    window: {
      createOutputChannel: () => channel,
      createStatusBarItem: () => status,
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => 'Run',
      showErrorMessage: async () => undefined,
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      showTextDocument: async () => ({}),
    },
    commands: {
      registerCommand: (id, fn) => {
        registered[id] = fn;
        return { dispose() {} };
      },
      executeCommand: async () => undefined,
    },
    workspace: {
      getConfiguration: () => ({
        get: (k) => (k === 'runner.root' || k === 'rootPath' ? root : undefined),
      }),
      workspaceFolders: [{ uri: { fsPath: root } }],
    },
  };
  return { api, registered, channel, status };
}

async function testCommandLayer() {
  section('6. vscode command layer (end-to-end)');

  const root = mkTmp('e2e');
  writeScript(root, '01_first.js', '01', { echo: true });
  writeScript(root, '02_second.js', '02');
  writeScript(root, '03_third.js', '03');

  const mock = mockVscode(root);
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mock.api;
    return origLoad.apply(this, arguments);
  };

  const context = {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {} },
  };
  let disposables = null;
  try {
    disposables = R.activate(context);
  } catch (e) {
    Module._load = origLoad;
    throw e;
  }

  await test('activate registers all enterprise commands', () => {
    const expected = [
      'wf-code-manager.runFolder',
      'wf-code-manager.dryRun',
      'wf-code-manager.rerunFailed',
      'wf-code-manager.stopRun',
      'wf-code-manager.showRunStatus',
      'wf-code-manager.showLastReport',
      'wf-code-manager.buildIndex',
      'wf-code-manager.searchScripts',
      'wf-code-manager.openReportsFolder',
    ];
    for (const id of expected) {
      assert.strictEqual(typeof mock.registered[id], 'function', 'missing command ' + id);
    }
    assert.strictEqual(context.subscriptions.length >= expected.length + 2, true);
  });

  await test('dry run produces no execution', async () => {
    const trace = path.join(root, 'trace-dry.log');
    fs.writeFileSync(trace, '');
    await mock.registered['wf-code-manager.dryRun']({ filePath: root, isDirectory: true });
    assert.ok(mock.channel.text.indexOf('DRY RUN') !== -1, 'channel must mention DRY RUN');
    assert.ok(mock.channel.text.indexOf('01_first.js') !== -1);
  });

  await test('buildIndex command reports stats', async () => {
    mock.channel.text = '';
    await mock.registered['wf-code-manager.buildIndex']();
    // no throw == ok (info message goes to the mocked window)
  });

  await test('runFolder executes and writes report + state', async () => {
    const trace = path.join(mkTmp('e2e-trace'), 't.log');
    fs.writeFileSync(trace, '');
    const prevEnv = process.env.CM_TRACE;
    process.env.CM_TRACE = trace;
    try {
      await mock.registered['wf-code-manager.runFolder']({ filePath: root, isDirectory: true });
    } finally {
      if (prevEnv === undefined) delete process.env.CM_TRACE;
      else process.env.CM_TRACE = prevEnv;
    }
    const state = R.loadState(root);
    assert.ok(state, 'state.json must exist after run');
    assert.strictEqual(state.lastStatus, 'success', 'lastStatus=' + state.lastStatus);
    assert.strictEqual(state.failed.length, 0);
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['01', '02', '03']);
  });

  await test('stopRun reports no run in progress', async () => {
    await mock.registered['wf-code-manager.stopRun']();
    assert.strictEqual(typeof mock.status.text, 'string');
  });

  await test('stopRun cancels an active run', async () => {
    const r2 = mkTmp('e2e-stop');
    const trace = path.join(r2, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(r2, '01_long.js', '01', { sleepMs: 8000 });
    writeScript(r2, '02_after.js', '02');
    mock.api.workspace.getConfiguration = () => ({
      get: (k) => (k === 'runner.root' || k === 'rootPath' ? r2 : undefined),
    });
    const prevEnv = process.env.CM_TRACE;
    process.env.CM_TRACE = trace;
    try {
      const p = mock.registered['wf-code-manager.runFolder']({ filePath: r2, isDirectory: true });
      setTimeout(() => mock.registered['wf-code-manager.stopRun'](), 300);
      await p;
    } finally {
      if (prevEnv === undefined) delete process.env.CM_TRACE;
      else process.env.CM_TRACE = prevEnv;
    }
    const state = R.loadState(r2);
    assert.ok(state, 'state.json must exist');
    assert.strictEqual(state.lastStatus, 'stopped', 'lastStatus=' + state.lastStatus);
  });

  await test('searchScripts command is callable', async () => {
    await mock.registered['wf-code-manager.searchScripts']();
  });

  await test('runFolder targets the CLICKED folder, not the configured root', async () => {
    writeScript(root, 'sub/10_sub.js', '10');
    writeScript(root, 'sub/deep/20_deep.js', '20');
    mock.channel.text = '';
    await mock.registered['wf-code-manager.runFolder']({
      filePath: path.join(root, 'sub'),
      isDirectory: true,
    });
    const log = mock.channel.text;
    assert.ok(
      log.indexOf('root   : ' + path.join(root, 'sub')) !== -1,
      'the plan root must be the CLICKED folder:\n' + log
    );
    assert.ok(log.indexOf('10_sub.js') !== -1, 'clicked folder script missing:\n' + log);
    assert.ok(log.indexOf('deep/20_deep.js') !== -1, 'recursive scan missing:\n' + log);
    assert.ok(/steps {2}: 2\b/.test(log), 'expected exactly 2 steps:\n' + log);
    assert.strictEqual(
      log.indexOf('01_first.js'),
      -1,
      'the configured root must NOT be scanned when a folder is clicked:\n' + log
    );
  });

  Module._load = origLoad;
}

/* ---------------------------------------------------------------- */
/* 7. package.json consistency                                       */
/* ---------------------------------------------------------------- */
async function testPackaging() {
  section('7. package.json / manifest consistency');

  const extDir = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const extSrc = fs.readFileSync(path.join(extDir, 'dist', 'extension.js'), 'utf8');
  const runnerSrc = fs.readFileSync(path.join(extDir, 'dist', 'runner.js'), 'utf8');
  const declares = (id) =>
    extSrc.indexOf("'" + id + "'") !== -1 || runnerSrc.indexOf("'" + id + "'") !== -1;

  await test('every declared command has a handler', () => {
    const missing = pkg.contributes.commands.map((c) => c.command).filter((c) => !declares(c));
    assert.deepStrictEqual(missing, [], 'missing handlers: ' + missing.join(', '));
  });

  await test('menus only reference declared commands', () => {
    const declared = pkg.contributes.commands.map((c) => c.command);
    const referenced = [];
    for (const section of Object.keys(pkg.contributes.menus)) {
      for (const m of pkg.contributes.menus[section]) referenced.push(m.command);
    }
    const unknown = referenced.filter((c) => declared.indexOf(c) === -1);
    assert.deepStrictEqual(
      unknown,
      [],
      'menus reference undeclared commands: ' + unknown.join(', ')
    );
  });

  await test('runner is wired into the bundled extension', () => {
    assert.ok(
      extSrc.indexOf("require('./runner.js')") !== -1,
      "extension.js must require('./runner.js')"
    );
  });

  await test('rootPath config is registered under contributes', () => {
    assert.ok(pkg.contributes.configuration, 'contributes.configuration missing');
    assert.ok(
      pkg.contributes.configuration.properties['wf-code-manager.rootPath'],
      'wf-code-manager.rootPath must be registered'
    );
  });

  await test('all runner settings are declared', () => {
    const props = Object.keys(pkg.contributes.configuration.properties);
    const want = [
      'runner.stopOnError',
      'runner.timeoutSeconds',
      'runner.retries',
      'runner.maxParallel',
      'runner.numberedOnly',
      'runner.recursive',
      'runner.confirmBeforeRun',
      'runner.ignoreFolders',
      'runner.includeExtensions',
      'runner.reportsDir',
      'runner.pwshPath',
      'runner.pythonPath',
    ];
    for (const w of want) {
      assert.ok(props.indexOf('wf-code-manager.' + w) !== -1, 'missing setting ' + w);
    }
  });

  await test('activationEvents declared', () => {
    assert.ok(Array.isArray(pkg.activationEvents) && pkg.activationEvents.length > 0);
  });

  await test('resume + watch are declared and reachable from the folder menu', () => {
    const cmds = pkg.contributes.commands.map((c) => c.command);
    assert.ok(cmds.indexOf('wf-code-manager.resumeRun') !== -1, 'resumeRun not declared');
    assert.ok(cmds.indexOf('wf-code-manager.watchFolder') !== -1, 'watchFolder not declared');

    const ctx = pkg.contributes.menus['view/item/context'].filter(
      (m) => m.command.indexOf('resumeRun') !== -1 || m.command.indexOf('watchFolder') !== -1
    );
    assert.strictEqual(ctx.length, 2, 'both commands must be in the folder context menu');
    ctx.forEach((m) => assert.ok(m.when.indexOf('/folder/') !== -1, 'bad when: ' + m.when));
  });

  /* ---- UI orientation rules ---------------------------------------- */
  const titleMenu = () => pkg.contributes.menus['view/title'];
  const ctxMenu = () => pkg.contributes.menus['view/item/context'];
  const declared = () => pkg.contributes.commands.map((c) => c.command);

  await test('toolbar is exactly Run / Preview / Stop (no icon wall)', () => {
    assert.deepStrictEqual(
      titleMenu().map((m) => m.command),
      ['wf-code-manager.runFolder', 'wf-code-manager.dryRun', 'wf-code-manager.stopRun']
    );
    assert.ok(titleMenu().length <= 3, 'more than 3 toolbar buttons disorient the user');
    titleMenu().forEach((m, i) => assert.strictEqual(m.group, 'navigation@' + (i + 1)));
  });

  await test('context menu groups follow the fixed semantic order', () => {
    const allowed = ['0_run', '1_type', '2_edit', '3_new', '4_go', '5_more'];
    const seen = [];
    for (const m of ctxMenu()) {
      const g = String(m.group).split('@')[0];
      if (g === 'inline') continue;
      assert.ok(allowed.indexOf(g) !== -1, 'unexpected group "' + g + '" on ' + m.command);
      if (seen.indexOf(g) === -1) seen.push(g);
    }
    assert.deepStrictEqual(seen, allowed, 'groups must appear in the semantic order');
  });

  await test('no duplicate group id (otherwise VS Code orders randomly)', () => {
    const byWhen = new Map();
    for (const m of ctxMenu()) {
      if (m.group === 'inline') continue;
      const key = m.when + '::' + m.group;
      assert.ok(!byWhen.has(key), 'duplicate group ' + m.group + ' for when: ' + m.when);
      byWhen.set(key, m.command);
    }
  });

  await test('legacy commands are hidden from every menu but still declared', () => {
    const legacy = [
      'wf-code-manager.runAll',
      'wf-code-manager.newCommand',
      'wf-code-manager.newRecursiveFolder',
    ];
    const all = ctxMenu().concat(titleMenu());
    for (const id of legacy) {
      assert.ok(declared().indexOf(id) !== -1, id + ' must stay registered for keybindings');
      assert.strictEqual(
        all.filter((m) => m.command === id).length,
        0,
        id + ' must not appear in any menu'
      );
    }
  });

  await test('every menu entry points at a declared command', () => {
    const d = declared();
    ctxMenu()
      .concat(titleMenu())
      .forEach((m) => {
        assert.ok(d.indexOf(m.command) !== -1, 'undeclared command in a menu: ' + m.command);
      });
  });

  await test('every toolbar and inline entry has an icon', () => {
    ctxMenu()
      .filter((m) => m.group === 'inline')
      .concat(titleMenu())
      .forEach((m) => {
        const cmd = pkg.contributes.commands.find((c) => c.command === m.command);
        assert.ok(cmd && cmd.icon, m.command + ' has no icon but is shown as a button');
      });
  });

  await test('the More… hub covers every command exactly once', () => {
    const hub = R.HUB.map((h) => h.id);
    assert.strictEqual(new Set(hub).size, hub.length, 'duplicate entry in the hub');
    const expected = declared()
      .filter((c) => c !== 'wf-code-manager.more')
      .sort();
    assert.deepStrictEqual(hub.slice().sort(), expected, 'hub must list every command');
    R.HUB.forEach((h) => {
      assert.ok(h.title, h.id + ' has no hub title');
      assert.strictEqual(h.id.indexOf('wf-code-manager.'), 0, 'bad hub id: ' + h.id);
    });
  });

  await test('one icon language: no command keeps a raw SVG icon', () => {
    const svg = pkg.contributes.commands.filter((c) => c.icon && typeof c.icon === 'object');
    assert.deepStrictEqual(
      svg.map((c) => c.command),
      [],
      'use codicons so every button has the same size and weight'
    );
  });
}

/* ---------------------------------------------------------------- */
/* helpers for async tests                                           */
/* ---------------------------------------------------------------- */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 3000)) {
    if (fn()) return true;
    await sleep(25);
  }
  return false;
}

/* ---------------------------------------------------------------- */
/* 8. dependencies (--depend)                                        */
/* ---------------------------------------------------------------- */
async function testDependencies() {
  section('8. Dependencies (--depend)');

  await test('parses depend / dep / after / needs markers', () => {
    assert.deepStrictEqual(R.parseMeta('30_x--depend=db.js').deps, ['db']);
    assert.deepStrictEqual(R.parseMeta('30_x--dep=db.js').deps, ['db']);
    assert.deepStrictEqual(R.parseMeta('30_x--after=db.js').deps, ['db']);
    assert.deepStrictEqual(R.parseMeta('30_x--needs=db--needs=api.js').deps, ['db', 'api']);
    assert.deepStrictEqual(R.parseMeta('30_x.js').deps, []);
  });

  await test('order dependency (leading zero) reorders the plan', () => {
    const root = mkTmp('cm-dep-order');
    writeScript(root, '01_use--depend=09.js', 'use');
    writeScript(root, '09_api.js', 'api');
    const plan = R.buildPlan(root);
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['09_api.js', '01_use--depend=09.js'],
      'dependency must run first'
    );
    assert.deepStrictEqual(plan.steps[1].dependsOn, ['09_api.js']);
    assert.strictEqual(plan.stats.withDeps, 1);
  });

  await test('tag dependency reorders the plan', () => {
    const root = mkTmp('cm-dep-tag');
    writeScript(root, '01_use--depend=db.js', 'use');
    writeScript(root, '09_db--tag=db.js', 'db');
    const plan = R.buildPlan(root);
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['09_db--tag=db.js', '01_use--depend=db.js']
    );
  });

  await test('without dependencies the numeric order is untouched', () => {
    const root = mkTmp('cm-dep-none');
    writeScript(root, '02_b.js', 'b');
    writeScript(root, '01_a.js', 'a');
    const plan = R.buildPlan(root);
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['01_a.js', '02_b.js']
    );
    assert.strictEqual(plan.stats.withDeps, 0);
  });

  await test('cycle is detected, reported and fails safe to numeric order', () => {
    const root = mkTmp('cm-dep-cycle');
    writeScript(root, '01_a--tag=t1--depend=t2.js', 'a');
    writeScript(root, '02_b--tag=t2--depend=t1.js', 'b');
    const plan = R.buildPlan(root);
    assert.strictEqual(plan.cycles.length, 2, 'both steps are in the cycle');
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['01_a--tag=t1--depend=t2.js', '02_b--tag=t2--depend=t1.js'],
      'fail safe: numeric order kept'
    );
    assert.ok(
      plan.warnings.some((w) => /cycle/i.test(w)),
      'cycle warning missing'
    );

    const h = R.resolveDependencies(
      [
        { rel: 'x.js', name: 'x.js', order: 1, tags: [], deps: ['y.js'] },
        { rel: 'y.js', name: 'y.js', order: 2, tags: [], deps: ['x.js'] },
      ],
      []
    );
    assert.strictEqual(h.cycles.length, 2);
    assert.deepStrictEqual(
      h.steps.map((s) => s.rel),
      ['x.js', 'y.js']
    );
  });

  await test('unknown dependency becomes a warning, not a crash', () => {
    const root = mkTmp('cm-dep-unknown');
    writeScript(root, '01_a--depend=nope.js', 'a');
    const plan = R.buildPlan(root);
    assert.strictEqual(plan.steps.length, 1);
    assert.deepStrictEqual(plan.steps[0].dependsOn, []);
    assert.ok(
      plan.warnings.some((w) => w.indexOf('nope') !== -1),
      'warning about "nope" missing: ' + JSON.stringify(plan.warnings)
    );
  });

  await test('a failed dependency BLOCKS its dependent (nothing runs)', async () => {
    const root = mkTmp('cm-dep-gate');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_broken.js', 'broken', { fail: 3 });
    writeScript(root, '02_use--depend=01.js', 'use');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { stopOnError: false, env: { CM_TRACE: trace } });

    assert.strictEqual(rep.status, 'failed');
    assert.strictEqual(rep.totals.blocked, 1, 'dependent must be blocked');
    const lines = fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean);
    assert.deepStrictEqual(lines, ['broken'], 'the dependent script must NOT execute');
    const blocked = rep.results.find((r) => r.status === 'blocked');
    assert.ok(blocked.reason.indexOf('01_broken.js') !== -1, 'reason=' + blocked.reason);
  });

  await test('a successful dependency lets the dependent run', async () => {
    const root = mkTmp('cm-dep-ok');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_api.js', 'api');
    writeScript(root, '02_use--depend=01.js', 'use');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'success');
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean), [
      'api',
      'use',
    ]);
  });

  await test('gated steps are never merged into a --par batch', () => {
    const plain = { index: 2, parallel: true, exec: { bin: 'x' }, dependsOn: [] };
    const gated = { index: 1, parallel: true, exec: { bin: 'x' }, dependsOn: ['a.js'] };
    const merged = R.groupBatches([plain, Object.assign({}, plain, { index: 3 })]);
    assert.strictEqual(merged.length, 1, 'plain --par steps still batch together');
    assert.strictEqual(merged[0].length, 2);

    const split = R.groupBatches([plain, gated, plain]);
    assert.strictEqual(split.length, 3, 'a gated step must break the batch');
    split.forEach((b) => assert.strictEqual(b.length, 1));
  });
}

/* ---------------------------------------------------------------- */
/* 9. resume (checkpoints)                                           */
/* ---------------------------------------------------------------- */
async function testResume() {
  section('9. Resume (crash-safe checkpoints)');

  await test('checkpoint is written after every step', async () => {
    const root = mkTmp('cm-cp');
    writeScript(root, '01_a.js', 'a');
    writeScript(root, '02_b.js', 'b');
    const plan = R.buildPlan(root);
    const file = R.checkpointFile(root);
    await R.runPlan(plan, { checkpointFile: file });

    const cp = R.loadCheckpoint(root);
    assert.ok(cp, 'checkpoint file missing');
    assert.strictEqual(cp.done.length, 2);
    assert.strictEqual(cp.fingerprint, plan.fingerprint);
    assert.ok(cp.updatedAt);
  });

  await test('resumeIndex points at the first step that did not succeed', async () => {
    const root = mkTmp('cm-resume-idx');
    writeScript(root, '01_a.js', 'a');
    writeScript(root, '02_fail.js', 'f', { fail: 4 });
    writeScript(root, '03_c.js', 'c');
    const plan = R.buildPlan(root);
    await R.runPlan(plan, { checkpointFile: R.checkpointFile(root) });

    const probe = R.hasResumePoint(root, plan, {});
    assert.strictEqual(probe.resumable, true);
    assert.strictEqual(probe.fromIndex, 2, 'must resume at the failed step');
  });

  await test('an interrupted run can be resumed and finishes the rest', async () => {
    const root = mkTmp('cm-resume-run');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_a.js', 'a');
    writeScript(root, '02_b.js', 'b');
    writeScript(root, '03_c.js', 'c');
    const plan = R.buildPlan(root);

    // Simulate a crash right after step 1: leave a real checkpoint behind.
    R.saveCheckpoint(
      R.checkpointFile(root),
      plan,
      { fromIndex: 1 },
      [{ index: 1, rel: '01_a.js', status: 'ok' }],
      Date.now()
    );

    const probe = R.hasResumePoint(root, plan, {});
    assert.strictEqual(probe.resumable, true);
    assert.strictEqual(probe.fromIndex, 2);

    const rep = await R.runPlan(plan, {
      checkpointFile: R.checkpointFile(root),
      fromIndex: probe.fromIndex,
      env: { CM_TRACE: trace },
    });
    assert.strictEqual(rep.status, 'success');
    assert.strictEqual(rep.resumedFrom, 2);
    assert.strictEqual(rep.totals.skipped, 1, 'step 01 must be reported as skipped');
    assert.deepStrictEqual(
      fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean),
      ['b', 'c'],
      'resume must continue from step 2, not re-run step 1'
    );
  });

  await test('a stale checkpoint (tree changed) starts from scratch', async () => {
    const root = mkTmp('cm-resume-stale');
    writeScript(root, '01_a.js', 'a');
    const plan = R.buildPlan(root);
    await R.runPlan(plan, { checkpointFile: R.checkpointFile(root) });
    assert.strictEqual(R.resumeIndex(plan, R.loadCheckpoint(root)), 2, 'all done -> past the end');

    fs.writeFileSync(path.join(root, '00_new.js'), 'console.log(1);\n', 'utf8');
    const plan2 = R.buildPlan(root);
    assert.strictEqual(
      R.resumeIndex(plan2, R.loadCheckpoint(root)),
      1,
      'stale checkpoint must be ignored'
    );
  });

  await test('hasResumePoint is false when there is no checkpoint', () => {
    const root = mkTmp('cm-resume-none');
    writeScript(root, '01_a.js', 'a');
    const plan = R.buildPlan(root);
    const probe = R.hasResumePoint(root, plan, {});
    assert.strictEqual(probe.resumable, false);
    assert.strictEqual(probe.fromIndex, 1);
  });

  await test('clearCheckpoint removes the file', async () => {
    const root = mkTmp('cm-resume-clear');
    writeScript(root, '01_a.js', 'a');
    const plan = R.buildPlan(root);
    await R.runPlan(plan, { checkpointFile: R.checkpointFile(root) });
    assert.ok(fs.existsSync(R.checkpointFile(root)));
    assert.strictEqual(R.clearCheckpoint(root, {}), true);
    assert.strictEqual(fs.existsSync(R.checkpointFile(root)), false);
  });
}

/* ---------------------------------------------------------------- */
/* 10. watch mode                                                    */
/* ---------------------------------------------------------------- */
async function testWatch() {
  section('10. Watch mode');

  await test('watchRoot fires onChange on a real file change', async () => {
    const root = mkTmp('cm-watch');
    writeScript(root, '01_a.js', 'a');
    const hits = [];
    const h = R.watchRoot(root, { debounceMs: 60 }, (info) => hits.push(info));
    assert.ok(!h.error, 'watcher failed to start: ' + (h.error && h.error.message));
    await sleep(200);
    fs.writeFileSync(path.join(root, '02_new.js'), 'console.log(1);\n', 'utf8');
    const got = await waitFor(() => hits.length > 0, 4000);
    h.close();
    assert.ok(got, 'no change event detected');
    assert.ok(hits[0].file.indexOf('02_new.js') !== -1, 'file=' + hits[0].file);
    assert.ok(h.events() > 0);
    assert.strictEqual(h.isClosed(), true);
  });

  await test('a burst of writes is debounced into one callback', async () => {
    const root = mkTmp('cm-watch-debounce');
    const hits = [];
    const h = R.watchRoot(root, { debounceMs: 300 }, (info) => hits.push(info));
    await sleep(200);
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(root, 'f' + i + '.js'), 'x\n', 'utf8');
      await sleep(15);
    }
    await waitFor(() => hits.length > 0, 4000);
    await sleep(500);
    h.close();
    assert.strictEqual(hits.length, 1, 'expected 1 coalesced callback, got ' + hits.length);
  });

  await test('close() stops further notifications', async () => {
    const root = mkTmp('cm-watch-close');
    const hits = [];
    const h = R.watchRoot(root, { debounceMs: 50 }, (info) => hits.push(info));
    await sleep(200);
    h.close();
    fs.writeFileSync(path.join(root, 'x.js'), 'x\n', 'utf8');
    await sleep(400);
    assert.strictEqual(hits.length, 0);
  });

  await test('ignore list and .codemanager never trigger a run', async () => {
    const root = mkTmp('cm-watch-ignore');
    const hits = [];
    const h = R.watchRoot(root, { debounceMs: 50, ignore: ['custom_ignored'] }, (i) =>
      hits.push(i)
    );
    await sleep(200);
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    fs.mkdirSync(path.join(root, 'custom_ignored'), { recursive: true });
    fs.mkdirSync(path.join(root, '.codemanager'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'a.js'), 'x', 'utf8');
    fs.writeFileSync(path.join(root, 'custom_ignored', 'b.js'), 'x', 'utf8');
    fs.writeFileSync(path.join(root, '.codemanager', 'checkpoint.json'), 'x', 'utf8');
    await sleep(500);
    h.close();
    assert.strictEqual(hits.length, 0, 'ignored paths must not trigger: ' + JSON.stringify(hits));

    // ...but a normal file still does.
    const h2 = R.watchRoot(root, { debounceMs: 50, ignore: ['custom_ignored'] }, (i) =>
      hits.push(i)
    );
    await sleep(200);
    fs.writeFileSync(path.join(root, 'real.js'), 'x', 'utf8');
    const got = await waitFor(() => hits.length > 0, 4000);
    h2.close();
    assert.ok(got, 'a normal file must still trigger');
  });
}

/* ---------------------------------------------------------------- */
/* 11. `--rec` stages (nested sequences)                             */
/* ---------------------------------------------------------------- */
function mkStageTree(prefix) {
  const root = mkTmp(prefix);
  writeScript(root, '01_before.js', 'before');
  writeScript(root, '02_stage--rec/01_a.js', 'a');
  writeScript(root, '02_stage--rec/02_b.js', 'b');
  writeScript(root, '03_after.js', 'after');
  return root;
}

async function testStages() {
  section('11. --rec stages (nested sequences)');

  await test('a --rec folder is ONE stage unit in the parent plan', () => {
    const root = mkStageTree('cm-stage-plan');
    const plan = R.buildPlan(root);
    assert.deepStrictEqual(
      plan.steps.map((s) => s.type + ':' + s.rel),
      ['file:01_before.js', 'stage:02_stage--rec', 'file:03_after.js'],
      'the parent must see the folder as a single step'
    );
    const stage = plan.steps[1];
    assert.strictEqual(stage.children.length, 2);
    assert.strictEqual(stage.exec, null, 'a stage is not an executable');
    assert.strictEqual(plan.stats.scripts, 4);
    assert.strictEqual(plan.stats.stages, 1);
  });

  await test('a --rec folder is NOT flattened into the parent', () => {
    const root = mkStageTree('cm-stage-flat');
    const top = R.buildPlan(root).steps.map((s) => s.rel);
    assert.strictEqual(
      top.indexOf('02_stage--rec/01_a.js'),
      -1,
      'the stage child leaked into the parent plan'
    );
  });

  await test('nested --rec folders nest inside each other', () => {
    const root = mkTmp('cm-stage-nested');
    writeScript(root, '01_top.js', 'top');
    writeScript(root, '02_s--rec/01_a.js', 'a');
    writeScript(root, '02_s--rec/02_inner--rec/01_x.js', 'x');
    const plan = R.buildPlan(root);
    const stage = plan.steps.find((s) => s.type === 'stage');
    assert.ok(stage, 'outer stage missing');
    const inner = stage.children.find((s) => s.type === 'stage');
    assert.ok(inner, 'inner stage missing');
    assert.strictEqual(inner.rel, '02_s--rec/02_inner--rec');
    assert.strictEqual(inner.children.length, 1);
    assert.strictEqual(plan.stats.stages, 2);
    assert.strictEqual(plan.stats.scripts, 3);
  });

  await test('an empty --rec folder is skipped, not an empty stage', () => {
    const root = mkTmp('cm-stage-empty');
    writeScript(root, '01_a.js', 'a');
    fs.mkdirSync(path.join(root, '02_empty--rec'), { recursive: true });
    const plan = R.buildPlan(root);
    assert.strictEqual(plan.steps.length, 1);
    assert.strictEqual(plan.stats.stages, 0);
  });

  await test('running the --rec folder directly shows its scripts at the top', () => {
    const root = mkStageTree('cm-stage-direct');
    const plan = R.buildPlan(path.join(root, '02_stage--rec'));
    assert.deepStrictEqual(
      plan.steps.map((s) => s.rel),
      ['01_a.js', '02_b.js']
    );
    assert.strictEqual(plan.stats.stages, 0, 'no nested wrapper when it IS the root');
  });

  await test('a stage executes as one step, strictly in order', async () => {
    const root = mkStageTree('cm-stage-run');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'success');
    assert.strictEqual(rep.results.length, 3, 'one result per top-level step');
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean), [
      'before',
      'a',
      'b',
      'after',
    ]);
    const stage = rep.results[1];
    assert.strictEqual(stage.rel, '02_stage--rec');
    assert.strictEqual(stage.status, 'ok');
    assert.deepStrictEqual(
      stage.children.map((c) => c.rel),
      ['02_stage--rec/01_a.js', '02_stage--rec/02_b.js']
    );
  });

  await test('a NESTED stage actually executes its scripts', async () => {
    const root = mkTmp('cm-stage-nested-run');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_a.js', 'a');
    writeScript(root, '02_outer--rec/01_b.js', 'b');
    writeScript(root, '02_outer--rec/02_inner--rec/01_c.js', 'c');
    writeScript(root, '03_d.js', 'd');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'success', 'nested stages must run');
    assert.deepStrictEqual(
      fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean),
      ['a', 'b', 'c', 'd'],
      'the deepest script must execute'
    );
    const outer = rep.results[1];
    assert.strictEqual(outer.rel, '02_outer--rec');
    assert.strictEqual(outer.children.length, 2);
    const inner = outer.children.find((c) => c.rel === '02_outer--rec/02_inner--rec');
    assert.ok(inner, 'inner stage result missing');
    assert.strictEqual(inner.status, 'ok');
    assert.strictEqual(inner.children.length, 1);
    assert.strictEqual(inner.children[0].status, 'ok');
    assert.strictEqual(inner.children[0].exitCode, 0);
  });

  await test('--par is ignored inside a --rec stage (guaranteed order)', async () => {
    const root = mkTmp('cm-stage-par');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_s--rec/01_slow--par.js', 'slow', { sleepMs: 250 });
    writeScript(root, '01_s--rec/02_fast--par.js', 'fast', { sleepMs: 0 });
    const plan = R.buildPlan(root);
    assert.strictEqual(plan.steps[0].type, 'stage');
    const rep = await R.runPlan(plan, { env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'success');
    assert.deepStrictEqual(
      fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean),
      ['slow', 'fast'],
      'inside a stage --par must NOT run concurrently'
    );
  });

  await test('a failure inside a stage stops the stage', async () => {
    const root = mkTmp('cm-stage-fail');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_s--rec/01_ok.js', 'ok');
    writeScript(root, '01_s--rec/02_bad.js', 'bad', { fail: 5 });
    writeScript(root, '01_s--rec/03_never.js', 'never');
    writeScript(root, '02_after.js', 'after');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { stopOnError: true, env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'failed');
    assert.strictEqual(rep.results.length, 1, 'the run stops at the failed stage');
    const stage = rep.results[0];
    assert.strictEqual(stage.status, 'failed');
    assert.strictEqual(stage.children.length, 2, '03_never must not run');
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean), [
      'ok',
      'bad',
    ]);
  });

  await test('with stopOnError=false the stage continues but rolls up as failed', async () => {
    const root = mkTmp('cm-stage-continue');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_s--rec/01_bad.js', 'bad', { fail: 3 });
    writeScript(root, '01_s--rec/02_ok.js', 'ok');
    writeScript(root, '02_after.js', 'after');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { stopOnError: false, env: { CM_TRACE: trace } });
    assert.strictEqual(rep.status, 'failed');
    assert.strictEqual(rep.results.length, 2, 'the run continues past the stage');
    assert.strictEqual(rep.results[0].status, 'failed', 'the stage rolls up the failure');
    assert.strictEqual(rep.results[0].children.length, 2, 'both children ran');
    assert.strictEqual(rep.results[1].status, 'ok');
    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean), [
      'bad',
      'ok',
      'after',
    ]);
  });

  await test('dependencies resolve INSIDE a stage (no false warnings)', () => {
    const root = mkTmp('cm-stage-dep');
    writeScript(root, '01_s--rec/01_use--depend=02.js', 'use');
    writeScript(root, '01_s--rec/02_api.js', 'api');
    const plan = R.buildPlan(root);
    const stage = plan.steps[0];
    assert.deepStrictEqual(
      stage.children.map((c) => c.rel),
      ['01_s--rec/02_api.js', '01_s--rec/01_use--depend=02.js']
    );
    assert.deepStrictEqual(stage.children[1].dependsOn, ['01_s--rec/02_api.js']);
    assert.strictEqual(
      plan.warnings.filter((w) => w.indexOf('unknown') !== -1).length,
      0,
      'intra-stage deps must not be reported as unknown: ' + JSON.stringify(plan.warnings)
    );
  });

  await test('a failed dependency inside a stage blocks its dependent', async () => {
    const root = mkTmp('cm-stage-gate');
    const trace = path.join(root, 't.log');
    fs.writeFileSync(trace, '');
    writeScript(root, '01_s--rec/01_broken.js', 'broken', { fail: 2 });
    writeScript(root, '01_s--rec/02_use--depend=01.js', 'use');
    const plan = R.buildPlan(root);
    const rep = await R.runPlan(plan, { stopOnError: false, env: { CM_TRACE: trace } });
    const stage = rep.results[0];
    assert.strictEqual(stage.children.length, 2);
    assert.strictEqual(stage.children[1].status, 'blocked');
    assert.deepStrictEqual(
      fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean),
      ['broken'],
      'the dependent must NOT execute'
    );
  });

  await test('plan text renders the stage with its scripts indented', () => {
    const root = mkStageTree('cm-stage-text');
    const txt = R.formatPlanText(R.buildPlan(root));
    assert.ok(/1\. 01_before\.js/.test(txt), txt);
    assert.ok(/\[stage\] 02_stage--rec {3}\(2 scripts\)/.test(txt), txt);
    assert.ok(/^\s+1\. 02_stage--rec\/01_a\.js$/m.test(txt), 'child not indented:\n' + txt);
    assert.ok(/stages: 1/.test(txt), 'stage count missing:\n' + txt);
  });

  await test('stage plans are deterministic across rebuilds', () => {
    const root = mkStageTree('cm-stage-stable');
    const a = R.buildPlan(root);
    const b = R.buildPlan(root);
    assert.strictEqual(a.fingerprint, b.fingerprint);
    assert.strictEqual(
      R.formatPlanText(a).split('\n').slice(2).join('\n'),
      R.formatPlanText(b).split('\n').slice(2).join('\n')
    );
  });

  await test('fingerprint changes when a script appears INSIDE a stage', () => {
    const root = mkStageTree('cm-stage-fp');
    const before = R.buildPlan(root).fingerprint;
    writeScript(root, '02_stage--rec/03_c.js', 'c');
    const after = R.buildPlan(root).fingerprint;
    assert.notStrictEqual(before, after, 'nested changes must invalidate a checkpoint');
  });

  await test('the stage log nests its children', async () => {
    const root = mkStageTree('cm-stage-log');
    const rep = await R.runPlan(R.buildPlan(root), {});
    R.writeArtifacts(rep, root, {});
    const stageLog = rep.results[1].logFile;
    assert.ok(stageLog, 'no log written for the stage');
    const txt = fs.readFileSync(stageLog, 'utf8');
    assert.ok(txt.indexOf('nested stage (2 scripts)') !== -1, txt);
    assert.ok(txt.indexOf('02_stage--rec/01_a.js') !== -1, txt);
  });
}

async function main() {
  process.stdout.write('\nCode Manager — Enterprise Runner test suite\n');
  process.stdout.write(
    'node ' + process.version + ' | ' + process.platform + ' | runner v' + R.VERSION + '\n'
  );

  const root = mkTree('cm-main');

  await testMeta();
  await testIndex(root);
  await testPlan(root);
  await testRunner(root);
  await testReports(root);
  await testCommandLayer();
  await testPackaging();
  await testDependencies();
  await testResume();
  await testWatch();
  await testStages();

  cleanup();

  process.stdout.write('\n' + '='.repeat(60) + '\n');
  process.stdout.write('RESULT: ' + pass + ' passed, ' + fail + ' failed\n');
  if (fail) {
    process.stdout.write('\nFailures:\n');
    failures.forEach((f) => process.stdout.write('- ' + f.name + '\n' + f.message + '\n\n'));
    process.exitCode = 1;
  } else {
    process.stdout.write('ALL TESTS PASSED\n');
  }
}

main().catch((e) => {
  process.stderr.write('FATAL: ' + ((e && e.stack) || e) + '\n');
  cleanup();
  process.exitCode = 1;
});
