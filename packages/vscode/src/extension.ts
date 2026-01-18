/**
 * Plan Loop VSCode Extension
 * Provides a visual interface for managing Plan Loop sessions
 */

import * as vscode from 'vscode';
import { SessionTreeProvider } from './providers/SessionTreeProvider';
import { PlanEditorProvider } from './providers/PlanEditorProvider';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext) {
  console.log('Plan Loop extension is now active');

  // Create the tree provider
  const sessionTreeProvider = new SessionTreeProvider();

  // Create the plan editor provider
  const planEditorProvider = new PlanEditorProvider(context.extensionUri);

  // Register the tree view
  const treeView = vscode.window.createTreeView('planLoopSessions', {
    treeDataProvider: sessionTreeProvider,
    showCollapseAll: true,
  });

  // Register the plan editor webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PlanEditorProvider.viewType,
      planEditorProvider
    )
  );

  // Register commands
  registerCommands(context, sessionTreeProvider, planEditorProvider);

  // Add to subscriptions
  context.subscriptions.push(treeView);

  // Watch for session file changes
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(sessionTreeProvider.getSessionsDir()),
      '*.json'
    )
  );

  watcher.onDidCreate(() => {
    sessionTreeProvider.refresh();
    planEditorProvider.refresh();
  });
  watcher.onDidChange(() => {
    sessionTreeProvider.refresh();
    planEditorProvider.refresh();
  });
  watcher.onDidDelete(() => {
    sessionTreeProvider.refresh();
    // Clear editor if current session was deleted
    const currentId = planEditorProvider.getCurrentSessionId();
    if (currentId) {
      const session = sessionTreeProvider.getSession(currentId);
      if (!session) {
        planEditorProvider.clear();
      }
    }
  });

  context.subscriptions.push(watcher);
}

export function deactivate() {
  console.log('Plan Loop extension deactivated');
}
