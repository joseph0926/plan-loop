/**
 * Plan Loop MCP - Tool Implementations
 */

import type {
  Session,
  Rating,
  PlStartInput,
  PlSubmitInput,
  PlGetPlanInput,
  PlFeedbackInput,
  PlGetFeedbackInput,
  PlStatusInput,
  PlListInput,
  PlForceApproveInput,
  PlDeleteInput,
  Response,
  Plan,
  Feedback,
} from './types.js';
import * as state from './state.js';

// Error response helper (SDK isError format)
function errorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

// Success response helper
function successResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * pl_start - Create a new session
 */
export function plStart(input: PlStartInput) {
  const { goal, maxIterations = 5 } = input;

  if (!isNonEmptyString(goal)) {
    return errorResponse('goal is required');
  }

  if (
    maxIterations !== undefined &&
    (typeof maxIterations !== 'number' ||
      !Number.isInteger(maxIterations) ||
      maxIterations < 1)
  ) {
    return errorResponse('maxIterations must be a positive integer');
  }

  const session = state.create(goal, maxIterations);

  return successResponse({
    session_id: session.id,
  });
}

/**
 * pl_submit - Submit a plan
 * Allowed states: drafting, pending_revision
 */
export function plSubmit(input: PlSubmitInput) {
  const { session_id, plan } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  const allowedStates = ['drafting', 'pending_revision'];
  if (!allowedStates.includes(session.status)) {
    return errorResponse(
      `Invalid state: current='${session.status}', expected=${JSON.stringify(allowedStates)}`
    );
  }

  if (!isNonEmptyString(plan)) {
    return errorResponse('plan is required');
  }

  // Increment version and add plan
  session.version += 1;
  session.plans.push({
    version: session.version,
    content: plan,
    submittedAt: new Date().toISOString(),
  });
  session.status = 'pending_review';

  state.save(session);

  return successResponse({
    version: session.version,
    status: session.status,
  });
}

/**
 * pl_get_plan - Get the latest plan
 * Returns pending response if no plan exists
 */
export function plGetPlan(input: PlGetPlanInput): ReturnType<typeof successResponse> {
  const { session_id } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  const latestPlan = state.getLatestPlan(session);

  if (!latestPlan) {
    const response: Response<Plan> = {
      ready: false,
      reason: 'no_plan_submitted',
    };
    return successResponse(response);
  }

  const response: Response<Plan> = {
    ready: true,
    data: latestPlan,
  };
  return successResponse(response);
}

/**
 * pl_feedback - Submit feedback for the latest plan
 * Allowed states: pending_review
 * Supports optimistic concurrency via optional plan_version parameter
 */
export function plFeedback(input: PlFeedbackInput) {
  const { session_id, rating, content, plan_version } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  if (session.status !== 'pending_review') {
    return errorResponse(
      `Invalid state: current='${session.status}', expected=['pending_review']`
    );
  }

  const validRatings: Rating[] = ['🔴', '🟡', '🟢'];
  if (!validRatings.includes(rating)) {
    return errorResponse(`Invalid rating: ${rating}, expected one of ${JSON.stringify(validRatings)}`);
  }

  if (!isNonEmptyString(content)) {
    return errorResponse('content is required');
  }

  const latestPlan = state.getLatestPlan(session);
  if (!latestPlan) {
    return errorResponse('No plan to provide feedback on');
  }

  // Optimistic concurrency check: verify plan_version if provided
  if (plan_version !== undefined) {
    if (typeof plan_version !== 'number' || !Number.isInteger(plan_version)) {
      return errorResponse('plan_version must be an integer');
    }
    if (plan_version !== latestPlan.version) {
      return errorResponse(
        `Plan version mismatch: expected=${latestPlan.version}, provided=${plan_version}. Another agent may have submitted a new plan.`
      );
    }
  }

  // Add feedback
  session.feedbacks.push({
    planVersion: latestPlan.version,
    rating,
    content,
    submittedAt: new Date().toISOString(),
  });

  // Update status based on rating
  if (rating === '🟢') {
    session.status = 'approved';
  } else {
    // 🔴 or 🟡
    session.iteration += 1;

    if (session.iteration >= session.maxIterations) {
      session.status = 'exhausted';
    } else {
      session.status = 'pending_revision';
    }
  }

  state.save(session);

  return successResponse({
    status: session.status,
    iteration: session.iteration,
  });
}

/**
 * pl_get_feedback - Get the latest feedback
 * Returns pending response based on session status
 */
export function plGetFeedback(input: PlGetFeedbackInput): ReturnType<typeof successResponse> {
  const { session_id } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  const latestPlan = state.getLatestPlan(session);
  if (!latestPlan) {
    const response: Response<Feedback> = {
      ready: false,
      reason: 'no_plan_submitted',
    };
    return successResponse(response);
  }

  const latestFeedback = state.getLatestFeedback(session);

  if (!latestFeedback || latestFeedback.planVersion < latestPlan.version) {
    // Determine reason based on status
    const reason = session.status === 'pending_review' ? 'awaiting_feedback' : 'no_feedback_yet';
    const response: Response<Feedback> = {
      ready: false,
      reason,
    };
    return successResponse(response);
  }

  const response: Response<Feedback> = {
    ready: true,
    data: latestFeedback,
  };
  return successResponse(response);
}

/**
 * pl_status - Get full session status
 */
export function plStatus(input: PlStatusInput) {
  const { session_id } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  return successResponse(session);
}

/**
 * pl_list - List all sessions
 * Supports filtering by status and sorting
 */
export function plList(input: PlListInput = {}) {
  const { status, sort, order } = input;

  const sessions = state.list({ status, sort, order });

  // Remove timestamps from response (keep backward compatible)
  const sessionsWithoutTimestamps = sessions.map(({ id, goal, status }) => ({
    id,
    goal,
    status,
  }));

  return successResponse({
    sessions: sessionsWithoutTimestamps,
  });
}

/**
 * pl_force_approve - Force approve an exhausted session
 * Allowed states: exhausted
 */
export function plForceApprove(input: PlForceApproveInput) {
  const { session_id, reason } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  if (session.status !== 'exhausted') {
    return errorResponse(
      `Invalid state: current='${session.status}', expected=['exhausted']`
    );
  }

  if (!isNonEmptyString(reason)) {
    return errorResponse('reason is required');
  }

  // Add a special feedback entry for force approve
  const latestPlan = state.getLatestPlan(session);
  session.feedbacks.push({
    planVersion: latestPlan?.version ?? session.version,
    rating: '🟢',
    content: `[FORCE APPROVED] ${reason}`,
    submittedAt: new Date().toISOString(),
  });

  session.status = 'approved';
  state.save(session);

  return successResponse({
    status: 'approved' as const,
  });
}

/**
 * pl_delete - Delete a session
 * By default, only allows deleting approved/exhausted sessions
 * Use force=true to delete active sessions
 */
export function plDelete(input: PlDeleteInput) {
  const { session_id, force = false } = input;

  if (!isNonEmptyString(session_id)) {
    return errorResponse('session_id is required');
  }

  const session = state.load(session_id);
  if (!session) {
    return errorResponse(`Session not found: ${session_id}`);
  }

  // Check if session can be deleted
  const safeStates = ['approved', 'exhausted'];
  if (!safeStates.includes(session.status) && !force) {
    return errorResponse(
      `Cannot delete active session (status='${session.status}'). Use force=true to override`
    );
  }

  const deleted = state.remove(session_id);
  if (!deleted) {
    return errorResponse(`Failed to delete session: ${session_id}`);
  }

  return successResponse({
    deleted: true,
    session_id,
  });
}
