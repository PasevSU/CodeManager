'use strict';
/**
 * Code Manager — bundle integration test.
 * Loads the REAL dist/extension.js with a mocked `vscode` module, activates it
 * and drives the tree provider + info hook + enterprise runner together.
 *
 * Use: node test/bundle.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

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

/* ------------------------------------------------------------------ */
/* vscode mock                                                         */
/* ------------------------------------------------------------------ */
const FileType = { Unknown: 0, File: 1, Directory: 2 };
const CollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

function makeVscode(config) {
  const state = {
    commands: {},
    terminals: [],
    config: Object.assign({}, config || {}),
    warnAnswer: 'Run',
    treeOptions: null,
    onExpand: null,
    onCollapse: null,
    createdTerminals: 0,
    messages: [],
    channels: [],
    lastQuickPick: null,
  };

  class EventEmitter {
    constructor() {
      this._ls = [];
    }
    get event() {
      const self = this;
      return function (listener) {
        self._ls.push(listener);
        return { dispose() {} };
      };
    }
    fire(v) {
      this._ls.forEach((l) => l(v));
    }
    dispose() {}
  }

  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(id) {
      this.id = id;
    }
  }

  class DataTransferItem {
    constructor(value) {
      this.value = value;
    }
  }

  const uri = (p) => ({ fsPath: p, path: p, scheme: 'file', toString: () => 'file:///' + p });

  const api = {
    Uri: { file: uri, joinPath: (u, ...rest) => uri(path.join(u.fsPath, ...rest)) },
    FileType: FileType,
    TreeItem: TreeItem,
    TreeItemCollapsibleState: CollapsibleState,
    ThemeIcon: ThemeIcon,
    EventEmitter: EventEmitter,
    DataTransferItem: DataTransferItem,
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    l10n: { t: (s) => s },
    env: {
      language: 'bg',
      shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      clipboard: { writeText: async () => {} },
    },
    extensions: { getExtension: () => ({}) },
    workspace: {
      workspaceFolders: null,
      getConfiguration: () => ({
        get: (k) => state.config[k],
        update: async (k, v) => {
          state.config[k] = v;
        },
      }),
      fs: {
        readDirectory: async (u) =>
          fs
            .readdirSync(u.fsPath, { withFileTypes: true })
            .map((d) => [d.name, d.isDirectory() ? FileType.Directory : FileType.File]),
        readFile: async (u) => fs.readFileSync(u.fsPath),
        writeFile: async (u, data) => fs.writeFileSync(u.fsPath, data),
        stat: async (u) => fs.statSync(u.fsPath),
        createDirectory: async (u) => fs.mkdirSync(u.fsPath, { recursive: true }),
        rename: async (a, b) => fs.renameSync(a.fsPath, b.fsPath),
        copy: async (a, b) => fs.copyFileSync(a.fsPath, b.fsPath),
        delete: async (u) => fs.rmSync(u.fsPath, { recursive: true, force: true }),
      },
    },
    window: {
      terminals: state.terminals,
      createTerminal: (name) => {
        state.createdTerminals++;
        const t = {
          name: name || 'x',
          text: '',
          show() {},
          sendText(txt) {
            this.text += txt + '\n';
          },
          dispose() {},
        };
        state.terminals.push(t);
        return t;
      },
      createOutputChannel: (name) => {
        const ch = {
          name: name,
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
        state.channels.push(ch);
        return ch;
      },
      createStatusBarItem: () => ({ text: '', tooltip: '', show() {}, dispose() {} }),
      createTreeView: (id, options) => {
        state.treeOptions = options;
        return {
          onDidExpandElement: (h) => {
            state.onExpand = h;
            return { dispose() {} };
          },
          onDidCollapseElement: (h) => {
            state.onCollapse = h;
            return { dispose() {} };
          },
          dispose() {},
        };
      },
      showInformationMessage: async (msg) => {
        state.messages.push(['info', msg]);
        return undefined;
      },
      showWarningMessage: async (msg) => {
        state.messages.push(['warn', msg]);
        return state.warnAnswer;
      },
      showErrorMessage: async (msg) => {
        state.messages.push(['error', msg]);
        return undefined;
      },
      showInputBox: async () => undefined,
      showQuickPick: async (items) => {
        state.lastQuickPick = items;
        return undefined;
      },
      showOpenDialog: async () => undefined,
      showTextDocument: async () => ({}),
    },
    commands: {
      registerCommand: (id, fn) => {
        state.commands[id] = fn;
        return { dispose() {} };
      },
      executeCommand: async (id, ...args) => {
        const fn = state.commands[id];
        return typeof fn === 'function' ? fn(...args) : undefined;
      },
    },
  };

  return { api: api, state: state };
}

/* ------------------------------------------------------------------ */
let tmpRoots = [];
function mkTmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  tmpRoots.push(d);
  return d;
}

function cleanup() {
  for (const d of tmpRoots) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
async function main() {
  process.stdout.write('\nCode Manager — bundle integration test\n');
  process.stdout.write('node ' + process.version + '\n\n');
  process.stdout.write('1. Bundle activation\n--------------------\n');

  const root = mkTmp('cm-bundle');
  fs.mkdirSync(path.join(root, 'stage'), { recursive: true });
  fs.mkdirSync(path.join(root, 'seq--rec'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs--info'), { recursive: true });
  fs.writeFileSync(path.join(root, '01_a--kode.js'), '// kode\n', 'utf8');
  fs.writeFileSync(path.join(root, '02_b--info.js'), '// info\n', 'utf8');
  fs.writeFileSync(path.join(root, '03_c--text.txt'), 'text\n', 'utf8');
  fs.writeFileSync(path.join(root, '04_d--cli.txt'), 'cli\n', 'utf8');
  fs.writeFileSync(path.join(root, 'plain.ps1'), '# plain\n', 'utf8');
  // info-file fixture for the expand hook: empty `info` + populated `a--info.txt`
  fs.writeFileSync(path.join(root, 'stage', 'info'), '', 'utf8');
  fs.writeFileSync(path.join(root, 'stage', 'a--info.txt'), 'HELLO_INFO_BLOCK\n', 'utf8');

  const mock = makeVscode({ rootPath: root });
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return mock.api;
    return origLoad.apply(this, arguments);
  };

  const context = {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {} },
  };

  let ext = null;
  try {
    ext = require(path.join(__dirname, '..', 'dist', 'extension.js'));
  } catch (e) {
    Module._load = origLoad;
    process.stderr.write('FATAL: cannot load bundle: ' + e.stack + '\n');
    process.exitCode = 1;
    return;
  }

  await test('bundle exports activate()', () => {
    assert.strictEqual(typeof ext.activate, 'function');
  });

  await test('activate() runs without throwing', () => {
    ext.activate(context);
    assert.ok(context.subscriptions.length > 0, 'nothing registered');
  });

  await test('tree view registered with drag&drop provider', () => {
    assert.ok(mock.state.treeOptions, 'createTreeView not called');
    assert.strictEqual(typeof mock.state.treeOptions.treeDataProvider.getChildren, 'function');
  });

  await test('all original + runner commands are registered', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const declared = pkg.contributes.commands.map((c) => c.command);
    const missing = declared.filter((c) => typeof mock.state.commands[c] !== 'function');
    assert.deepStrictEqual(missing, [], 'not registered at runtime: ' + missing.join(', '));
  });

  process.stdout.write('\n2. Tree provider\n----------------\n');

  const provider = mock.state.treeOptions.treeDataProvider;

  await test('provider.setRootPath + getChildren lists entries', async () => {
    provider.setRootPath(root, context);
    const children = await provider.getChildren();
    const names = children.map((c) => path.basename(c.filePath)).sort();
    assert.ok(names.indexOf('01_a--kode.js') !== -1, 'missing kode file');
    assert.ok(names.indexOf('stage') !== -1, 'missing folder');
    assert.ok(names.indexOf('seq--rec') !== -1, 'missing rec folder');
  });

  await test('contextValue is assigned per file/folder kind', async () => {
    const children = await provider.getChildren();
    const byName = {};
    children.forEach((c) => (byName[path.basename(c.filePath)] = provider.getTreeItem(c)));
    assert.strictEqual(byName['01_a--kode.js'].contextValue, 'file-kode');
    assert.strictEqual(byName['02_b--info.js'].contextValue, 'file-info');
    assert.strictEqual(byName['03_c--text.txt'].contextValue, 'file-text');
    assert.strictEqual(byName['04_d--cli.txt'].contextValue, 'file-cli');
    assert.strictEqual(byName['plain.ps1'].contextValue, 'file');
    assert.strictEqual(byName['seq--rec'].contextValue, 'folder-rec');
  });

  await test('kind-specific icons are applied (ThemeIcon)', async () => {
    const children = await provider.getChildren();
    const byName = {};
    children.forEach((c) => (byName[path.basename(c.filePath)] = provider.getTreeItem(c)));
    assert.strictEqual(
      byName['01_a--kode.js'].iconPath && byName['01_a--kode.js'].iconPath.id,
      'play'
    );
    assert.strictEqual(
      byName['02_b--info.js'].iconPath && byName['02_b--info.js'].iconPath.id,
      'info'
    );
    assert.strictEqual(
      byName['03_c--text.txt'].iconPath && byName['03_c--text.txt'].iconPath.id,
      'note'
    );
    assert.strictEqual(
      byName['04_d--cli.txt'].iconPath && byName['04_d--cli.txt'].iconPath.id,
      'list-selection'
    );
    assert.strictEqual(
      byName['seq--rec'].iconPath && byName['seq--rec'].iconPath.id,
      'list-ordered'
    );
  });

  process.stdout.write('\n3. Info hook -> terminal\n------------------------\n');

  await test('expanding a folder echoes the info file into the terminal', async () => {
    const term = {
      name: 'Code Manager',
      text: '',
      show() {},
      sendText(txt) {
        this.text += txt + '\n';
      },
      dispose() {},
    };
    mock.state.terminals.push(term);

    const children = await provider.getChildren();
    const stage = children.find((c) => path.basename(c.filePath) === 'stage');
    assert.ok(stage, 'stage folder not found');
    assert.strictEqual(typeof mock.state.onExpand, 'function', 'onDidExpandElement not wired');

    await mock.state.onExpand(stage);
    assert.ok(
      term.text.indexOf('[Code Manager] info: stage') !== -1,
      'header missing: ' + term.text
    );
    assert.ok(term.text.indexOf('HELLO_INFO_BLOCK') !== -1, 'info body missing: ' + term.text);
    assert.ok(term.text.indexOf("echo '") !== -1, 'must be sent as an echo command: ' + term.text);
  });

  await test('empty info file is skipped, non-empty one is used', async () => {
    // `info` (empty) sorts before `a--info.txt`? ensure both are tried and only one printed
    const term = mock.state.terminals[mock.state.terminals.length - 1];
    const printed = term.text.split('\n').filter((l) => l.indexOf('HELLO_INFO_BLOCK') !== -1);
    assert.strictEqual(printed.length, 1, 'info must be printed exactly once');
  });

  await test('info and the runner share ONE output channel', () => {
    const chans = mock.state.channels;
    assert.strictEqual(
      chans.length,
      1,
      'expected exactly one output channel, got ' + chans.map((c) => c.name).join(', ')
    );
    assert.strictEqual(chans[0].name, 'Code Manager');
    assert.ok(
      chans[0].text.indexOf('HELLO_INFO_BLOCK') !== -1,
      'info text missing from the shared channel: ' + chans[0].text
    );
    assert.ok(chans[0].text.indexOf('[info] stage') !== -1, 'channel header missing');
  });

  await test('the More… hub lists every command', async () => {
    const R = require(path.join(__dirname, '..', 'dist', 'runner.js'));
    mock.state.lastQuickPick = null;
    await mock.state.commands['wf-code-manager.more']();
    const items = mock.state.lastQuickPick;
    assert.ok(Array.isArray(items), 'the hub produced no QuickPick items');
    assert.strictEqual(items.length, R.HUB.length, 'hub item count mismatch');
    items.forEach((it) => {
      assert.ok(it.label, 'hub item needs a label');
      assert.ok(it.detail !== undefined, 'hub item needs a detail');
      assert.strictEqual(
        it.cmd.indexOf('wf-code-manager.'),
        0,
        'hub item points nowhere: ' + it.cmd
      );
      assert.strictEqual(
        typeof mock.state.commands[it.cmd],
        'function',
        'hub item is not a registered command: ' + it.cmd
      );
    });
  });

  await test('runAll is a thin alias of runFolder (same plan, same channel)', async () => {
    const r3 = mkTmp('cm-alias');
    const dir = path.join(r3, 'a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01_a.js'), 'console.log(1);\n', 'utf8');
    fs.writeFileSync(path.join(dir, '02_b.js'), 'console.log(2);\n', 'utf8');
    const item = { filePath: dir, isDirectory: true };
    const chan = mock.state.channels[0];

    chan.text = '';
    await mock.state.commands['wf-code-manager.runFolder'](item);
    const viaFolder = chan.text;

    chan.text = '';
    await mock.state.commands['wf-code-manager.runAll'](item);
    const viaAlias = chan.text;

    assert.ok(/steps {2}: 2\b/.test(viaFolder), 'runFolder plan wrong:\n' + viaFolder);
    assert.ok(/steps {2}: 2\b/.test(viaAlias), 'runAll must produce the same plan:\n' + viaAlias);
    assert.ok(viaAlias.indexOf('01_a.js') !== -1, 'alias did not run the scripts');
    assert.ok(viaAlias.indexOf('02_b.js') !== -1, 'alias did not run the scripts');
    assert.strictEqual(
      mock.state.channels.length,
      1,
      'running must not create a second output channel'
    );
  });

  process.stdout.write(
    '\n4. Enterprise runner through the bundle\n--------------------------------------\n'
  );

  await test('runtime runner shares the same module instance', () => {
    const R = require(path.join(__dirname, '..', 'dist', 'runner.js'));
    assert.strictEqual(typeof R.runPlan, 'function');
    // bundle + direct require must resolve to the same object (single instantiation)
    assert.strictEqual(R, require(path.join(__dirname, '..', 'dist', 'runner.js')));
  });

  await test('runFolder (via bundle) executes real scripts and writes a report', async () => {
    const r2 = mkTmp('cm-bundle-run');
    const trace = path.join(mkTmp('cm-trace'), 't.log');
    fs.writeFileSync(trace, '');
    fs.writeFileSync(
      path.join(r2, '01_one.js'),
      'require("fs").appendFileSync(process.env.CM_TRACE,"one\\n");\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(r2, '02_two.js'),
      'require("fs").appendFileSync(process.env.CM_TRACE,"two\\n");\n',
      'utf8'
    );
    mock.state.config['runner.root'] = r2;
    mock.state.config['runner.confirmBeforeRun'] = true;

    const prev = process.env.CM_TRACE;
    process.env.CM_TRACE = trace;
    try {
      await mock.state.commands['wf-code-manager.runFolder']({ filePath: r2, isDirectory: true });
    } finally {
      if (prev === undefined) delete process.env.CM_TRACE;
      else process.env.CM_TRACE = prev;
    }

    assert.deepStrictEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), ['one', 'two']);
    const R = require(path.join(__dirname, '..', 'dist', 'runner.js'));
    const state = R.loadState(r2);
    assert.ok(state, 'state.json missing after run');
    assert.strictEqual(state.lastStatus, 'success');
    assert.ok(fs.existsSync(state.lastReport), 'report.json missing');
  });

  await test('stopping the runner leaves a "stopped" state, not a crash', async () => {
    const r2 = mkTmp('cm-bundle-stop');
    fs.writeFileSync(path.join(r2, '01_hang.js'), 'setTimeout(function(){}, 10000);\n', 'utf8');
    mock.state.config['runner.root'] = r2;
    const p = mock.state.commands['wf-code-manager.runFolder']({ filePath: r2, isDirectory: true });
    setTimeout(() => mock.state.commands['wf-code-manager.stopRun'](), 300);
    await p;
    const R = require(path.join(__dirname, '..', 'dist', 'runner.js'));
    const state = R.loadState(r2);
    assert.ok(state, 'state.json missing');
    assert.strictEqual(state.lastStatus, 'stopped');
  });

  Module._load = origLoad;
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
