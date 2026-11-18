'use strict';
/**
 * Code Manager — stability harness.
 * Runs every suite N times in separate processes (needed: the suites install
 * their own `require('vscode')` hooks) and reports per-iteration results.
 *
 * Use: node test/all.js [iterations]
 */

const path = require('path');
const { spawnSync } = require('child_process');

const SUITES = ['runner.test.js', 'bundle.test.js'];
const iterations = Math.max(1, parseInt(process.argv[2] || '3', 10) || 3);

let bad = 0;
let runs = 0;

process.stdout.write('Code Manager — stability harness (' + iterations + ' iterations)\n\n');

for (let i = 1; i <= iterations; i++) {
  for (const suite of SUITES) {
    const started = Date.now();
    const res = spawnSync(process.execPath, [path.join(__dirname, suite)], {
      encoding: 'utf8',
      timeout: 180000,
    });
    const out = (res.stdout || '') + (res.stderr || '');
    const line =
      out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.indexOf('RESULT:') === 0) || '(no RESULT line)';
    const ok = res.status === 0;
    runs++;
    if (!ok) bad++;
    process.stdout.write(
      '  ' +
        (ok ? '\u2713' : '\u2717') +
        '  iter ' +
        i +
        '  ' +
        suite.padEnd(18) +
        line.padEnd(34) +
        ' ' +
        (Date.now() - started) +
        'ms\n'
    );
    if (!ok) {
      process.stdout.write(
        out
          .split(/\r?\n/)
          .filter((l) => l.indexOf('Failures:') !== -1 || l.indexOf('FATAL') !== -1)
          .map((l) => '       ' + l)
          .join('\n') + '\n'
      );
    }
  }
}

process.stdout.write('\n' + '='.repeat(60) + '\n');
process.stdout.write('STABILITY: ' + (runs - bad) + '/' + runs + ' runs green\n');
if (bad) {
  process.stdout.write('UNSTABLE — see failures above\n');
  process.exitCode = 1;
} else {
  process.stdout.write('100% STABLE\n');
}
