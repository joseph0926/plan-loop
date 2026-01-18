/**
 * Plan Editor Webview
 * Generates HTML for the Plan Editor webview
 */

import * as vscode from 'vscode';

// Session types (duplicated to avoid circular imports)
type SessionStatus = 'drafting' | 'pending_review' | 'pending_revision' | 'approved' | 'exhausted';

interface Plan {
  version: number;
  content: string;
  submittedAt: string;
}

interface Feedback {
  planVersion: number;
  rating: string;
  content: string;
  submittedAt: string;
}

interface Session {
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

/**
 * Generate nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Get status label
 */
function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'drafting': return 'DRAFTING';
    case 'pending_review': return 'REVIEW';
    case 'pending_revision': return 'REVISION';
    case 'approved': return 'APPROVED';
    case 'exhausted': return 'EXHAUSTED';
    default: return status.toUpperCase();
  }
}

/**
 * Format relative time
 */
function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Simple markdown to HTML converter (basic formatting only)
 */
function simpleMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).trim();
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (simple: convert double newlines)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

/**
 * Get CSS styles
 */
function getStyles(): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
      line-height: 1.5;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .empty-state-text {
      font-size: 13px;
    }

    /* Header */
    .session-header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .session-goal {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      word-break: break-word;
    }

    .session-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-editor-background);
    }
    .status-badge.status-drafting { background: var(--vscode-charts-gray); }
    .status-badge.status-pending_review { background: var(--vscode-charts-blue); }
    .status-badge.status-pending_revision { background: var(--vscode-charts-yellow); }
    .status-badge.status-approved { background: var(--vscode-charts-green); }
    .status-badge.status-exhausted { background: var(--vscode-charts-red); }

    /* Plan view */
    .plan-section {
      margin-bottom: 16px;
    }

    .plan-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .plan-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }

    .open-editor-btn {
      background: none;
      border: none;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .open-editor-btn:hover {
      text-decoration: underline;
    }

    .plan-content {
      max-height: 300px;
      overflow-y: auto;
      padding: 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      font-size: 12px;
    }

    .plan-content h2, .plan-content h3, .plan-content h4 {
      margin: 12px 0 8px 0;
    }

    .plan-content h2:first-child, .plan-content h3:first-child, .plan-content h4:first-child {
      margin-top: 0;
    }

    .plan-content ul, .plan-content ol {
      padding-left: 20px;
      margin: 8px 0;
    }

    .plan-content li {
      margin: 4px 0;
    }

    .plan-content pre {
      background: var(--vscode-textBlockQuote-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .plan-content code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }

    .plan-content p {
      margin: 8px 0;
    }

    /* Feedback panel */
    .feedback-panel {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
    }

    .feedback-panel.disabled {
      opacity: 0.5;
      pointer-events: none;
    }

    .feedback-label {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-descriptionForeground);
    }

    .rating-buttons {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .rating-btn {
      flex: 1;
      padding: 8px 4px;
      border: 2px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }

    .rating-btn:hover {
      border-color: var(--vscode-focusBorder);
    }

    .rating-btn.selected {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .rating-btn .emoji {
      font-size: 20px;
    }

    .rating-btn .label {
      font-size: 10px;
      font-weight: 600;
    }

    .rating-btn .shortcut {
      font-size: 9px;
      opacity: 0.7;
    }

    .feedback-textarea {
      width: 100%;
      min-height: 80px;
      padding: 8px;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 12px;
      resize: vertical;
      margin-bottom: 12px;
    }

    .feedback-textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .submit-btn {
      width: 100%;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s ease;
    }

    .submit-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .submit-btn.loading {
      opacity: 0.7;
    }

    /* Status messages */
    .status-message {
      text-align: center;
      padding: 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .status-message.awaiting {
      background: var(--vscode-editorInfo-background);
      border-radius: 4px;
    }

    .status-message.approved {
      background: var(--vscode-editorHint-background);
      border-radius: 4px;
      color: var(--vscode-charts-green);
    }

    .status-message.exhausted {
      background: var(--vscode-editorError-background);
      border-radius: 4px;
      color: var(--vscode-charts-red);
    }

    /* Error message */
    .error-message {
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .is-hidden {
      display: none;
    }
  `;
}

/**
 * Get JavaScript for webview
 */
function getScript(nonce: string): string {
  return `
    (function() {
      const vscode = acquireVsCodeApi();

      let selectedRating = null;
      let isSubmitting = false;

      // Elements
      const ratingBtns = document.querySelectorAll('.rating-btn');
      const textarea = document.getElementById('feedback-content');
      const submitBtn = document.getElementById('submit-btn');
      const errorEl = document.getElementById('error-message');

      // Rating button click handlers
      ratingBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (isSubmitting) return;

          ratingBtns.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          selectedRating = btn.dataset.rating;
          updateSubmitButton();
        });
      });

      // Keyboard shortcuts (1, 2, 3)
      document.addEventListener('keydown', (e) => {
        if (isSubmitting) return;
        if (e.target.tagName === 'TEXTAREA') return;

        const key = e.key;
        if (key === '1' || key === '2' || key === '3') {
          const ratings = ['🔴', '🟡', '🟢'];
          const rating = ratings[parseInt(key) - 1];
          const btn = document.querySelector(\`.rating-btn[data-rating="\${rating}"]\`);
          if (btn) {
            btn.click();
          }
        }
      });

      // Submit button click
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          if (!selectedRating || isSubmitting) return;

          isSubmitting = true;
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
          submitBtn.classList.add('loading');
          hideError();

          vscode.postMessage({
            type: 'feedback',
            rating: selectedRating,
            content: textarea ? textarea.value : ''
          });
        });
      }

      // Open in editor button
      const openEditorBtn = document.getElementById('open-editor-btn');
      if (openEditorBtn) {
        openEditorBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'openInEditor' });
        });
      }

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const message = event.data;

        if (message.type === 'feedbackResult') {
          isSubmitting = false;

          if (message.success) {
            // Success - page will be refreshed by extension
          } else {
            // Error
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit Feedback';
              submitBtn.classList.remove('loading');
            }
            showError(message.error || 'Failed to submit feedback');
          }
        }
      });

      function updateSubmitButton() {
        if (submitBtn) {
          submitBtn.disabled = !selectedRating || isSubmitting;
        }
      }

      function showError(message) {
        if (errorEl) {
          errorEl.textContent = message;
          errorEl.classList.remove('is-hidden');
        }
      }

      function hideError() {
        if (errorEl) {
          errorEl.classList.add('is-hidden');
        }
      }

      // Initialize
      updateSubmitButton();
    })();
  `;
}

/**
 * Generate empty state HTML
 */
function getEmptyStateHtml(): string {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-text">Select a session from the tree view</div>
    </div>
  `;
}

/**
 * Generate session HTML
 */
function getSessionHtml(session: Session): string {
  const latestPlan = session.plans[session.plans.length - 1];
  const latestFeedback = session.feedbacks[session.feedbacks.length - 1];
  const statusLabel = getStatusLabel(session.status);
  const relativeTime = getRelativeTime(session.updatedAt);

  // Header
  const headerHtml = `
    <div class="session-header">
      <div class="session-goal">${escapeHtml(session.goal)}</div>
      <div class="session-meta">
        <span class="status-badge status-${session.status}">${statusLabel}</span>
        <span>v${session.version}</span>
        <span>iter ${session.iteration}/${session.maxIterations}</span>
        <span>Updated: ${relativeTime}</span>
      </div>
    </div>
  `;

  // Plan section
  let planHtml = '';
  if (latestPlan) {
    const planContent = simpleMarkdown(latestPlan.content);
    planHtml = `
      <div class="plan-section">
        <div class="plan-header">
          <span class="plan-title">Latest Plan (v${latestPlan.version})</span>
          <button class="open-editor-btn" id="open-editor-btn">📝 Open in Editor</button>
        </div>
        <div class="plan-content">${planContent}</div>
      </div>
    `;
  } else {
    planHtml = `
      <div class="status-message awaiting">
        No plan submitted yet. Waiting for plan...
      </div>
    `;
  }

  // Feedback panel based on status
  let feedbackHtml = '';

  if (session.status === 'pending_review') {
    feedbackHtml = `
      <div class="feedback-panel">
        <div class="feedback-label">Rate this plan:</div>
        <div class="rating-buttons">
          <button class="rating-btn" data-rating="🔴">
            <span class="emoji">🔴</span>
            <span class="label">Major</span>
            <span class="shortcut">Press 1</span>
          </button>
          <button class="rating-btn" data-rating="🟡">
            <span class="emoji">🟡</span>
            <span class="label">Minor</span>
            <span class="shortcut">Press 2</span>
          </button>
          <button class="rating-btn" data-rating="🟢">
            <span class="emoji">🟢</span>
            <span class="label">LGTM</span>
            <span class="shortcut">Press 3</span>
          </button>
        </div>
        <textarea
          class="feedback-textarea"
          id="feedback-content"
          placeholder="Add your feedback comment (optional). Leave blank to auto-generate."
          maxlength="1000"
        ></textarea>
        <div class="error-message is-hidden" id="error-message"></div>
        <button class="submit-btn" id="submit-btn" disabled>Submit Feedback</button>
      </div>
    `;
  } else if (session.status === 'pending_revision') {
    const lastFeedbackSummary = latestFeedback
      ? `${latestFeedback.rating} ${latestFeedback.content.substring(0, 100)}...`
      : '';
    feedbackHtml = `
      <div class="status-message awaiting">
        Awaiting revised plan...<br>
        <small>Last feedback: ${escapeHtml(lastFeedbackSummary)}</small>
      </div>
    `;
  } else if (session.status === 'approved') {
    feedbackHtml = `
      <div class="status-message approved">
        ✅ Plan approved!
      </div>
    `;
  } else if (session.status === 'exhausted') {
    feedbackHtml = `
      <div class="status-message exhausted">
        ⚠️ Max iterations reached
      </div>
    `;
  } else if (session.status === 'drafting') {
    feedbackHtml = `
      <div class="status-message awaiting">
        Waiting for initial plan submission...
      </div>
    `;
  }

  return headerHtml + planHtml + feedbackHtml;
}

/**
 * Get full webview HTML
 */
export function getWebviewHtml(webview: vscode.Webview, session: Session | null): string {
  const nonce = getNonce();
  const bodyContent = session ? getSessionHtml(session) : getEmptyStateHtml();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">${getStyles()}</style>
  <title>Plan Editor</title>
</head>
<body>
  ${bodyContent}
  <script nonce="${nonce}">${getScript(nonce)}</script>
</body>
</html>`;
}
