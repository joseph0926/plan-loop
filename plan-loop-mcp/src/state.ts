/**
 * Plan Loop MCP - State Management
 * Atomic write (temp → rename) for safe concurrent access
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { Session, SessionStatus } from './types.js';

const STATE_DIR = join(homedir(), '.plan-loop', 'sessions');

/**
 * Ensure state directory exists
 */
function ensureDir(): void {
  mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Save session with atomic write
 */
export function save(session: Session): void {
  ensureDir();
  session.updatedAt = new Date().toISOString();

  const filePath = join(STATE_DIR, `${session.id}.json`);
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
    const filePath = join(STATE_DIR, `${id}.json`);
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

/**
 * List all sessions (summary only)
 * goal is truncated to 30 characters (UTF-16 units) + "..." if exceeded
 */
export function list(): { id: string; goal: string; status: SessionStatus }[] {
  ensureDir();

  try {
    const files = readdirSync(STATE_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'));

    return files
      .map((f) => {
        const session = load(f.replace('.json', ''));
        if (!session) return null;

        const truncatedGoal =
          session.goal.length > 30 ? session.goal.slice(0, 30) + '...' : session.goal;

        return {
          id: session.id,
          goal: truncatedGoal,
          status: session.status,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
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
