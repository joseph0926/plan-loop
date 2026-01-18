/**
 * Plan Loop VSCode Extension
 * Provides a visual interface for managing Plan Loop sessions
 */

import * as vscode from 'vscode';
import { SessionTreeProvider } from './providers/SessionTreeProvider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  console.log('Plan Loop extension is now active');

  // Create the tree provider
  const sessionTreeProvider = new SessionTreeProvider();

  // Register the tree view
  const treeView = vscode.window.createTreeView('planLoopSessions', {
    treeDataProvider: sessionTreeProvider,
    showCollapseAll: true,
  });

  // Register commands
  registerCommands(context, sessionTreeProvider);

  // Add to subscriptions
  context.subscriptions.push(treeView);

  // Watch for session file changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(sessionTreeProvider.getSessionsDir()),
      '*.json'
    )
  );

  watcher.onDidCreate(() => sessionTreeProvider.refresh());
  watcher.onDidChange(() => sessionTreeProvider.refresh());
  watcher.onDidDelete(() => sessionTreeProvider.refresh());

  context.subscriptions.push(watcher);
}

export function deactivate() {
  console.log('Plan Loop extension deactivated');
}
