# Changelog

## 1.2.0

### Added

- **Current workspace folder indicator.** Code Manager now shows which folder is open in
  VS Code:
  - the tree view header (`description`) shows the open folder name — `my-project`,
    or `my-project (+2)` for a multi-root workspace, `no folder open` when there is none;
  - a status bar item `$(folder-opened) <name>` that stays visible while the extension is
    active and updates itself on `onDidChangeWorkspaceFolders`;
  - the new command **Show Current Workspace Folder**
    (`wf-code-manager.showCurrentFolder`), also listed in the **More…** hub. From the picker
    you can open the folder in a new window, copy its path, or make it the Code Manager root.
- Bulgarian localization for all of the above (`l10n/bundle.l10n.bg.json`).
- `homepage` / `bugs` / `repository` metadata pointing at `github.com/PasevSU/CodeManager`.
- Minimum engine raised to VS Code `^1.80.0`.

### Changed

- `dist/current-folder.js` added and activated from `dist/extension.js`; activation is
  wrapped in `try/catch` so a host without the status bar / tree-view API keeps working.
- Every optional API (`createStatusBarItem`, `onDidChangeWorkspaceFolders`, `l10n.t`) is
  feature-detected — the extension stays compatible with the mocked test harness.

### Toolbar

The view toolbar remains exactly three buttons: **Run Folder**, **Preview Plan**,
**Stop Current Run**. The folder indicator lives in the header and the status bar, not as a
fourth toolbar icon.

## 1.0.0 – 1.1.2

- Command tree with numbered, marker-driven script files.
- Enterprise Runner: sequence execution, reports (`report.json`, `summary.md`),
  checkpoints, resume, stop, rerun failed.
- Drag & drop tree, rename / duplicate / delete, copy path / content.
- Command hub (**More…**) covering every command.
- English and Simplified Chinese localization.
