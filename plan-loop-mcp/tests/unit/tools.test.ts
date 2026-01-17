import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test state dir before importing modules
const TEST_STATE_DIR = join(tmpdir(), `plan-loop-test-tools-${Date.now()}`);
process.env.PLAN_LOOP_STATE_DIR = TEST_STATE_DIR;

// Import after setting env var
import * as tools from '../../src/tools.js';
import * as state from '../../src/state.js';

// Helper to parse tool response
function parseResponse(response: { content: { type: string; text: string }[] }) {
  return JSON.parse(response.content[0].text);
}

describe('tools module', () => {
  beforeEach(() => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
  });

  describe('plStart', () => {
    it('should create a new session', () => {
      const result = tools.plStart({ goal: 'Test goal' });
      const data = parseResponse(result);

      expect(data.session_id).toBeDefined();
    });

    it('should create session with custom maxIterations', () => {
      const result = tools.plStart({ goal: 'Test goal', maxIterations: 10 });
      const data = parseResponse(result);

      const session = state.load(data.session_id);
      expect(session?.maxIterations).toBe(10);
    });

    it('should error on empty goal', () => {
      const result = tools.plStart({ goal: '' });

      expect(result.isError).toBe(true);
    });

    it('should error on invalid maxIterations', () => {
      const result = tools.plStart({ goal: 'Test', maxIterations: 0 });

      expect(result.isError).toBe(true);
    });
  });

  describe('plSubmit', () => {
    it('should submit a plan from drafting state', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plSubmit({ session_id, plan: 'My plan' });
      const data = parseResponse(result);

      expect(data.version).toBe(1);
      expect(data.status).toBe('pending_review');
    });

    it('should submit a plan from pending_revision state', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan v1' });
      tools.plFeedback({ session_id, rating: '🟡', content: 'Needs work' });

      const result = tools.plSubmit({ session_id, plan: 'Plan v2' });
      const data = parseResponse(result);

      expect(data.version).toBe(2);
      expect(data.status).toBe('pending_review');
    });

    it('should error on invalid state', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan v1' });
      // Now in pending_review state

      const result = tools.plSubmit({ session_id, plan: 'Plan v2' });

      expect(result.isError).toBe(true);
    });

    it('should error on non-existent session', () => {
      const result = tools.plSubmit({ session_id: 'fake-id', plan: 'Plan' });

      expect(result.isError).toBe(true);
    });
  });

  describe('plGetPlan', () => {
    it('should return pending when no plan', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plGetPlan({ session_id });
      const data = parseResponse(result);

      expect(data.ready).toBe(false);
      expect(data.reason).toBe('no_plan_submitted');
    });

    it('should return the latest plan', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'My plan content' });

      const result = tools.plGetPlan({ session_id });
      const data = parseResponse(result);

      expect(data.ready).toBe(true);
      expect(data.data.content).toBe('My plan content');
      expect(data.data.version).toBe(1);
    });
  });

  describe('plFeedback', () => {
    it('should approve with green rating', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });

      const result = tools.plFeedback({ session_id, rating: '🟢', content: 'LGTM' });
      const data = parseResponse(result);

      expect(data.status).toBe('approved');
      expect(data.iteration).toBe(0);
    });

    it('should request revision with yellow rating', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });

      const result = tools.plFeedback({ session_id, rating: '🟡', content: 'Minor issues' });
      const data = parseResponse(result);

      expect(data.status).toBe('pending_revision');
      expect(data.iteration).toBe(1);
    });

    it('should exhaust after maxIterations', () => {
      const startResult = tools.plStart({ goal: 'Test goal', maxIterations: 2 });
      const { session_id } = parseResponse(startResult);

      // Iteration 1
      tools.plSubmit({ session_id, plan: 'Plan v1' });
      tools.plFeedback({ session_id, rating: '🔴', content: 'Bad' });

      // Iteration 2
      tools.plSubmit({ session_id, plan: 'Plan v2' });
      const result = tools.plFeedback({ session_id, rating: '🔴', content: 'Still bad' });
      const data = parseResponse(result);

      expect(data.status).toBe('exhausted');
      expect(data.iteration).toBe(2);
    });

    it('should error on invalid state', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      // Still in drafting state
      const result = tools.plFeedback({ session_id, rating: '🟢', content: 'OK' });

      expect(result.isError).toBe(true);
    });

    it('should error on invalid rating', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });

      const result = tools.plFeedback({ session_id, rating: 'invalid' as any, content: 'OK' });

      expect(result.isError).toBe(true);
    });
  });

  describe('plGetFeedback', () => {
    it('should return pending when no plan', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plGetFeedback({ session_id });
      const data = parseResponse(result);

      expect(data.ready).toBe(false);
      expect(data.reason).toBe('no_plan_submitted');
    });

    it('should return awaiting_feedback when plan submitted', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });

      const result = tools.plGetFeedback({ session_id });
      const data = parseResponse(result);

      expect(data.ready).toBe(false);
      expect(data.reason).toBe('awaiting_feedback');
    });

    it('should return the latest feedback', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });
      tools.plFeedback({ session_id, rating: '🟢', content: 'Great!' });

      const result = tools.plGetFeedback({ session_id });
      const data = parseResponse(result);

      expect(data.ready).toBe(true);
      expect(data.data.rating).toBe('🟢');
      expect(data.data.content).toBe('Great!');
    });
  });

  describe('plStatus', () => {
    it('should return full session data', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plStatus({ session_id });
      const data = parseResponse(result);

      expect(data.id).toBe(session_id);
      expect(data.goal).toBe('Test goal');
      expect(data.status).toBe('drafting');
    });

    it('should error on non-existent session', () => {
      const result = tools.plStatus({ session_id: 'fake-id' });

      expect(result.isError).toBe(true);
    });
  });

  describe('plList', () => {
    it('should list all sessions', () => {
      tools.plStart({ goal: 'Goal 1' });
      tools.plStart({ goal: 'Goal 2' });

      const result = tools.plList({});
      const data = parseResponse(result);

      expect(data.sessions).toHaveLength(2);
    });

    it('should filter by status', () => {
      const startResult = tools.plStart({ goal: 'Goal 1' });
      const { session_id } = parseResponse(startResult);
      tools.plSubmit({ session_id, plan: 'Plan' });
      tools.plFeedback({ session_id, rating: '🟢', content: 'OK' });

      tools.plStart({ goal: 'Goal 2' }); // drafting

      const result = tools.plList({ status: 'approved' });
      const data = parseResponse(result);

      expect(data.sessions).toHaveLength(1);
      expect(data.sessions[0].status).toBe('approved');
    });
  });

  describe('plForceApprove', () => {
    it('should force approve an exhausted session', () => {
      const startResult = tools.plStart({ goal: 'Test goal', maxIterations: 1 });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });
      tools.plFeedback({ session_id, rating: '🔴', content: 'Bad' });
      // Now exhausted

      const result = tools.plForceApprove({ session_id, reason: 'Time constraint' });
      const data = parseResponse(result);

      expect(data.status).toBe('approved');
    });

    it('should error on non-exhausted session', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plForceApprove({ session_id, reason: 'Because' });

      expect(result.isError).toBe(true);
    });
  });

  describe('plDelete', () => {
    it('should delete an approved session', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      tools.plSubmit({ session_id, plan: 'Plan' });
      tools.plFeedback({ session_id, rating: '🟢', content: 'OK' });

      const result = tools.plDelete({ session_id });
      const data = parseResponse(result);

      expect(data.deleted).toBe(true);
      expect(state.load(session_id)).toBeNull();
    });

    it('should not delete active session without force', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plDelete({ session_id });

      expect(result.isError).toBe(true);
    });

    it('should delete active session with force=true', () => {
      const startResult = tools.plStart({ goal: 'Test goal' });
      const { session_id } = parseResponse(startResult);

      const result = tools.plDelete({ session_id, force: true });
      const data = parseResponse(result);

      expect(data.deleted).toBe(true);
    });

    it('should error on non-existent session', () => {
      const result = tools.plDelete({ session_id: 'fake-id' });

      expect(result.isError).toBe(true);
    });
  });
});
