/**
 * PlanEditorProvider
 * Provides a Webview for displaying and interacting with Plan Loop sessions
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewHtml } from '../webview/planEditor';
import { state, getStateDir, type Session, type Rating, type Feedback } from '@joseph0926/plan-loop-core';

// Re-export Session type for backwards compatibility with commands/index.ts
export type { Session } from '@joseph0926/plan-loop-core';

// Message types
type ExtToWebview =
  | { type: 'session'; data: Session | null }
  | { type: 'feedbackResult'; success: boolean; error?: string }
  | { type: 'copyResult'; requestId: string; success: boolean; error?: string };

type WebviewToExt =
  | { type: 'feedback'; rating: Rating; content: string }
  | { type: 'openInEditor' }
  | { type: 'copyToClipboard'; text: string; requestId: string };

export class PlanEditorProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'planLoopEditor';

  private _view?: vscode.WebviewView;
  private _currentSession?: Session;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
      case 'copyToClipboard':
        this._copyToClipboard(message.text, message.requestId);
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

      // Show notification with copy button for non-approved states
      const ratingLabel = rating === '🟢' ? 'Approved' : rating === '🟡' ? 'Minor revision requested' : 'Major revision requested';

      if (rating !== '🟢') {
        // For revision states, offer to copy the feedback check command
        const command = `pl_get_feedback(session_id: "${session.id}")`;
        const result = await vscode.window.showInformationMessage(
          `Plan Loop: ${ratingLabel}`,
          'Copy Command'
        );
        if (result === 'Copy Command') {
          try {
            await vscode.env.clipboard.writeText(command);
            vscode.window.showInformationMessage('명령어가 클립보드에 복사되었습니다');
          } catch {
            vscode.window.showWarningMessage('명령어 복사에 실패했습니다. 수동으로 복사해주세요.');
          }
        }
      } else {
        vscode.window.showInformationMessage(`Plan Loop: ${ratingLabel}`);
      }
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

  private async _copyToClipboard(text: string, requestId: string): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(text);
      this._sendCopyResult(requestId, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._sendCopyResult(requestId, false, errorMessage);
    }
  }

  private _sendCopyResult(requestId: string, success: boolean, error?: string): void {
    if (this._view) {
      const message: ExtToWebview = { type: 'copyResult', requestId, success, error };
      this._view.webview.postMessage(message);
    }
  }

  private async _openSessionInEditor(): Promise<void> {
    if (!this._currentSession) {
      return;
    }

    const filePath = path.join(getStateDir(), `${this._currentSession.id}.json`);
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open session file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private _loadSession(sessionId: string): Session | null {
    return state.load(sessionId);
  }

  private _saveSession(session: Session): void {
    state.save(session);
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
