/**
 * GoalEditorPanel
 * Webview-based multiline Goal Editor with draft persistence
 */

import * as vscode from 'vscode';

// ============================================================================
// Types
// ============================================================================

export interface GoalEditorResult {
  goal: string;
  maxIterations: number;
}

export type GoalEditorOutcome =
  | { status: 'submitted'; data: GoalEditorResult }
  | { status: 'cancelled' }
  | { status: 'already_open' };

interface DraftData {
  goal: string;
  maxIterations: number;
  savedAt: string;
}

// Webview → Extension messages
type WebviewToExt =
  | { type: 'updateDraft'; goal: string; maxIterations: number }
  | { type: 'submit'; goal: string; maxIterations: number }
  | { type: 'cancel' }
  | { type: 'ready' };

// Extension → Webview messages
type ExtToWebview =
  | { type: 'loadDraft'; goal: string; maxIterations: number; defaultMaxIterations: number }
  | { type: 'validationError'; message: string };

// ============================================================================
// Constants
// ============================================================================

const DRAFT_KEY = 'planLoop.goalEditor.draft';
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 50;

// ============================================================================
// Singleton State
// ============================================================================

let currentPanel: vscode.WebviewPanel | undefined;

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultMaxIterations(): number {
  return vscode.workspace
    .getConfiguration('planLoop')
    .get<number>('goalEditor.defaultMaxIterations', 5);
}

function clampIterations(value: unknown): number {
  const defaultVal = getDefaultMaxIterations();
  if (typeof value !== 'number' || isNaN(value)) return defaultVal;
  return Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, Math.round(value)));
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// ============================================================================
// Main Function
// ============================================================================

export async function showGoalEditor(
  context: vscode.ExtensionContext
): Promise<GoalEditorOutcome> {
  // Singleton: 이미 열려있으면 포커스 + 명시적 반환
  if (currentPanel) {
    currentPanel.reveal();
    vscode.window.showInformationMessage('Goal Editor is already open');
    return { status: 'already_open' };
  }

  // Panel 생성
  const panel = vscode.window.createWebviewPanel(
    'goalEditor',
    'New Plan Loop Session',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel = panel;

  // Webview HTML 설정
  const nonce = getNonce();
  panel.webview.html = getWebviewHtml(panel.webview, nonce);

  // 상태 관리
  let isResolved = false;
  let pendingDraft: DraftData | null = null;

  return new Promise<GoalEditorOutcome>((resolve) => {
    // Draft flush 헬퍼
    function flushDraft() {
      if (pendingDraft) {
        context.workspaceState.update(DRAFT_KEY, pendingDraft);
        pendingDraft = null;
      }
    }

    // 제출 처리
    function handleSubmit(goal: string, maxIterations: number) {
      if (isResolved) return;

      const trimmedGoal = goal?.trim() ?? '';
      const clampedIter = clampIterations(maxIterations);

      // Extension 측 검증
      if (trimmedGoal.length === 0) {
        const msg: ExtToWebview = {
          type: 'validationError',
          message: 'Goal is required',
        };
        panel.webview.postMessage(msg);
        return;
      }

      isResolved = true;
      context.workspaceState.update(DRAFT_KEY, undefined); // draft 삭제
      resolve({
        status: 'submitted',
        data: { goal: trimmedGoal, maxIterations: clampedIter },
      });
      panel.dispose();
    }

    // 취소 처리 (cancel 메시지용)
    function handleCancel() {
      if (isResolved) return;
      isResolved = true;
      flushDraft();
      resolve({ status: 'cancelled' });
      panel.dispose();
    }

    // 메시지 핸들러
    panel.webview.onDidReceiveMessage((msg: WebviewToExt) => {
      switch (msg.type) {
        case 'ready': {
          const draft = context.workspaceState.get<DraftData>(DRAFT_KEY);
          const defaultMax = getDefaultMaxIterations();
          // draft 값도 clamp 적용하여 전달 (이전에 범위 밖 값이 저장되었을 수 있음)
          const draftMaxIter = draft?.maxIterations ?? defaultMax;
          const clampedDraftMaxIter = Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, draftMaxIter));
          const loadMsg: ExtToWebview = {
            type: 'loadDraft',
            goal: draft?.goal ?? '',
            maxIterations: clampedDraftMaxIter,
            defaultMaxIterations: defaultMax,  // 설정값 별도 전달
          };
          panel.webview.postMessage(loadMsg);
          break;
        }
        case 'updateDraft': {
          // Extension 측에서 clamp 적용하여 저장
          const clampedMaxIter = clampIterations(msg.maxIterations);
          pendingDraft = {
            goal: msg.goal,
            maxIterations: clampedMaxIter,
            savedAt: new Date().toISOString(),
          };
          context.workspaceState.update(DRAFT_KEY, pendingDraft);
          break;
        }
        case 'submit': {
          handleSubmit(msg.goal, msg.maxIterations);
          break;
        }
        case 'cancel': {
          handleCancel();
          break;
        }
      }
    });

    // X 버튼/외부 dispose 처리
    panel.onDidDispose(() => {
      currentPanel = undefined;
      if (!isResolved) {
        isResolved = true;
        flushDraft();
        resolve({ status: 'cancelled' });
      }
    });
  });
}

// ============================================================================
// Webview HTML
// ============================================================================

function getWebviewHtml(webview: vscode.Webview, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>New Plan Loop Session</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      max-width: 600px;
      margin: 0 auto;
      width: 100%;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 24px;
      color: var(--vscode-foreground);
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--vscode-foreground);
    }

    label .required {
      color: var(--vscode-errorForeground);
    }

    textarea {
      width: 100%;
      min-height: 150px;
      padding: 10px 12px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      resize: vertical;
      line-height: 1.5;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    input[type="number"] {
      width: 100px;
      padding: 8px 12px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
    }

    input[type="number"]:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .error-message {
      font-size: 12px;
      color: var(--vscode-errorForeground);
      margin-top: 6px;
      display: none;
    }

    .error-message.visible {
      display: block;
    }

    .button-group {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }

    button {
      padding: 8px 16px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      border-radius: 4px;
      cursor: pointer;
      transition: opacity 0.15s ease;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: none;
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: none;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }

    .shortcut-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
      margin-top: 8px;
    }

    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border);
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>New Plan Loop Session</h1>

    <div class="form-group">
      <label for="goal">Goal <span class="required">*</span></label>
      <textarea
        id="goal"
        placeholder="예: 사용자 인증 기능 구현&#10;- OAuth 2.0 지원&#10;- JWT 토큰 관리"
        autofocus
      ></textarea>
      <div id="goalError" class="error-message">Goal is required</div>
    </div>

    <div class="form-group">
      <label for="maxIterations">Max Iterations</label>
      <input type="number" id="maxIterations" min="1" max="50" value="5">
      <div class="hint">1-50, 기본값은 설정에서 변경 가능</div>
    </div>

    <div class="button-group">
      <button type="button" class="btn-secondary" id="cancelBtn">Cancel</button>
      <button type="button" class="btn-primary" id="submitBtn" disabled>Create</button>
    </div>

    <div class="shortcut-hint">
      <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to create, <kbd>Esc</kbd> to cancel
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      // Elements
      const goalTextarea = document.getElementById('goal');
      const maxIterationsInput = document.getElementById('maxIterations');
      const submitBtn = document.getElementById('submitBtn');
      const cancelBtn = document.getElementById('cancelBtn');
      const goalError = document.getElementById('goalError');

      // State
      let debounceTimer = null;
      let defaultMaxIterations = 5;  // loadDraft에서 설정값으로 업데이트됨

      // Validation
      function validateGoal() {
        const isValid = goalTextarea.value.trim().length > 0;
        submitBtn.disabled = !isValid;
        goalError.classList.toggle('visible', !isValid && goalTextarea.value.length > 0);
        return isValid;
      }

      // Get maxIterations value (without clamping UI)
      function getMaxIterations() {
        const value = parseInt(maxIterationsInput.value, 10);
        return isNaN(value) ? defaultMaxIterations : value;
      }

      // Clamp maxIterations (updates UI)
      function clampMaxIterations() {
        let value = getMaxIterations();
        value = Math.max(1, Math.min(50, value));
        maxIterationsInput.value = value;
        return value;
      }

      // Send draft update (debounced) - 저장 시에는 clamp 없이 현재 값 사용
      function sendDraftUpdate() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          vscode.postMessage({
            type: 'updateDraft',
            goal: goalTextarea.value,
            maxIterations: getMaxIterations()
          });
        }, 300);
      }

      // Flush draft immediately (cancel 직전 호출용)
      function flushDraft() {
        if (debounceTimer) clearTimeout(debounceTimer);
        vscode.postMessage({
          type: 'updateDraft',
          goal: goalTextarea.value,
          maxIterations: getMaxIterations()
        });
      }

      // Submit
      function submit() {
        if (!validateGoal()) return;
        vscode.postMessage({
          type: 'submit',
          goal: goalTextarea.value,
          maxIterations: clampMaxIterations()
        });
      }

      // Cancel - flush draft before cancel
      function cancel() {
        flushDraft();
        vscode.postMessage({ type: 'cancel' });
      }

      // Event listeners
      goalTextarea.addEventListener('input', () => {
        validateGoal();
        sendDraftUpdate();
      });

      // maxIterations: input 이벤트로 즉시 저장
      maxIterationsInput.addEventListener('input', () => {
        sendDraftUpdate();
      });

      // blur 시에만 clamp (UX 개선)
      maxIterationsInput.addEventListener('blur', () => {
        clampMaxIterations();
      });

      submitBtn.addEventListener('click', submit);
      cancelBtn.addEventListener('click', cancel);

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });

      // Handle messages from extension
      window.addEventListener('message', (event) => {
        const msg = event.data;
        switch (msg.type) {
          case 'loadDraft':
            // 설정값 캐시 (fallback용) - draft와 분리하여 순수 설정값 사용
            defaultMaxIterations = msg.defaultMaxIterations || 5;
            goalTextarea.value = msg.goal || '';
            // Extension에서 이미 clamp된 값이 오므로 그대로 사용
            maxIterationsInput.value = msg.maxIterations || defaultMaxIterations;
            validateGoal();
            break;
          case 'validationError':
            goalError.textContent = msg.message;
            goalError.classList.add('visible');
            break;
        }
      });

      // Ready: request draft
      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}
