/**
 * SessionTreeProvider
 * Provides data for the Plan Loop sessions tree view
 */

import * as vscode from 'vscode';
import { state, getStateDir, listFull, type Session, type SessionStatus } from '@joseph0926/plan-loop-core';

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SessionItem | undefined | null | void> =
    new vscode.EventEmitter<SessionItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SessionItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor() {}

  getSessionsDir(): string {
    return getStateDir();
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
    // Use listFull() to get full sessions in one pass (no double file reads)
    // listFull() doesn't create directory if not exists (unlike state.list())
    const sessions = listFull({ sort: 'updatedAt', order: 'desc' });
    return sessions.map(session => new SessionItem(session, vscode.TreeItemCollapsibleState.Collapsed));
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
    return state.load(sessionId);
  }

  /**
   * Get full session data including plans and feedbacks
   */
  getFullSession(sessionId: string): Session | null {
    return state.load(sessionId);
  }

  deleteSession(sessionId: string): boolean {
    const deleted = state.remove(sessionId);
    if (deleted) {
      this.refresh();
    }
    return deleted;
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
