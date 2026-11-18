'use strict';
/**
 * Code Manager — workspace folder indicator.
 *
 * Purpose (requirement): Code Manager shows WHICH folder is currently open in
 * VS Code — in the tree view header (`description`), in the status bar and via
 * the command `wf-code-manager.showCurrentFolder`.
 *
 * Design notes:
 *  - Never assumes `vscode.workspace.workspaceFolders` is non-empty.
 *  - Never assumes the tree view / status bar API is fully present (the test
 *    harness mocks a subset of the API), every optional API is guarded.
 *  - Updates itself on `onDidChangeWorkspaceFolders`.
 */

const vscode = require('vscode');
const path = require('path');

const SHOW_COMMAND = 'wf-code-manager.showCurrentFolder';

let statusItem = null;
let treeView = null;
let provider = null;
let extensionContext = null;

/* ---------------------------------------------------------------- helpers */

function t(message) {
  try {
    if (vscode.l10n && typeof vscode.l10n.t === 'function') return vscode.l10n.t(message);
  } catch (err) {
    /* l10n unavailable — fall back to English */
  }
  return message;
}

function fsPathOf(uri) {
  if (!uri) return '';
  if (uri.fsPath) return uri.fsPath;
  return String(uri.path || uri);
}

function baseName(p) {
  const clean = String(p || '').replace(/[\\/]+$/, '');
  return path.basename(clean) || clean;
}

/**
 * @returns {{name: string, path: string, index: number}[]}
 */
function listFolders() {
  const folders = (vscode.workspace && vscode.workspace.workspaceFolders) || [];
  return Array.from(folders).map((folder, i) => {
    const p = fsPathOf(folder && folder.uri);
    return {
      name: (folder && folder.name) || baseName(p) || '(unnamed)',
      path: p,
      index: typeof folder.index === 'number' ? folder.index : i,
    };
  });
}

function headerLabel(folders) {
  if (!folders.length) return t('no folder open');
  const first = folders[0];
  if (folders.length === 1) return first.name;
  return first.name + ' (+' + (folders.length - 1) + ')';
}

/* ---------------------------------------------------------------- update */

/**
 * Re-renders the tree-view header and the status bar from the current
 * workspace folders. Safe to call at any time and any number of times.
 */
function update() {
  const folders = listFolders();
  const label = headerLabel(folders);
  const paths = folders.map((f) => f.path).join('\n');

  if (treeView) {
    try {
      treeView.description = label;
      treeView.tooltip = folders.length
        ? t('Currently open folder') + ': ' + paths + '\n' + t('Click to see all open workspace folders')
        : t('No folder is open. Open a folder first.');
    } catch (err) {
      /* read-only view in some hosts */
    }
  }

  if (statusItem) {
    statusItem.text = (folders.length ? '$(folder-opened) ' : '$(folder) ') + label;
    statusItem.command = SHOW_COMMAND;
    statusItem.tooltip = folders.length
      ? t('Currently open folder') + ': ' + paths + '\n' + t('Click to see all open workspace folders')
      : t('No folder is open. Open a folder first.');
    if (typeof statusItem.show === 'function') statusItem.show();
  }

  return folders;
}

/* ---------------------------------------------------------------- command */

async function showCurrentFolder() {
  const folders = listFolders();

  if (!folders.length) {
    const open = await vscode.window.showInformationMessage(
      t('No folder is open. Open a folder first.'),
      t('Open Folder…')
    );
    if (open) await vscode.commands.executeCommand('workbench.action.files.openFolder');
    return;
  }

  const item = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: '$(folder-opened) ' + folder.name,
      description: folder.path,
      detail: t('Currently open workspace folder'),
      folder: folder,
    })),
    { placeHolder: t('Currently open folder') }
  );
  if (!item) return;

  const action = await vscode.window.showQuickPick(
    [
      { label: '$(link-external) ' + t('Open in New Window'), action: 'open' },
      { label: '$(clippy) ' + t('Copy Path'), action: 'copy' },
      { label: '$(root-folder) ' + t('Use as Code Manager Root'), action: 'root' },
    ],
    { placeHolder: item.folder.path }
  );
  if (!action) return;

  if (action.action === 'open') {
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(item.folder.path), {
      forceNewWindow: true,
    });
    return;
  }

  if (action.action === 'copy') {
    if (vscode.env && vscode.env.clipboard) await vscode.env.clipboard.writeText(item.folder.path);
    if (typeof vscode.window.setStatusBarMessage === 'function') {
      vscode.window.setStatusBarMessage(t('Path copied to clipboard.'), 3000);
    }
    return;
  }

  if (action.action === 'root' && provider && typeof provider.setRootPath === 'function') {
    provider.setRootPath(item.folder.path, extensionContext);
    if (extensionContext && extensionContext.globalState) {
      await extensionContext.globalState.update('rootPath', item.folder.path);
    }
    vscode.window.showInformationMessage(t('Code Manager root set to the open folder.'));
  }
}

/* ---------------------------------------------------------------- activate */

/**
 * @param {object} context          extension context
 * @param {object} treeDataProvider FileTreeDataProvider instance (may be null)
 * @param {object} view             TreeView returned by createTreeView (may be null)
 */
function activate(context, treeDataProvider, view) {
  extensionContext = context || null;
  provider = treeDataProvider || null;
  treeView = view || null;

  const subscriptions = (context && context.subscriptions) || [];

  if (typeof vscode.window.createStatusBarItem === 'function') {
    const alignment =
      vscode.StatusBarAlignment && typeof vscode.StatusBarAlignment.Left === 'number'
        ? vscode.StatusBarAlignment.Left
        : 1;
    statusItem = vscode.window.createStatusBarItem(alignment, 100);
    if (statusItem) subscriptions.push(statusItem);
  }

  subscriptions.push(vscode.commands.registerCommand(SHOW_COMMAND, () => showCurrentFolder()));

  if (vscode.workspace && typeof vscode.workspace.onDidChangeWorkspaceFolders === 'function') {
    subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => update()));
  }

  update();
  return { update: update, listFolders: listFolders };
}

module.exports = {
  activate: activate,
  update: update,
  listFolders: listFolders,
  SHOW_COMMAND: SHOW_COMMAND,
};
