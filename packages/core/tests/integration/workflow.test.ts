import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test state dir before importing modules
const TEST_STATE_DIR = join(tmpdir(), `plan-loop-test-workflow-${Date.now()}`);
process.env.PLAN_LOOP_STATE_DIR = TEST_STATE_DIR;

// Import after setting env var
import * as tools from '../../src/tools.js';

// Helper to parse tool response
function parseResponse(response: { content: { type: string; text: string }[] }) {
  return JSON.parse(response.content[0].text);
}

describe('Integration: Plan Loop Workflows', () => {
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

  describe('Happy Path: Direct Approval', () => {
    it('start → submit → feedback(🟢) → approved', () => {
      // 1. Start session
      const startResult = tools.plStart({ goal: 'Implement login feature' });
      const { session_id } = parseResponse(startResult);

      // 2. Submit plan
      const submitResult = tools.plSubmit({
        session_id,
        plan: '1. Create user model\n2. Add login endpoint\n3. Add tests',
      });
      const submitData = parseResponse(submitResult);
      expect(submitData.status).toBe('pending_review');

      // 3. Approve
      const feedbackResult = tools.plFeedback({
        session_id,
        rating: '🟢',
        content: 'LGTM! Well structured plan.',
      });
      const feedbackData = parseResponse(feedbackResult);
      expect(feedbackData.status).toBe('approved');

      // 4. Verify final state
      const statusResult = tools.plStatus({ session_id });
      const statusData = parseResponse(statusResult);
      expect(statusData.status).toBe('approved');
      expect(statusData.version).toBe(1);
      expect(statusData.iteration).toBe(0);
    });
  });

  describe('Revision Path: Minor Revision Then Approval', () => {
    it('start → submit → feedback(🟡) → submit(v2) → feedback(🟢) → approved', () => {
      // 1. Start session
      const startResult = tools.plStart({ goal: 'Add user authentication' });
      const { session_id } = parseResponse(startResult);

      // 2. Submit initial plan
      tools.plSubmit({
        session_id,
        plan: '1. Add password hashing\n2. Add JWT tokens',
      });

      // 3. Request revision
      const feedback1Result = tools.plFeedback({
        session_id,
        rating: '🟡',
        content: 'Missing refresh token handling. Please add.',
      });
      const feedback1Data = parseResponse(feedback1Result);
      expect(feedback1Data.status).toBe('pending_revision');
      expect(feedback1Data.iteration).toBe(1);

      // 4. Submit revised plan
      const submit2Result = tools.plSubmit({
        session_id,
        plan: '1. Add password hashing\n2. Add JWT access tokens\n3. Add refresh token handling',
      });
      const submit2Data = parseResponse(submit2Result);
      expect(submit2Data.version).toBe(2);

      // 5. Approve revised plan
      const feedback2Result = tools.plFeedback({
        session_id,
        rating: '🟢',
        content: 'Great! Now includes refresh token handling.',
      });
      const feedback2Data = parseResponse(feedback2Result);
      expect(feedback2Data.status).toBe('approved');

      // 6. Verify final state
      const statusResult = tools.plStatus({ session_id });
      const statusData = parseResponse(statusResult);
      expect(statusData.status).toBe('approved');
      expect(statusData.version).toBe(2);
      expect(statusData.iteration).toBe(1);
      expect(statusData.plans).toHaveLength(2);
      expect(statusData.feedbacks).toHaveLength(2);
    });
  });

  describe('Exhausted Path: Max Iterations Then Force Approve', () => {
    it('start → (submit → feedback(🔴)) x maxIterations → exhausted → force_approve → approved', () => {
      // 1. Start session with low maxIterations
      const startResult = tools.plStart({ goal: 'Complex feature', maxIterations: 2 });
      const { session_id } = parseResponse(startResult);

      // 2. First iteration
      tools.plSubmit({ session_id, plan: 'Plan v1' });
      tools.plFeedback({ session_id, rating: '🔴', content: 'Major issues' });

      // 3. Second iteration - should exhaust
      tools.plSubmit({ session_id, plan: 'Plan v2' });
      const exhaustResult = tools.plFeedback({ session_id, rating: '🔴', content: 'Still major issues' });
      const exhaustData = parseResponse(exhaustResult);
      expect(exhaustData.status).toBe('exhausted');

      // 4. Cannot submit more plans
      const submitResult = tools.plSubmit({ session_id, plan: 'Plan v3' });
      expect(submitResult.isError).toBe(true);

      // 5. Force approve
      const forceResult = tools.plForceApprove({
        session_id,
        reason: 'Deadline approaching, will iterate post-implementation',
      });
      const forceData = parseResponse(forceResult);
      expect(forceData.status).toBe('approved');

      // 6. Verify final state
      const statusResult = tools.plStatus({ session_id });
      const statusData = parseResponse(statusResult);
      expect(statusData.status).toBe('approved');
      expect(statusData.feedbacks).toHaveLength(3); // 2 red + 1 force approve
    });
  });

  describe('Delete Path: Session Lifecycle', () => {
    it('approved session can be deleted', () => {
      // 1. Create and approve session
      const startResult = tools.plStart({ goal: 'Temp feature' });
      const { session_id } = parseResponse(startResult);
      tools.plSubmit({ session_id, plan: 'Simple plan' });
      tools.plFeedback({ session_id, rating: '🟢', content: 'OK' });

      // 2. Delete
      const deleteResult = tools.plDelete({ session_id });
      const deleteData = parseResponse(deleteResult);
      expect(deleteData.deleted).toBe(true);

      // 3. Verify deletion
      const statusResult = tools.plStatus({ session_id });
      expect(statusResult.isError).toBe(true);
    });

    it('active session requires force to delete', () => {
      // 1. Create session (active)
      const startResult = tools.plStart({ goal: 'Active feature' });
      const { session_id } = parseResponse(startResult);

      // 2. Try to delete without force
      const deleteResult = tools.plDelete({ session_id });
      expect(deleteResult.isError).toBe(true);

      // 3. Delete with force
      const forceDeleteResult = tools.plDelete({ session_id, force: true });
      const forceDeleteData = parseResponse(forceDeleteResult);
      expect(forceDeleteData.deleted).toBe(true);
    });
  });

  describe('List and Filter Operations', () => {
    it('can filter and find sessions by status', () => {
      // Create sessions in different states
      const s1Result = tools.plStart({ goal: 'Feature 1' });
      const { session_id: s1 } = parseResponse(s1Result);
      tools.plSubmit({ session_id: s1, plan: 'Plan 1' });
      tools.plFeedback({ session_id: s1, rating: '🟢', content: 'OK' }); // approved

      const s2Result = tools.plStart({ goal: 'Feature 2' });
      const { session_id: s2 } = parseResponse(s2Result);
      tools.plSubmit({ session_id: s2, plan: 'Plan 2' }); // pending_review

      tools.plStart({ goal: 'Feature 3' }); // drafting

      // Test filtering
      const allResult = tools.plList({});
      expect(parseResponse(allResult).sessions).toHaveLength(3);

      const approvedResult = tools.plList({ status: 'approved' });
      expect(parseResponse(approvedResult).sessions).toHaveLength(1);

      const activeResult = tools.plList({ status: ['drafting', 'pending_review'] });
      expect(parseResponse(activeResult).sessions).toHaveLength(2);
    });
  });
});
