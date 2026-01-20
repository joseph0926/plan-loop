/**
 * Prompt Smith - Template-based prompt generation
 *
 * Template variables:
 * - {{session_id}} : Session ID
 * - {{goal}} : Session goal
 * - {{plan_version}} : Current plan version
 * - {{feedback_content}} : Latest feedback content
 *
 * Escape syntax:
 * - {{{ ... }}} : Literal content (braces removed)
 * - Example: {{{session_id: "abc"}}} -> {session_id: "abc"}
 */

import * as vscode from 'vscode';

// ===== Types =====

export interface RenderOptions {
  /** If true, throw error on unresolved variables. Default: false (empty string + warning) */
  strict?: boolean;
}

export interface Session {
  id: string;
  goal: string;
  status: string;
  version: number;
  iteration: number;
  maxIterations: number;
  plans: Array<{ version: number; content: string; submittedAt: string }>;
  feedbacks: Array<{
    planVersion: number;
    rating: string;
    content: string;
    submittedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ===== Default Templates =====

export const DEFAULT_TEMPLATES = {
  plan: `세션 {{session_id}}에 대한 계획을 작성하세요.

목표: {{goal}}

완료 후 pl_submit({{{session_id: "{{session_id}}", plan: "작성한 계획"}}})을 호출하세요.`,

  review: `pl_get_plan({{{session_id: "{{session_id}}"}}})로 계획(v{{plan_version}})을 확인하고 리뷰하세요.

목표: {{goal}}

리뷰 후 pl_feedback({{{session_id: "{{session_id}}", rating: "🟢|🟡|🔴", content: "피드백 내용", plan_version: {{plan_version}}}}})으로 피드백을 제출하세요.`,

  feedback: `피드백을 반영하여 계획(v{{plan_version}})을 수정하세요.

세션 ID: {{session_id}}
목표: {{goal}}

피드백:
{{feedback_content}}

수정 완료 후 pl_submit({{{session_id: "{{session_id}}", plan: "수정된 계획"}}})을 호출하세요.`,
} as const;

// ===== Template Rendering =====

/**
 * Render template with variable substitution
 *
 * @param template - Template string with {{variables}} and {{{literals}}}
 * @param vars - Variable values to substitute
 * @param opts - Rendering options
 * @returns Rendered string
 *
 * @example
 * // Basic substitution
 * renderTemplate('Hello {{name}}', { name: 'World' }) // 'Hello World'
 *
 * // Literal escape (triple braces)
 * renderTemplate('JSON: {{{key: "val"}}}', {}) // 'JSON: {key: "val"}'
 *
 * // Unresolved variable (strict=false)
 * renderTemplate('Hello {{missing}}', {}) // 'Hello ' + warning toast
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  opts: RenderOptions = {}
): string {
  const { strict = false } = opts;

  // Helper: substitute variables in a string
  const substituteVars = (text: string): { result: string; unresolved: string[] } => {
    const unresolved: string[] = [];
    const result = text.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      if (varName in vars) {
        return vars[varName];
      }
      unresolved.push(varName);
      return '';
    });
    return { result, unresolved };
  };

  // Collect all unresolved variables (both inside and outside literals)
  const allUnresolvedVars: string[] = [];

  // Step 1: Extract literal escapes {{{ ... }}} and substitute variables INSIDE them too
  const literals: string[] = [];
  let result = template.replace(/\{\{\{([\s\S]*?)\}\}\}/g, (_match, content) => {
    // Substitute variables inside literal content
    const { result: substitutedContent, unresolved } = substituteVars(content);
    // Collect unresolved variables from inside literals
    allUnresolvedVars.push(...unresolved);
    const index = literals.length;
    literals.push(substitutedContent);
    return `\x00LITERAL_${index}\x00`;
  });

  // Step 2: Replace variables {{var}} outside literals
  const { result: substitutedResult, unresolved: outsideUnresolved } = substituteVars(result);
  result = substitutedResult;
  allUnresolvedVars.push(...outsideUnresolved);

  // Deduplicate unresolved variables
  const unresolvedVars = [...new Set(allUnresolvedVars)];

  // Step 3: Handle unresolved variables
  if (unresolvedVars.length > 0) {
    const message = `템플릿 변수 미치환: {{${unresolvedVars.join('}}, {{')}}}`;

    if (strict) {
      throw new Error(`Missing template variables: ${unresolvedVars.join(', ')}`);
    }

    // Log warning
    console.warn(`[Prompt Smith] ${message}`);

    // Show toast warning (non-blocking)
    vscode.window.showWarningMessage(`[Prompt Smith] ${message}`);
  }

  // Step 4: Restore literal placeholders (wrap with single braces)
  // {{{content}}} -> {content}
  result = result.replace(/\x00LITERAL_(\d+)\x00/g, (_match, index) => {
    return `{${literals[parseInt(index, 10)]}}`;
  });

  return result;
}

// ===== Configuration Helpers =====

type TemplateType = 'plan' | 'review' | 'feedback';

/**
 * Get template from user settings or default
 */
export function getTemplate(type: TemplateType): string {
  const config = vscode.workspace.getConfiguration('planLoop.promptTemplates');
  const userTemplate = config.get<string>(type);
  return userTemplate && userTemplate.trim() ? userTemplate : DEFAULT_TEMPLATES[type];
}

// ===== Prompt Builders =====

/**
 * Build prompt for plan submission (drafting -> pending_review)
 * Used after session creation to guide Claude
 */
export function buildPlanPrompt(session: Session): string {
  const template = getTemplate('plan');
  return renderTemplate(template, {
    session_id: session.id,
    goal: session.goal,
  });
}

/**
 * Build prompt for plan review (pending_review state)
 * Used to guide Codex for reviewing the plan
 */
export function buildReviewPrompt(session: Session): string {
  const template = getTemplate('review');
  const latestPlan = session.plans[session.plans.length - 1];
  // Use actual plan version instead of array length for concurrency safety
  const planVersion = latestPlan ? latestPlan.version.toString() : '1';

  return renderTemplate(template, {
    session_id: session.id,
    goal: session.goal,
    plan_version: planVersion,
  });
}

/**
 * Build prompt for plan revision (pending_revision state)
 * Used to guide Claude for revising the plan based on feedback
 */
export function buildFeedbackPrompt(session: Session): string {
  const template = getTemplate('feedback');
  const latestPlan = session.plans[session.plans.length - 1];
  // Use actual plan version instead of array length for concurrency safety
  const planVersion = latestPlan ? latestPlan.version.toString() : '1';
  const latestFeedback = session.feedbacks[session.feedbacks.length - 1];
  const feedbackContent = latestFeedback
    ? `${latestFeedback.rating} ${latestFeedback.content}`
    : '(피드백 없음)';

  return renderTemplate(template, {
    session_id: session.id,
    goal: session.goal,
    plan_version: planVersion,
    feedback_content: feedbackContent,
  });
}

// ===== Display vs Copy Prompts =====

/**
 * Get prompt for display in webview (may be truncated/highlighted)
 * Currently returns the same as copy prompt, but can be customized
 */
export function getDisplayPrompt(session: Session): string {
  switch (session.status) {
    case 'drafting':
      return buildPlanPrompt(session);
    case 'pending_review':
      return buildReviewPrompt(session);
    case 'pending_revision':
      return buildFeedbackPrompt(session);
    default:
      return '';
  }
}

/**
 * Get prompt for clipboard copy / dispatch
 * Returns full template without truncation
 */
export function getCopyPrompt(session: Session): string {
  // Currently same as display, but kept separate for future customization
  return getDisplayPrompt(session);
}
