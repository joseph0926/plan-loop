/**
 * SessionTreeProvider
 * Provides data for the Plan Loop sessions tree view
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Session status type
type SessionStatus = 'drafting' | 'pending_review' | 'pending_revision' | 'approved' | 'exhausted';

// Session interface (simplified for tree view)
interface Session {
  id: string;
  goal: string;
  status: SessionStatus;
  version: number;
  iteration: number;
  maxIterations: number;
  createdAt: string;
  updatedAt: string;
}

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | null | void> =
    new vscode.EventEmitter<SessionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private sessionsDir: string;

  constructor() {
    this.sessionsDir = process.env.PLAN_LOOP_STATE_DIR ||
      path.join(os.homedir(), '.plan-loop', 'sessions');
  }

  getSessionsDir(): string {
    return this.sessionsDir;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionItem): Thenable<SessionItem[]> {
    if (element) {
      // Session details as children
      return Promise.resolve(this.getSessionDetails(element.session));
    }

    // Root level: list all sessions
    return Promise.resolve(this.getSessions());
  }

  private getSessions(): SessionItem[] {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(this.sessionsDir)
        .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));

      const sessions: SessionItem[] = files
        .map(file => {
          try {
            const content = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
            const session: Session = JSON.parse(content);
            return new SessionItem(session, vscode.TreeItemCollapsibleState.Collapsed);
          } catch {
            return null;
          }
        })
        .filter((s): s is SessionItem => s !== null)
        .sort((a, b) => {
          // Sort by updatedAt descending
          return new Date(b.session.updatedAt).getTime() - new Date(a.session.updatedAt).getTime();
        });

      return sessions;
    } catch {
      return [];
    }
  }

  private getSessionDetails(session: Session): SessionItem[] {
    const details: SessionItem[] = [];

    // Status
    details.push(new SessionItem(
      { ...session, _detailType: 'status', _detailValue: session.status } as any,
      vscode.TreeItemCollapsibleState.None,
      'detail'
    ));

    // Version / Iteration
    details.push(new SessionItem(
      { ...session, _detailType: 'progress', _detailValue: `v${session.version} | iter ${session.iteration}/${session.maxIterations}` } as any,
      vscode.TreeItemCollapsibleState.None,
      'detail'
    ));

    // Updated at
    const updatedAt = new Date(session.updatedAt).toLocaleString();
    details.push(new SessionItem(
      { ...session, _detailType: 'updated', _detailValue: updatedAt } as any,
      vscode.TreeItemCollapsibleState.None,
      'detail'
    ));

    return details;
  }

  getSession(sessionId: string): Session | null {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get full session data including plans and feedbacks
   */
  getFullSession(sessionId: string): unknown | null {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  deleteSession(sessionId: string): boolean {
    try {
      const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly session: Session & { _detailType?: string; _detailValue?: string },
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'session' | 'detail' = 'session'
  ) {
    super(
      itemType === 'session'
        ? truncateGoal(session.goal)
        : formatDetail(session._detailType!, session._detailValue!),
      collapsibleState
    );

    if (itemType === 'session') {
      this.contextValue = 'session';
      this.tooltip = `${session.goal}\n\nStatus: ${session.status}\nVersion: ${session.version}\nIteration: ${session.iteration}/${session.maxIterations}`;
      this.iconPath = getStatusIcon(session.status);
      this.description = session.status;
      // When clicked, select this session in the Plan Editor
      this.command = {
        command: 'planLoop.selectSession',
        title: 'Select Session',
        arguments: [this],
      };
    } else {
      this.contextValue = 'detail';
      this.iconPath = getDetailIcon(session._detailType!);
    }
  }
}

function truncateGoal(goal: string, maxLength = 40): string {
  if (goal.length <= maxLength) {
    return goal;
  }
  return goal.substring(0, maxLength - 3) + '...';
}

function formatDetail(type: string, value: string): string {
  switch (type) {
    case 'status':
      return `Status: ${value}`;
    case 'progress':
      return `Progress: ${value}`;
    case 'updated':
      return `Updated: ${value}`;
    default:
      return value;
  }
}

function getStatusIcon(status: SessionStatus): vscode.ThemeIcon {
  switch (status) {
    case 'drafting':
      return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.gray'));
    case 'pending_review':
      return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.blue'));
    case 'pending_revision':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    case 'approved':
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    case 'exhausted':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

function getDetailIcon(type: string): vscode.ThemeIcon {
  switch (type) {
    case 'status':
      return new vscode.ThemeIcon('symbol-status');
    case 'progress':
      return new vscode.ThemeIcon('milestone');
    case 'updated':
      return new vscode.ThemeIcon('calendar');
    default:
      return new vscode.ThemeIcon('info');
  }
}
