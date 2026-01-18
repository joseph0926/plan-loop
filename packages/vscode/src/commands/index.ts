/**
 * Plan Loop Commands
 * Register all extension commands
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { SessionTreeProvider, SessionItem } from '../providers/SessionTreeProvider';

export function registerCommands(
  context: vscode.ExtensionContext,
  sessionTreeProvider: SessionTreeProvider
): void {
  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('planLoop.refresh', () => {
      sessionTreeProvider.refresh();
      vscode.window.showInformationMessage('Plan Loop: Sessions refreshed');
    })
  );

  // New session command
  context.subscriptions.push(
    vscode.commands.registerCommand('planLoop.newSession', async () => {
      const goal = await vscode.window.showInputBox({
        prompt: 'Enter the goal for this planning session',
        placeHolder: 'e.g., Implement user authentication',
        validateInput: (value) => {
          if (!value || value.trim() === '') {
            return 'Goal is required';
          }
          return null;
        },
      });

      if (!goal) {
        return; // User cancelled
      }

      try {
        const session = createSession(goal.trim());
        sessionTreeProvider.refresh();
        vscode.window.showInformationMessage(
          `Plan Loop: Session created - ${truncate(goal, 30)}`
        );

        // Copy session ID to clipboard
        await vscode.env.clipboard.writeText(session.id);
        vscode.window.showInformationMessage(
          'Session ID copied to clipboard'
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // View session command
  context.subscriptions.push(
    vscode.commands.registerCommand('planLoop.viewSession', async (item: SessionItem) => {
      if (!item || item.itemType !== 'session') {
        return;
      }

      const session = sessionTreeProvider.getSession(item.session.id);
      if (!session) {
        vscode.window.showErrorMessage('Session not found');
        return;
      }

      // Show session details in a quick pick or webview
      const details = [
        `ID: ${session.id}`,
        `Goal: ${session.goal}`,
        `Status: ${session.status}`,
        `Version: ${session.version}`,
        `Iteration: ${session.iteration}/${session.maxIterations}`,
        `Created: ${new Date(session.createdAt).toLocaleString()}`,
        `Updated: ${new Date(session.updatedAt).toLocaleString()}`,
      ];

      const action = await vscode.window.showQuickPick(
        [
          { label: '$(copy) Copy Session ID', action: 'copy' },
          { label: '$(file) Open Session File', action: 'open' },
          { label: '$(trash) Delete Session', action: 'delete' },
        ],
        {
          title: `Session: ${truncate(session.goal, 40)}`,
          placeHolder: details.join(' | '),
        }
      );

      if (!action) {
        return;
      }

      switch (action.action) {
        case 'copy':
          await vscode.env.clipboard.writeText(session.id);
          vscode.window.showInformationMessage('Session ID copied to clipboard');
          break;
        case 'open':
          const sessionsDir = sessionTreeProvider.getSessionsDir();
          const filePath = path.join(sessionsDir, `${session.id}.json`);
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
          break;
        case 'delete':
          await deleteSessionWithConfirm(item, sessionTreeProvider);
          break;
      }
    })
  );

  // Delete session command
  context.subscriptions.push(
    vscode.commands.registerCommand('planLoop.deleteSession', async (item: SessionItem) => {
      await deleteSessionWithConfirm(item, sessionTreeProvider);
    })
  );
}

async function deleteSessionWithConfirm(
  item: SessionItem,
  sessionTreeProvider: SessionTreeProvider
): Promise<void> {
  if (!item || item.itemType !== 'session') {
    return;
  }

  const session = item.session;
  const safeStates = ['approved', 'exhausted'];

  if (!safeStates.includes(session.status)) {
    const confirm = await vscode.window.showWarningMessage(
      `This session is still active (${session.status}). Are you sure you want to delete it?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }
  }

  const deleted = sessionTreeProvider.deleteSession(session.id);
  if (deleted) {
    vscode.window.showInformationMessage(`Session deleted: ${truncate(session.goal, 30)}`);
  } else {
    vscode.window.showErrorMessage('Failed to delete session');
  }
}

// Helper function to create a session (consistent with core package)
function createSession(goal: string): { id: string; goal: string } {
  const sessionsDir = process.env.PLAN_LOOP_STATE_DIR ||
    path.join(os.homedir(), '.plan-loop', 'sessions');

  // Ensure directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // Use crypto.randomUUID() for consistency with core package
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const session = {
    id,
    goal,
    status: 'drafting',
    version: 0,
    iteration: 0,
    maxIterations: 5,
    plans: [],
    feedbacks: [],
    createdAt: now,
    updatedAt: now,
  };

  // Atomic write: temp file + rename (consistent with core package)
  const filePath = path.join(sessionsDir, `${id}.json`);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2));
  fs.renameSync(tempPath, filePath);

  return { id, goal };
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}
