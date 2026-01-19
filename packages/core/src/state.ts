/**
 * Plan Loop MCP - State Management
 * Atomic write (temp → rename) for safe concurrent access
 */

import { writeFileSync, readFileSync, renameSync, mkdirSync, readdirSync, existsSync, unlinkSync } from 'fs';
import { join, resolve, relative } from 'path';
import { SessionSchema } from './schema.js';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { Session, SessionStatus } from './types.js';

// Support PLAN_LOOP_STATE_DIR env var for test isolation
// Use function to allow dynamic env var reading
function getStateDir(): string {
  return process.env.PLAN_LOOP_STATE_DIR || join(homedir(), '.plan-loop', 'sessions');
}

/**
 * UUID v4 regex pattern for session_id validation
 * Lowercase only - input is normalized before validation
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Normalize session_id to lowercase
 * Ensures consistency across case-insensitive filesystems (macOS/Windows)
 */
export function normalizeSessionId(id: string): string | null {
  if (typeof id !== 'string') {
    return null;
  }
  return id.toLowerCase();
}

/**
 * Validate session_id format (UUID v4, lowercase)
 * Prevents path traversal attacks by ensuring only valid UUIDs are accepted
 * Note: Input should be normalized first with normalizeSessionId()
 */
export function isValidSessionId(id: string): boolean {
  return typeof id === 'string' && UUID_V4_REGEX.test(id);
}

/**
 * Get secure file path for session
 * - Normalizes session_id to lowercase
 * - Validates session_id format (UUID v4)
 * - Prevents path traversal using path.relative() check
 * Returns { filePath, normalizedId } or null if validation fails
 */
function getSecureFilePath(id: string): { filePath: string; normalizedId: string } | null {
  const normalizedId = normalizeSessionId(id);
  if (!normalizedId) {
    console.error(`[plan-loop] Invalid session_id type: ${typeof id}`);
    return null;
  }

  if (!isValidSessionId(normalizedId)) {
    console.error(`[plan-loop] Invalid session_id format: ${id}`);
    return null;
  }

  const stateDir = resolve(getStateDir());
  const filePath = resolve(stateDir, `${normalizedId}.json`);

  // Platform-independent path traversal prevention
  // If relative path starts with '..', it's outside stateDir
  const rel = relative(stateDir, filePath);
  if (rel.startsWith('..') || resolve(stateDir, rel) !== filePath) {
    console.error(`[plan-loop] Path traversal attempt detected: ${id}`);
    return null;
  }

  return { filePath, normalizedId };
}

/**
 * Ensure state directory exists
 */
function ensureDir(): void {
  mkdirSync(getStateDir(), { recursive: true });
}

/**
 * Save session with atomic write
 * Normalizes session.id to lowercase for filesystem consistency
 */
export function save(session: Session): void {
  ensureDir();
  session.updatedAt = new Date().toISOString();

  const result = getSecureFilePath(session.id);
  if (!result) {
    throw new Error(`[plan-loop] Cannot save session with invalid id: ${session.id}`);
  }

  // Normalize session.id to ensure JSON id matches filename
  session.id = result.normalizedId;

  const tempPath = `${result.filePath}.tmp`;

  writeFileSync(tempPath, JSON.stringify(session, null, 2));
  renameSync(tempPath, result.filePath); // atomic
}

/**
 * Load session by ID
 * Returns null if not found, invalid id, or corrupted data
 * Validates session data with Zod schema
 * Input is normalized to lowercase for filesystem consistency
 */
export function load(id: string): Session | null {
  const pathResult = getSecureFilePath(id);
  if (!pathResult) {
    return null;
  }

  const { filePath, normalizedId } = pathResult;

  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const data = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);

    // Validate with Zod schema
    const result = SessionSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`[plan-loop] Invalid session data for ${normalizedId}:`, result.error.message);
      return null;
    }

    // Verify file name matches JSON id to prevent tampering
    if (result.data.id !== normalizedId) {
      console.error(`[plan-loop] Session id mismatch: file=${normalizedId}, json=${result.data.id}`);
      return null;
    }

    return result.data as Session;
  } catch (err) {
    // Log to stderr (stdout is reserved for JSON-RPC)
    console.error(`[plan-loop] Failed to load session ${normalizedId}:`, err);
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
 * Returns true if deleted, false if not found or invalid id
 * Input is normalized to lowercase for filesystem consistency
 */
export function remove(id: string): boolean {
  const result = getSecureFilePath(id);
  if (!result) {
    return false;
  }

  const { filePath, normalizedId } = result;

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error(`[plan-loop] Failed to delete session ${normalizedId}:`, err);
    return false;
  }
}
