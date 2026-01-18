/**
 * PlanEditorProvider
 * Provides a Webview for displaying and interacting with Plan Loop sessions
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWebviewHtml } from '../webview/planEditor';

// Session types
type SessionStatus = 'drafting' | 'pending_review' | 'pending_revision' | 'approved' | 'exhausted';
type Rating = '🔴' | '🟡' | '🟢';

interface Plan {
  version: number;
  content: string;
  submittedAt: string;
}

interface Feedback {
  planVersion: number;
  rating: Rating;
  content: string;
  submittedAt: string;
}

export interface Session {
  id: string;
  goal: string;
  status: SessionStatus;
  version: number;
  iteration: number;
  maxIterations: number;
  plans: Plan[];
  feedbacks: Feedback[];
  createdAt: string;
  updatedAt: string;
}

// Message types
type ExtToWebview =
  | { type: 'session'; data: Session | null }
  | { type: 'feedbackResult'; success: boolean; error?: string };

type WebviewToExt =
  | { type: 'feedback'; rating: Rating; content: string }
  | { type: 'openInEditor' };

export class PlanEditorProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'planLoopEditor';

  private _view?: vscode.WebviewView;
  private _currentSession?: Session;
  private _sessionsDir: string;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._sessionsDir = process.env.PLAN_LOOP_STATE_DIR ||
      path.join(os.homedir(), '.plan-loop', 'sessions');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, null);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message: WebviewToExt) => {
      this._handleMessage(message);
    });
  }

  /**
   * Show a session in the editor
   */
  public showSession(session: Session): void {
    this._currentSession = session;

    if (this._view) {
      this._view.webview.html = getWebviewHtml(this._view.webview, session);
    }
  }

  /**
   * Refresh the current session from disk
   */
  public refresh(): void {
    if (this._currentSession) {
      const session = this._loadSession(this._currentSession.id);
      if (session) {
        this.showSession(session);
      }
    }
  }

  /**
   * Clear the editor
   */
  public clear(): void {
    this._currentSession = undefined;
    if (this._view) {
      this._view.webview.html = getWebviewHtml(this._view.webview, null);
    }
  }

  /**
   * Get the current session ID
   */
  public getCurrentSessionId(): string | undefined {
    return this._currentSession?.id;
  }

  private _handleMessage(message: WebviewToExt): void {
    switch (message.type) {
      case 'feedback':
        this._submitFeedback(message.rating, message.content);
        break;
      case 'openInEditor':
        this._openSessionInEditor();
        break;
    }
  }

  private async _submitFeedback(rating: Rating, content: string): Promise<void> {
    if (!this._currentSession) {
      this._sendFeedbackResult(false, 'No session selected');
      return;
    }

    const validRatings: Rating[] = ['🔴', '🟡', '🟢'];
    if (!validRatings.includes(rating)) {
      this._sendFeedbackResult(false, 'Invalid rating');
      return;
    }

    // Only allow feedback on pending_review status
    if (this._currentSession.status !== 'pending_review') {
      this._sendFeedbackResult(false, 'Session is not pending review');
      return;
    }

    try {
      // Load fresh session data
      const session = this._loadSession(this._currentSession.id);
      if (!session) {
        this._sendFeedbackResult(false, 'Session not found');
        return;
      }

      // Get latest plan version
      const latestPlan = session.plans[session.plans.length - 1];
      if (!latestPlan) {
        this._sendFeedbackResult(false, 'No plan to review');
        return;
      }

      const trimmedContent = (content ?? '').trim();
      const finalContent = trimmedContent.length > 0 ? trimmedContent : this._getAutoFeedback(rating);

      // Create feedback
      const feedback: Feedback = {
        planVersion: latestPlan.version,
        rating,
        content: finalContent,
        submittedAt: new Date().toISOString(),
      };

      // Update session
      session.feedbacks.push(feedback);
      session.updatedAt = new Date().toISOString();

      // Update status based on rating
      if (rating === '🟢') {
        session.status = 'approved';
      } else {
        session.status = 'pending_revision';
        session.iteration += 1;

        // Check if max iterations reached
        if (session.iteration >= session.maxIterations) {
          session.status = 'exhausted';
        }
      }

      // Save session (atomic write)
      this._saveSession(session);

      // Update UI
      this._currentSession = session;
      this.showSession(session);

      // Send success result
      this._sendFeedbackResult(true);

      // Show notification
      const ratingLabel = rating === '🟢' ? 'Approved' : rating === '🟡' ? 'Minor revision requested' : 'Major revision requested';
      vscode.window.showInformationMessage(`Plan Loop: ${ratingLabel}`);
    } catch (error) {
      this._sendFeedbackResult(false, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private _sendFeedbackResult(success: boolean, error?: string): void {
    if (this._view) {
      const message: ExtToWebview = { type: 'feedbackResult', success, error };
      this._view.webview.postMessage(message);
    }
  }

  private async _openSessionInEditor(): Promise<void> {
    if (!this._currentSession) {
      return;
    }

    const filePath = path.join(this._sessionsDir, `${this._currentSession.id}.json`);
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open session file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private _loadSession(sessionId: string): Session | null {
    try {
      const filePath = path.join(this._sessionsDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private _saveSession(session: Session): void {
    const filePath = path.join(this._sessionsDir, `${session.id}.json`);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(session, null, 2));
    fs.renameSync(tempPath, filePath);
  }

  private _getAutoFeedback(rating: Rating): string {
    switch (rating) {
      case '🟢':
        return 'Auto-generated by Codex: LGTM (no additional comments).';
      case '🟡':
        return 'Auto-generated by Codex: Minor revisions requested.';
      case '🔴':
      default:
        return 'Auto-generated by Codex: Major revisions requested.';
    }
  }
}
