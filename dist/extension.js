(() => {
  'use strict';
  var e = {
      59: function (e, t, r) {
        var o,
          n =
            (this && this.__createBinding) ||
            (Object.create
              ? function (e, t, r, o) {
                  void 0 === o && (o = r);
                  var n = Object.getOwnPropertyDescriptor(t, r);
                  ((n && !('get' in n ? !t.__esModule : n.writable || n.configurable)) ||
                    (n = {
                      enumerable: !0,
                      get: function () {
                        return t[r];
                      },
                    }),
                    Object.defineProperty(e, o, n));
                }
              : function (e, t, r, o) {
                  (void 0 === o && (o = r), (e[o] = t[r]));
                }),
          a =
            (this && this.__setModuleDefault) ||
            (Object.create
              ? function (e, t) {
                  Object.defineProperty(e, 'default', { enumerable: !0, value: t });
                }
              : function (e, t) {
                  e.default = t;
                }),
          i =
            (this && this.__importStar) ||
            ((o = function (e) {
              return (
                (o =
                  Object.getOwnPropertyNames ||
                  function (e) {
                    var t = [];
                    for (var r in e)
                      Object.prototype.hasOwnProperty.call(e, r) && (t[t.length] = r);
                    return t;
                  }),
                o(e)
              );
            }),
            function (e) {
              if (e && e.__esModule) return e;
              var t = {};
              if (null != e)
                for (var r = o(e), i = 0; i < r.length; i++) 'default' !== r[i] && n(t, e, r[i]);
              return (a(t, e), t);
            });
        (Object.defineProperty(t, '__esModule', { value: !0 }),
          (t.Main = void 0),
          (t.Main = i(r(670))));
      },
      265: function (e, t, r) {
        var o,
          n =
            (this && this.__createBinding) ||
            (Object.create
              ? function (e, t, r, o) {
                  void 0 === o && (o = r);
                  var n = Object.getOwnPropertyDescriptor(t, r);
                  ((n && !('get' in n ? !t.__esModule : n.writable || n.configurable)) ||
                    (n = {
                      enumerable: !0,
                      get: function () {
                        return t[r];
                      },
                    }),
                    Object.defineProperty(e, o, n));
                }
              : function (e, t, r, o) {
                  (void 0 === o && (o = r), (e[o] = t[r]));
                }),
          a =
            (this && this.__setModuleDefault) ||
            (Object.create
              ? function (e, t) {
                  Object.defineProperty(e, 'default', { enumerable: !0, value: t });
                }
              : function (e, t) {
                  e.default = t;
                }),
          i =
            (this && this.__importStar) ||
            ((o = function (e) {
              return (
                (o =
                  Object.getOwnPropertyNames ||
                  function (e) {
                    var t = [];
                    for (var r in e)
                      Object.prototype.hasOwnProperty.call(e, r) && (t[t.length] = r);
                    return t;
                  }),
                o(e)
              );
            }),
            function (e) {
              if (e && e.__esModule) return e;
              var t = {};
              if (null != e)
                for (var r = o(e), i = 0; i < r.length; i++) 'default' !== r[i] && n(t, e, r[i]);
              return (a(t, e), t);
            });
        (Object.defineProperty(t, '__esModule', { value: !0 }),
          (t.activate = function (e) {
            (s.commands.executeCommand('wf-code-manager.checkLanguage'), c.Main.activate(e));
          }),
          (t.deactivate = function () {}));
        const s = i(r(398)),
          c = r(59);
      },
      397: function (e, t, r) {
        var o,
          n =
            (this && this.__createBinding) ||
            (Object.create
              ? function (e, t, r, o) {
                  void 0 === o && (o = r);
                  var n = Object.getOwnPropertyDescriptor(t, r);
                  ((n && !('get' in n ? !t.__esModule : n.writable || n.configurable)) ||
                    (n = {
                      enumerable: !0,
                      get: function () {
                        return t[r];
                      },
                    }),
                    Object.defineProperty(e, o, n));
                }
              : function (e, t, r, o) {
                  (void 0 === o && (o = r), (e[o] = t[r]));
                }),
          a =
            (this && this.__setModuleDefault) ||
            (Object.create
              ? function (e, t) {
                  Object.defineProperty(e, 'default', { enumerable: !0, value: t });
                }
              : function (e, t) {
                  e.default = t;
                }),
          i =
            (this && this.__importStar) ||
            ((o = function (e) {
              return (
                (o =
                  Object.getOwnPropertyNames ||
                  function (e) {
                    var t = [];
                    for (var r in e)
                      Object.prototype.hasOwnProperty.call(e, r) && (t[t.length] = r);
                    return t;
                  }),
                o(e)
              );
            }),
            function (e) {
              if (e && e.__esModule) return e;
              var t = {};
              if (null != e)
                for (var r = o(e), i = 0; i < r.length; i++) 'default' !== r[i] && n(t, e, r[i]);
              return (a(t, e), t);
            });
        (Object.defineProperty(t, '__esModule', { value: !0 }),
          (t.register = function (e, t) {
            const r = e.subscriptions;
            for (const [e, o] of Object.entries(t)) r.push(s.commands.registerCommand(e, o));
          }));
        const s = i(r(398));
      },
      398: (e) => {
        e.exports = require('vscode');
      },
      613: function (e, t, r) {
        var o,
          n =
            (this && this.__createBinding) ||
            (Object.create
              ? function (e, t, r, o) {
                  void 0 === o && (o = r);
                  var n = Object.getOwnPropertyDescriptor(t, r);
                  ((n && !('get' in n ? !t.__esModule : n.writable || n.configurable)) ||
                    (n = {
                      enumerable: !0,
                      get: function () {
                        return t[r];
                      },
                    }),
                    Object.defineProperty(e, o, n));
                }
              : function (e, t, r, o) {
                  (void 0 === o && (o = r), (e[o] = t[r]));
                }),
          a =
            (this && this.__setModuleDefault) ||
            (Object.create
              ? function (e, t) {
                  Object.defineProperty(e, 'default', { enumerable: !0, value: t });
                }
              : function (e, t) {
                  e.default = t;
                }),
          i =
            (this && this.__importStar) ||
            ((o = function (e) {
              return (
                (o =
                  Object.getOwnPropertyNames ||
                  function (e) {
                    var t = [];
                    for (var r in e)
                      Object.prototype.hasOwnProperty.call(e, r) && (t[t.length] = r);
                    return t;
                  }),
                o(e)
              );
            }),
            function (e) {
              if (e && e.__esModule) return e;
              var t = {};
              if (null != e)
                for (var r = o(e), i = 0; i < r.length; i++) 'default' !== r[i] && n(t, e, r[i]);
              return (a(t, e), t);
            });
        (Object.defineProperty(t, '__esModule', { value: !0 }),
          (t.FileTreeDataProvider = t.FileTreeItem = void 0));
        const s = i(r(398)),
          c = i(r(928)),
          l = i(r(896));
        class u extends s.TreeItem {
          resourceUri;
          collapsibleState;
          parent;
          isDirectory;
          filePath;
          constructor(e, t, r) {
            (super(e, t),
              (this.resourceUri = e),
              (this.collapsibleState = t),
              (this.parent = r),
              (this.filePath = e.fsPath));
            const o = l.statSync(this.resourceUri.fsPath);
            ((this.isDirectory = o.isDirectory()),
              (this.tooltip = this.resourceUri.fsPath),
              (this.contextValue = this.isDirectory ? 'folder' : 'file'));
            if (!this.isDirectory) {
              try {
                const base = c
                  .basename(this.filePath)
                  .toLowerCase()
                  .replace(/\.[^.]+$/, '');
                let type = null;
                if (base === 'info' || base.endsWith('--info')) type = 'info';
                else if (base === 'text' || base.endsWith('--text')) type = 'text';
                else if (base === 'kode' || base.endsWith('--kode')) type = 'kode';
                else if (base === 'cli' || base.endsWith('--cli')) type = 'cli';
                const cmds = {
                  info: { command: 'vscode.open', title: 'Open', arguments: [this.resourceUri] },
                  text: {
                    command: 'wf-code-manager.textImport',
                    title: 'Insert Text',
                    arguments: [this],
                  },
                  kode: {
                    command: 'wf-code-manager.runInTerminal',
                    title: 'Run',
                    arguments: [this],
                  },
                  cli: { command: 'wf-code-manager.cli', title: 'CLI', arguments: [this] },
                };
                if (type) {
                  this.contextValue = 'file-' + type;
                  const icons = { info: 'info', text: 'note', kode: 'play', cli: 'list-selection' };
                  if (s.ThemeIcon) this.iconPath = new s.ThemeIcon(icons[type]);
                }
                this.command = cmds[type] || {
                  command: 'vscode.open',
                  title: 'Open File',
                  arguments: [this.resourceUri],
                };
              } catch (e3) {
                this.command = {
                  command: 'vscode.open',
                  title: 'Open File',
                  arguments: [this.resourceUri],
                };
              }
            } else {
              try {
                const fbase = c.basename(this.filePath).toLowerCase();
                if (fbase === 'info' || fbase.endsWith('--info')) {
                  this.contextValue = 'folder-info';
                  if (s.ThemeIcon) this.iconPath = new s.ThemeIcon('info');
                } else if (fbase === 'rec' || fbase.endsWith('--rec')) {
                  this.contextValue = 'folder-rec';
                  if (s.ThemeIcon) this.iconPath = new s.ThemeIcon('list-ordered');
                }
              } catch (e4) {}
            }
          }
        }
        ((t.FileTreeItem = u),
          (t.FileTreeDataProvider = class {
            _onDidChangeTreeData = new s.EventEmitter();
            onDidChangeTreeData = this._onDidChangeTreeData.event;
            dropMimeTypes = ['application/vnd.code.tree.fileExplorer'];
            dragMimeTypes = ['text/uri-list'];
            rootPath;
            context;
            constructor(e) {
              this.context = e;
            }
            refresh(e) {
              this._onDidChangeTreeData.fire(e);
            }
            getRootPath() {
              return this.rootPath;
            }
            printInfo(e, t) {
              const sh = (s.env.shell || '').toLowerCase();
              let q;
              if (/cmd\.exe$/.test(sh)) q = (x) => 'echo(' + x;
              else if (/powershell|pwsh/.test(sh))
                q = (x) => "echo '" + String(x).replace(/'/g, "''") + "'";
              else q = (x) => "echo '" + String(x).replace(/'/g, "'\\''") + "'";
              // Mirror to the ONE shared output channel: the terminal can be
              // hidden or busy, the Output panel is always reachable.
              try {
                const ch = require('./runner.js').getChannel();
                ch.appendLine('');
                ch.appendLine('[info] ' + t);
                for (const line of String(e).split(/\r?\n/)) ch.appendLine(line);
              } catch (e1) {}
              let term = s.window.terminals.find((x) => x.name === 'Code Manager');
              if (!term) term = s.window.activeTerminal || s.window.createTerminal('Code Manager');
              term.show(true);
              term.sendText(q('[Code Manager] info: ' + t), true);
              for (const line of String(e).split(/\r?\n/)) term.sendText(q(line), true);
            }
            setRootPath(e, t) {
              this.rootPath = e;
              try {
                const r = s.workspace
                  .getConfiguration('wf-code-manager')
                  .update('rootPath', e, s.ConfigurationTarget.Global);
                r && typeof r.then === 'function' && r.then(void 0, () => {});
              } catch (e1) {}
              this._onDidChangeTreeData.fire(void 0);
            }
            getTreeItem(e) {
              return e;
            }
            async getChildren(e) {
              if (!this.rootPath) return Promise.resolve([]);
              const t = e ? e.resourceUri.fsPath : this.rootPath;
              try {
                const expanded = new Set(this.context.globalState.get('expandedFolders') || []);
                const r = await l.promises.readdir(t),
                  o = await Promise.all(
                    r.map(async (e) => {
                      const r = c.join(t, e),
                        o = await l.promises.stat(r);
                      return { resourceUri: s.Uri.file(r), isDirectory: o.isDirectory(), name: e };
                    })
                  );
                return (
                  o.sort((e, t) =>
                    e.isDirectory && !t.isDirectory
                      ? -1
                      : !e.isDirectory && t.isDirectory
                        ? 1
                        : e.name.localeCompare(t.name)
                  ),
                  o.map(
                    (t) =>
                      new u(
                        t.resourceUri,
                        t.isDirectory
                          ? expanded.has(t.resourceUri.fsPath)
                            ? s.TreeItemCollapsibleState.Expanded
                            : s.TreeItemCollapsibleState.Collapsed
                          : s.TreeItemCollapsibleState.None,
                        e
                      )
                  )
                );
              } catch (e) {
                return [];
              }
            }
            async createFile(e, t) {
              let r = '';
              if (
                ((r = t
                  ? t.isDirectory
                    ? t.filePath
                    : c.dirname(t.filePath)
                  : this.context.globalState.get('rootPath')?.toString()),
                !r)
              )
                return void s.window.showErrorMessage('No folder selected.');
              const o = c.join(r, e);
              try {
                if ('.ps1' === c.extname(o).toLowerCase()) {
                  const e = Buffer.from([239, 187, 191]),
                    t = Buffer.concat([e, Buffer.from('', 'utf8')]);
                  await l.promises.writeFile(o, t, { encoding: 'utf8' });
                } else await l.promises.writeFile(o, '');
                const e = t?.isDirectory ? t : t?.parent;
                (this.refresh(e), e && (e.collapsibleState = s.TreeItemCollapsibleState.Expanded));
              } catch (e) {
                s.window.showErrorMessage(`创建文件失败: ${e}`);
              }
            }
            async createFolder(e, t) {
              let r = '';
              if (
                ((r = t
                  ? t.isDirectory
                    ? t.filePath
                    : c.dirname(t.filePath)
                  : this.context.globalState.get('rootPath')?.toString()),
                r)
              )
                try {
                  ((r = c.join(r, e)), await l.promises.mkdir(r));
                  const o = t?.isDirectory ? t : t?.parent;
                  (this.refresh(o),
                    o && (o.collapsibleState = s.TreeItemCollapsibleState.Expanded));
                } catch (e) {
                  s.window.showErrorMessage(`创建文件夹失败: ${e}`);
                }
              else s.window.showErrorMessage('No folder selected.');
            }
            async delete(e) {
              try {
                ((await l.promises.stat(e.resourceUri.fsPath)).isDirectory()
                  ? await l.promises.rmdir(e.resourceUri.fsPath, { recursive: !0 })
                  : await l.promises.unlink(e.resourceUri.fsPath),
                  this.refresh(e.parent));
              } catch (e) {
                s.window.showErrorMessage(`删除失败: ${e}`);
              }
            }
            async rename(e, t) {
              const r = e.resourceUri.fsPath,
                o = c.join(c.dirname(r), t);
              try {
                (await l.promises.rename(r, o), this.refresh(e.parent));
              } catch (e) {
                s.window.showErrorMessage(`重命名失败: ${e}`);
              }
            }
            async handleDrop(e, t, r) {
              const o = t.get('text/uri-list');
              if (!o) return;
              const n = await o.value;
              let a;
              if (
                (e
                  ? l.statSync(e.resourceUri.fsPath).isDirectory()
                    ? (a = e.resourceUri.fsPath)
                    : ((a = c.dirname(e.resourceUri.fsPath)),
                      s.window.showInformationMessage(`文件将被放置到 ${c.basename(a)} 目录中`))
                  : (a = this.rootPath),
                a)
              ) {
                for (const e of n) {
                  const t = e.fsPath,
                    r = c.basename(t),
                    o = c.join(a, r);
                  try {
                    if (t === o) continue;
                    await l.promises.rename(t, o);
                  } catch (e) {
                    s.window.showErrorMessage(`移动文件失败: ${e}`);
                  }
                }
                this.refresh();
              }
            }
            async handleDrag(e, t, r) {
              t.set('text/uri-list', new s.DataTransferItem(e.map((e) => e.resourceUri)));
            }
          }));
      },
      670: function (e, t, r) {
        var o,
          n =
            (this && this.__createBinding) ||
            (Object.create
              ? function (e, t, r, o) {
                  void 0 === o && (o = r);
                  var n = Object.getOwnPropertyDescriptor(t, r);
                  ((n && !('get' in n ? !t.__esModule : n.writable || n.configurable)) ||
                    (n = {
                      enumerable: !0,
                      get: function () {
                        return t[r];
                      },
                    }),
                    Object.defineProperty(e, o, n));
                }
              : function (e, t, r, o) {
                  (void 0 === o && (o = r), (e[o] = t[r]));
                }),
          a =
            (this && this.__setModuleDefault) ||
            (Object.create
              ? function (e, t) {
                  Object.defineProperty(e, 'default', { enumerable: !0, value: t });
                }
              : function (e, t) {
                  e.default = t;
                }),
          i =
            (this && this.__importStar) ||
            ((o = function (e) {
              return (
                (o =
                  Object.getOwnPropertyNames ||
                  function (e) {
                    var t = [];
                    for (var r in e)
                      Object.prototype.hasOwnProperty.call(e, r) && (t[t.length] = r);
                    return t;
                  }),
                o(e)
              );
            }),
            function (e) {
              if (e && e.__esModule) return e;
              var t = {};
              if (null != e)
                for (var r = o(e), i = 0; i < r.length; i++) 'default' !== r[i] && n(t, e, r[i]);
              return (a(t, e), t);
            }),
          s =
            (this && this.__importDefault) ||
            function (e) {
              return e && e.__esModule ? e : { default: e };
            };
        (Object.defineProperty(t, '__esModule', { value: !0 }),
          (t.activate = function (e) {
            ((d = new u.FileTreeDataProvider(e)),
              (h = c.window.createTreeView('wf-code-manager', {
                treeDataProvider: d,
                dragAndDropController: d,
                canSelectMany: !0,
              })));
            const t =
              c.workspace.getConfiguration('wf-code-manager').get('rootPath') ||
              e.globalState.get('rootPath')?.toString();
            (t && d.setRootPath(t, e),
              l.register(e, {
                'wf-code-manager.checkLanguage': async () => {
                  if ('zh-cn' === c.env.language) {
                    const t = e.globalState;
                    if (!t.get('installed')) {
                      await t.update('installed', !0);
                      const e = '重新加载窗口';
                      (await c.window.showInformationMessage(
                        '为了正确显示中文菜单，需要重新加载窗口。',
                        e
                      )) === e &&
                        (await c.commands.executeCommand('workbench.action.reloadWindow'));
                    }
                  }
                },
                'wf-code-manager.selectDirectory': async () => {
                  const t = await c.window.showOpenDialog({
                    canSelectFiles: !1,
                    canSelectFolders: !0,
                    canSelectMany: !1,
                    openLabel: m.t('Select Directory'),
                  });
                  if (t && t.length > 0) {
                    const r = t[0].fsPath;
                    (d.setRootPath(r, e), e.globalState.update('rootPath', r));
                  }
                },
                'wf-code-manager.refreshTreeView': async () => {
                  d && d.refresh();
                },
                'wf-code-manager.openFile': (e) => {
                  c.window.showTextDocument(c.Uri.file(e.filePath));
                },
                'wf-code-manager.newFile': async (t) => {
                  const types = [
                    { label: '$(file) Normal file', type: '' },
                    {
                      label: '$(info) Info file',
                      detail: 'folder info text (--info)',
                      type: 'info',
                    },
                    {
                      label: '$(note) Text file',
                      detail: 'insert text at cursor (--text)',
                      type: 'text',
                    },
                    { label: '$(play) Kode file', detail: 'runnable code (--kode)', type: 'kode' },
                    {
                      label: '$(list-selection) CLI file',
                      detail: 'interactive menu (--cli)',
                      type: 'cli',
                    },
                  ];
                  const pick = await c.window.showQuickPick(types, {
                    placeHolder: 'Choose file type',
                  });
                  if (!pick) return;
                  const name = await c.window.showInputBox({
                    prompt: 'File name (with extension)',
                    placeHolder: 'e.g. deploy.ps1',
                  });
                  if (!name) return;
                  let fileName = name;
                  if (pick.type) {
                    const ext = f.default.extname(name);
                    const base = f.default.basename(name, ext);
                    fileName = base + '--' + pick.type + ext;
                  }
                  const dir = t
                    ? t.isDirectory
                      ? t.filePath
                      : f.default.dirname(t.filePath)
                    : c.workspace.getConfiguration('wf-code-manager').get('rootPath') ||
                      e.globalState.get('rootPath')?.toString();
                  if (!dir) return void c.window.showErrorMessage('No folder selected.');
                  const full = f.default.join(dir, fileName);
                  const ext2 = f.default.extname(fileName).toLowerCase();
                  let content = '';
                  if (pick.type === 'info') content = 'Info for this folder:\n\n';
                  else if (pick.type === 'cli')
                    content =
                      'rem CLI options - one command per line\n' +
                      [
                        'echo Option 1',
                        'echo Option 2',
                        'echo Option 3',
                        'echo Option 4',
                        'echo Option 5',
                        'echo Option 6',
                        'echo Option 7',
                        'echo Option 8',
                        'echo Option 9',
                        'echo Option 10',
                      ].join('\n') +
                      '\n';
                  else if (pick.type === 'kode') {
                    if (ext2 === '.ps1') content = '# kode\n\n';
                    else if (ext2 === '.py') content = '# kode\n\n';
                    else if (ext2 === '.bat' || ext2 === '.cmd') content = '@echo off\n\n';
                  }
                  try {
                    await c.workspace.fs.writeFile(c.Uri.file(full), Buffer.from(content, 'utf8'));
                    await c.window.showTextDocument(c.Uri.file(full));
                    d.refresh();
                  } catch (err) {
                    c.window.showErrorMessage('Failed to create file: ' + err);
                  }
                },
                'wf-code-manager.newFolder': async (e) => {
                  const kinds = [
                    { label: '$(folder) Normal folder', kind: 'normal' },
                    {
                      label: '$(list-ordered) Recursive folder',
                      detail: 'runs 01*, 02*... in order (--rec)',
                      kind: 'rec',
                    },
                  ];
                  const pick = await c.window.showQuickPick(kinds, {
                    placeHolder: 'Choose folder type',
                  });
                  if (!pick) return;
                  const t = await c.window.showInputBox({
                    prompt: 'Folder name',
                    placeHolder: 'folder name',
                  });
                  if (!t) return;
                  const name = pick.kind === 'rec' && !/--rec$/.test(t) ? t + '--rec' : t;
                  d.createFolder(name, e);
                },
                'wf-code-manager.renameFile': async (e) => {
                  const t = await c.window.showInputBox({
                    prompt: m.t('Enter name'),
                    value: f.default.basename(e.filePath),
                  });
                  t && d.rename(e, t);
                },
                'wf-code-manager.deleteFiles': async (e) => {
                  (await c.window.showWarningMessage(
                    m.t('Are you sure you want to delete the selected item?'),
                    { modal: !0 },
                    m.t('Confirm Delete')
                  )) === m.t('Confirm Delete') && d.delete(e);
                },
                'wf-code-manager.runCode': async (e) => {
                  if (!e || e.isDirectory || !e.filePath) return;
                  const t = 'formulahendry.code-runner';
                  if (!c.extensions.getExtension(t)) {
                    if (
                      (await c.window.showInformationMessage(
                        m.t(
                          'The Code Runner extension is not installed. Do you want to install it now?'
                        ),
                        m.t('Yes'),
                        m.t('No')
                      )) !== m.t('Yes')
                    )
                      return;
                    (await c.commands.executeCommand('workbench.extensions.installExtension', t),
                      c.window.showInformationMessage(
                        m.t('The Code Runner extension has been installed.')
                      ));
                  }
                  await c.commands.executeCommand('code-runner.run', c.Uri.file(e.filePath));
                },
                'wf-code-manager.revealInExplorer': (e) => {
                  e &&
                    e.filePath &&
                    c.commands.executeCommand('revealFileInOS', c.Uri.file(e.filePath));
                },
                'wf-code-manager.openTerminalAtFile': (t) => {
                  let r = '';
                  r = t
                    ? t.isDirectory
                      ? t.filePath
                      : f.default.dirname(t.filePath)
                    : e.globalState.get('rootPath')?.toString();
                  if (r) {
                    const n = c.window.activeTerminal || c.window.createTerminal();
                    n.show();
                    n.sendText(`cd "${r}"`);
                  } else c.window.showErrorMessage(m.t('No folder selected.'));
                },
                'wf-code-manager.openInNewWindow': (e) => {
                  c.commands.executeCommand('vscode.openFolder', e.resourceUri, !0);
                },
                'wf-code-manager.copyPath': (e) => {
                  c.env.clipboard.writeText(e.filePath);
                },
                'wf-code-manager.runInTerminal': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  const ext = f.default.extname(t.filePath).toLowerCase();
                  const q = (p) => '"' + p.replace(/"/g, '`"') + '"';
                  let cmd = '';
                  if ('.ps1' === ext) cmd = '& ' + q(t.filePath);
                  else if ('.bat' === ext || '.cmd' === ext) cmd = '& ' + q(t.filePath);
                  else if ('.py' === ext) cmd = 'python ' + q(t.filePath);
                  else if ('.js' === ext || '.mjs' === ext) cmd = 'node ' + q(t.filePath);
                  else if ('.sh' === ext) cmd = 'bash ' + q(t.filePath);
                  else {
                    c.window.showErrorMessage('Unsupported file type for terminal run.');
                    return;
                  }
                  const n = c.window.activeTerminal || c.window.createTerminal();
                  n.show();
                  n.sendText(cmd);
                },
                'wf-code-manager.newCommand': async (t) => {
                  const name = await c.window.showInputBox({
                    prompt: 'Command file name',
                    placeHolder: 'e.g. my-command.ps1',
                  });
                  if (!name) return;
                  const dir = t
                    ? t.isDirectory
                      ? t.filePath
                      : f.default.dirname(t.filePath)
                    : c.workspace.getConfiguration('wf-code-manager').get('rootPath') ||
                      e.globalState.get('rootPath')?.toString();
                  if (!dir) return void c.window.showErrorMessage('No folder selected.');
                  const full = f.default.join(dir, name);
                  const ext = f.default.extname(name).toLowerCase();
                  let content = '';
                  if ('.ps1' === ext) content = '# PowerShell command\n\n';
                  else if ('.py' === ext) content = '# Python command\n\n';
                  else if ('.bat' === ext || '.cmd' === ext) content = '@echo off\n\n';
                  else if ('.md' === ext) content = '# ' + name + '\n\n';
                  try {
                    await c.workspace.fs.writeFile(c.Uri.file(full), Buffer.from(content, 'utf8'));
                    await c.window.showTextDocument(c.Uri.file(full));
                    d.refresh();
                  } catch (err) {
                    c.window.showErrorMessage('Failed to create command: ' + err);
                  }
                },
                'wf-code-manager.copyContent': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  try {
                    const bytes = await c.workspace.fs.readFile(c.Uri.file(t.filePath));
                    await c.env.clipboard.writeText(Buffer.from(bytes).toString('utf8'));
                    c.window.showInformationMessage('Content copied to clipboard.');
                  } catch (err) {
                    c.window.showErrorMessage('Failed to read file.');
                  }
                },
                'wf-code-manager.duplicateFile': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  const dir = f.default.dirname(t.filePath);
                  const ext = f.default.extname(t.filePath);
                  const base = f.default.basename(t.filePath, ext);
                  const dest = f.default.join(dir, base + ' (copy)' + ext);
                  try {
                    await c.workspace.fs.copy(c.Uri.file(t.filePath), c.Uri.file(dest));
                    d.refresh();
                  } catch (err) {
                    c.window.showErrorMessage('Failed to duplicate file.');
                  }
                },
                'wf-code-manager.infoFile': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  const dir = f.default.dirname(t.filePath);
                  const ext = f.default.extname(t.filePath);
                  const base = f.default.basename(t.filePath, ext);
                  if (base === 'info' || base.endsWith('--info')) return;
                  const dest = f.default.join(dir, base + '--info' + ext);
                  try {
                    await c.workspace.fs.rename(c.Uri.file(t.filePath), c.Uri.file(dest), {
                      overwrite: true,
                    });
                    d.refresh();
                  } catch (err) {
                    c.window.showErrorMessage('Failed to mark as info file: ' + err);
                  }
                },
                'wf-code-manager.textImport': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  const bytes = await c.workspace.fs.readFile(c.Uri.file(t.filePath));
                  const text = Buffer.from(bytes).toString('utf8');
                  const editor = c.window.activeTextEditor;
                  if (!editor)
                    return void c.window.showErrorMessage('No open editor to insert into.');
                  await editor.edit((eb) => {
                    eb.insert(editor.selection.active, text);
                  });
                },
                'wf-code-manager.cli': async (t) => {
                  if (!t || t.isDirectory || !t.filePath) return;
                  const bytes = await c.workspace.fs.readFile(c.Uri.file(t.filePath));
                  const lines = Buffer.from(bytes)
                    .toString('utf8')
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(
                      (s) =>
                        s.length > 0 &&
                        !s.startsWith('#') &&
                        !s.toLowerCase().startsWith('rem') &&
                        !s.startsWith('::') &&
                        !s.toLowerCase().startsWith('@echo')
                    );
                  if (!lines.length)
                    return void c.window.showErrorMessage('No options found in file.');
                  const pick = await c.window.showQuickPick(lines, {
                    placeHolder: 'Select an option to run',
                  });
                  if (!pick) return;
                  const n = c.window.activeTerminal || c.window.createTerminal();
                  n.show();
                  n.sendText(pick);
                },
                // Legacy alias: `runAll` used to be a second, parallel
                // implementation (hand-rolled recursive walk + terminal).
                // It now delegates so there is exactly ONE run behaviour.
                'wf-code-manager.runAll': async (t) => {
                  await c.commands.executeCommand('wf-code-manager.runFolder', t);
                },
                'wf-code-manager.newRecursiveFolder': async (t) => {
                  const name = await c.window.showInputBox({
                    prompt: 'Recursive folder name',
                    placeHolder: 'e.g. 00_setup',
                  });
                  if (!name) return;
                  const dir = t
                    ? t.isDirectory
                      ? t.filePath
                      : f.default.dirname(t.filePath)
                    : c.workspace.getConfiguration('wf-code-manager').get('rootPath') ||
                      e.globalState.get('rootPath')?.toString();
                  if (!dir) return void c.window.showErrorMessage('No folder selected.');
                  const folderName = /--rec$/.test(name) ? name : name + '--rec';
                  const full = f.default.join(dir, folderName);
                  try {
                    await c.workspace.fs.createDirectory(c.Uri.file(full));
                    d.refresh();
                  } catch (err) {
                    c.window.showErrorMessage('Failed to create folder: ' + err);
                  }
                },
                'wf-code-manager.openStructure': async (t) => {
                  let r =
                    t && t.filePath
                      ? t.isDirectory
                        ? t.filePath
                        : f.default.dirname(t.filePath)
                      : null;
                  if (!r) {
                    const dlg = await c.window.showOpenDialog({
                      canSelectFiles: false,
                      canSelectFolders: true,
                      canSelectMany: false,
                      openLabel: 'Open Structure',
                    });
                    if (dlg && dlg.length) r = dlg[0].fsPath;
                  }
                  if (!r) return;
                  d.setRootPath(r, e);
                  e.globalState.update('rootPath', r);
                  e.globalState.update('expandedFolders', []);
                },
              }));
            try {
              require('./runner.js').activate(e);
            } catch (err) {
              c.window.showErrorMessage('Code Manager runner failed to load: ' + err);
            }
            try {
              require('./current-folder.js').activate(e, d, h);
            } catch (err) {
              console.error('Code Manager workspace-folder indicator failed: ' + err);
            }
            h.onDidExpandElement(async (el) => {
              if (!el || !el.isDirectory) return;
              const arr = e.globalState.get('expandedFolders') || [];
              if (!arr.includes(el.filePath)) {
                arr.push(el.filePath);
                e.globalState.update('expandedFolders', arr);
              }
              try {
                const entries = await c.workspace.fs.readDirectory(c.Uri.file(el.filePath));
                const infos = entries
                  .filter(([, type]) => type === c.FileType.File)
                  .map(([name]) => name)
                  .filter((name) => {
                    const base = name.toLowerCase().replace(/\.[^.]+$/, '');
                    return base === 'info' || base.endsWith('--info');
                  })
                  .sort();
                let printed = false;
                for (const name of infos) {
                  const bytes = await c.workspace.fs.readFile(
                    c.Uri.file(f.default.join(el.filePath, name))
                  );
                  const text = Buffer.from(bytes).toString('utf8').trim();
                  if (text) {
                    d.printInfo(text, f.default.basename(el.filePath));
                    printed = true;
                    break;
                  }
                }
                // Never fail silently: say WHY nothing was shown.
                if (!printed && infos.length)
                  d.printInfo(
                    '(info file has no text: ' + infos.join(', ') + ')',
                    f.default.basename(el.filePath)
                  );
              } catch (e2) {}
            });
            h.onDidCollapseElement((el) => {
              if (!el || !el.isDirectory) return;
              const arr = e.globalState.get('expandedFolders') || [];
              const i2 = arr.indexOf(el.filePath);
              if (i2 >= 0) {
                arr.splice(i2, 1);
                e.globalState.update('expandedFolders', arr);
              }
            });
          }));
        const c = i(r(398)),
          l = i(r(397)),
          u = r(613),
          f = s(r(928));
        let d, h;
        const m = c.l10n;
      },
      896: (e) => {
        e.exports = require('fs');
      },
      928: (e) => {
        e.exports = require('path');
      },
    },
    t = {},
    r = (function r(o) {
      var n = t[o];
      if (void 0 !== n) return n.exports;
      var a = (t[o] = { exports: {} });
      return (e[o].call(a.exports, a, a.exports, r), a.exports);
    })(265);
  module.exports = r;
})();
