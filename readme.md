# Code Manager

A VS Code extension that turns a plain folder of numbered scripts into a **runnable
command tree**. Each item is a file; the leading number gives the order, and markers in
the file name describe what the file *is* and which files it needs first.

This repository is the maintained fork of [`wf-soft/CodeManager`](https://github.com/wf-soft/CodeManager),
published as `wf-soft.wf-code-manager` on the VS Code Marketplace.

---

## What's new in 1.2.0 — the current workspace folder

Code Manager now always shows **which folder is open in VS Code right now**:

| Where | What you see |
| --- | --- |
| Tree view header | the folder name as the view `description` (`my-project`, or `my-project (+2)` for multi-root) |
| Status bar | `$(folder-opened) my-project` — click it to act on the folder |
| Command | **Code Manager: Show Current Workspace Folder** (`wf-code-manager.showCurrentFolder`) |

The command opens a picker of all open workspace folders; the second step lets you
**open it in a new window**, **copy the path**, or **use it as the Code Manager root**
(so the script tree follows the folder you are working in instead of a fixed path).
It is also reachable from the **More…** hub.

- no folder open → `no folder open` (with an *Open Folder…* action)
- single-root workspace → the folder name
- multi-root workspace → the first folder name plus `(+N)` for the rest

---

## Features

- **Runnable tree** — numbered scripts (`01_setup.js`, `02_build.ps1`, …) shown in order.
- **Enterprise Runner** — run a whole folder as a sequence, per-step validation,
  `report.json` / `summary.md`, checkpoints, resume after interruption, stop, rerun failures.
- **Markers in the file name** — `--info`, `--text`, `--cli`, `--rec`, `--depend=`, `--dep=`,
  `--after=`, `--needs=` and friends.
- **Drag & drop** tree with rename, duplicate, copy path, copy content, delete.
- **Command hub** — every command is reachable from one *More…* picker, so nothing is lost.
- **Localized** — English, Bulgarian and Simplified Chinese UI strings (`l10n/`).
- **Two bundles only** — `dist/extension.js` (tree + files + commands) and
  `dist/runner.js` (runner engine), plus the small `dist/current-folder.js` indicator.

## Requirements

- VS Code 1.80 or newer.
- Windows, macOS or Linux. The runner can use PowerShell, `cmd`, `bash` or any interpreter
  you point it at.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `wf-code-manager.rootPath` | `""` | Root folder of the script tree. Empty = the open workspace folder. |

Use **Code Manager: Set Directory** or **Show Current Workspace Folder → Use as Code Manager
Root** to change it.

## Keyboard shortcuts

Nothing is bound by default; assign shortcuts to any `wf-code-manager.*` command through
*Keyboard Shortcuts*. The three toolbar buttons are **Run Folder**, **Preview Plan** and
**Stop Current Run**.

## Development

The published extension is plain JavaScript — no build step is required to run it.

```bash
git clone https://github.com/PasevSU/CodeManager.git
cd CodeManager
node test/all.js        # runs both suites (add an iteration count: node test/all.js 3)
node test/runner.test.js
node test/bundle.test.js
```

`test/bundle.test.js` loads `dist/extension.js` against a mocked `vscode` module and
asserts that activation registers the tree view, the drag & drop provider and every
command. `test/runner.test.js` is a static + behavioural analysis of the manifest and the
runner engine (plan building, dependency ordering, report writing, icon/menu consistency).

To produce an installable package:

```bash
npx @vscode/vsce package
code --install-extension wf-code-manager-1.2.0.vsix
```

## Repository layout

```
dist/            extension.js · runner.js · current-folder.js
l10n/            bundle.l10n.bg.json · bundle.l10n.zh-cn.json
images/          logo and previews (dark/light variants)
test/            all.js · runner.test.js · bundle.test.js
package.nls.json UI strings for package.json (en, zh-cn)
```

## Credits & license

Originally created by [wf-soft](https://github.com/wf-soft/CodeManager). This fork keeps the
same publisher id, command ids and settings so it can be installed over the original.
MIT — see [LICENSE.txt](LICENSE.txt).

---

# Code Manager (Български)

Разширение за VS Code, което превръща папка с номерирани скриптове в **дърво от команди**:
водещото число дава реда, а маркерите в името на файла описват какво е файлът и от какво
зависи.

## Какво е ново в 1.2.0

Code Manager вече показва **коя папка е отворена в момента в VS Code**:

- в заглавието на дървото (до името на изгледа) — `моя-проект` или `моя-проект (+2)`
  при няколко отворени папки;
- в лентата за състояние — `$(folder-opened) моя-проект`, с клик се отваря меню;
- с командата **Code Manager: Show Current Workspace Folder**
  (`wf-code-manager.showCurrentFolder`) — достъпна и през хаба **More…**.

Командата показва списък с всички отворени папки, а след избор предлага:
**отваряне в нов прозорец**, **копиране на пътя** или **използване като корен на Code
Manager** (така дървото следва папката, в която работите).

## Инсталиране от изходния код

```powershell
git clone https://github.com/PasevSU/CodeManager.git
cd CodeManager
node test/all.js                     # тестове (91 + 15)
npx @vscode/vsce package             # създава wf-code-manager-1.2.0.vsix
code --install-extension wf-code-manager-1.2.0.vsix
```

## Настройки

| Настройка | По подразбиране | Значение |
| --- | --- | --- |
| `wf-code-manager.rootPath` | `""` | Коренна папка на дървото. Празно = отворената папка в VS Code. |

Лиценз: MIT. Оригинал: [wf-soft/CodeManager](https://github.com/wf-soft/CodeManager).
