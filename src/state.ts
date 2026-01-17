/**
 * Plan Loop MCP - State Management
 * Atomic write (temp → rename) for safe concurrent access
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { Session, SessionStatus } from './types.js';

// Support PLAN_LOOP_STATE_DIR env var for test isolation
// Use function to allow dynamic env var reading
function getStateDir(): string {
  return process.env.PLAN_LOOP_STATE_DIR || join(homedir(), '.plan-loop', 'sessions');
}

/**
 * Ensure state directory exists
 */
function ensureDir(): void {
  mkdirSync(getStateDir(), { recursive: true });
}

/**
 * Save session with atomic write
 */
export function save(session: Session): void {
  ensureDir();
  session.updatedAt = new Date().toISOString();

  const filePath = join(getStateDir(), `${session.id}.json`);
  const tempPath = `${filePath}.tmp`;

  writeFileSync(tempPath, JSON.stringify(session, null, 2));
  renameSync(tempPath, filePath); // atomic
}

/**
 * Load session by ID
 * Returns null if not found or corrupted
 */
export function load(id: string): Session | null {
  try {
    const filePath = join(getStateDir(), `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    const data = readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Session;
  } catch (err) {
    // Log to stderr (stdout is reserved for JSON-RPC)
    console.error(`[plan-loop] Failed to load session ${id}:`, err);
    return null;
  }
}

export interface ListOptions {
  status?: SessionStatus | SessionStatus[];
  sort?: 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

/**
 * List all sessions (summary only)
 * goal is truncated to 30 characters (UTF-16 units) + "..." if exceeded
 * Supports filtering by status and sorting
 */
export function list(options: ListOptions = {}): { id: string; goal: string; status: SessionStatus; createdAt: string; updatedAt: string }[] {
  ensureDir();

  const { status, sort = 'updatedAt', order = 'desc' } = options;

  // Normalize status filter to array
  const statusFilter: SessionStatus[] | null = status
    ? Array.isArray(status)
      ? status
      : [status]
    : null;

  try {
    const files = readdirSync(getStateDir()).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));

    let sessions = files
      .map((f) => {
        const session = load(f.replace('.json', ''));
        if (!session) return null;

        // Apply status filter
        if (statusFilter && !statusFilter.includes(session.status)) {
          return null;
        }

        const truncatedGoal =
          session.goal.length > 30 ? session.goal.slice(0, 30) + '...' : session.goal;

        return {
          id: session.id,
          goal: truncatedGoal,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Sort
    sessions.sort((a, b) => {
      const aTime = new Date(a[sort]).getTime();
      const bTime = new Date(b[sort]).getTime();
      return order === 'asc' ? aTime - bTime : bTime - aTime;
    });

    return sessions;
  } catch (err) {
    console.error('[plan-loop] Failed to list sessions:', err);
    return [];
  }
}

/**
 * Create a new session
 */
export function create(goal: string, maxIterations = 5): Session {
  const now = new Date().toISOString();

  const session: Session = {
    id: randomUUID(),
    goal,
    status: 'drafting',
    version: 0,
    iteration: 0,
    maxIterations,
    plans: [],
    feedbacks: [],
    createdAt: now,
    updatedAt: now,
  };

  save(session);
  return session;
}

/**
 * Get latest plan from session
 */
export function getLatestPlan(session: Session) {
  if (session.plans.length === 0) {
    return null;
  }
  return session.plans[session.plans.length - 1];
}

/**
 * Get latest feedback from session
 */
export function getLatestFeedback(session: Session) {
  if (session.feedbacks.length === 0) {
    return null;
  }
  return session.feedbacks[session.feedbacks.length - 1];
}

/**
 * Delete session by ID
 * Returns true if deleted, false if not found
 */
export function remove(id: string): boolean {
  const filePath = join(getStateDir(), `${id}.json`);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error(`[plan-loop] Failed to delete session ${id}:`, err);
    return false;
  }
}
