import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Set test state dir before importing state module
const TEST_STATE_DIR = join(tmpdir(), `plan-loop-test-${Date.now()}`);
process.env.PLAN_LOOP_STATE_DIR = TEST_STATE_DIR;

// Import after setting env var
import * as state from '../../src/state.js';

describe('state module', () => {
  beforeEach(() => {
    // Ensure clean test directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
    mkdirSync(TEST_STATE_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
  });

  describe('create', () => {
    it('should create a session with default maxIterations', () => {
      const session = state.create('Test goal');

      expect(session.id).toBeDefined();
      expect(session.goal).toBe('Test goal');
      expect(session.status).toBe('drafting');
      expect(session.version).toBe(0);
      expect(session.iteration).toBe(0);
      expect(session.maxIterations).toBe(5);
      expect(session.plans).toEqual([]);
      expect(session.feedbacks).toEqual([]);
    });

    it('should create a session with custom maxIterations', () => {
      const session = state.create('Test goal', 10);

      expect(session.maxIterations).toBe(10);
    });
  });

  describe('load', () => {
    it('should load an existing session', () => {
      const created = state.create('Test goal');
      const loaded = state.load(created.id);

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(created.id);
      expect(loaded?.goal).toBe('Test goal');
    });

    it('should return null for non-existent session', () => {
      const loaded = state.load('non-existent-id');

      expect(loaded).toBeNull();
    });
  });

  describe('save', () => {
    it('should save and update updatedAt', async () => {
      const session = state.create('Test goal');
      const originalUpdatedAt = session.updatedAt;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      session.status = 'pending_review';
      state.save(session);

      const loaded = state.load(session.id);
      expect(loaded?.status).toBe('pending_review');
      expect(loaded?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('remove', () => {
    it('should delete an existing session', () => {
      const session = state.create('Test goal');

      const deleted = state.remove(session.id);

      expect(deleted).toBe(true);
      expect(state.load(session.id)).toBeNull();
    });

    it('should return false for non-existent session', () => {
      const deleted = state.remove('non-existent-id');

      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no sessions', () => {
      const sessions = state.list();

      expect(sessions).toEqual([]);
    });

    it('should list all sessions', () => {
      state.create('Goal 1');
      state.create('Goal 2');

      const sessions = state.list();

      expect(sessions).toHaveLength(2);
    });

    it('should filter by status', () => {
      const s1 = state.create('Goal 1');
      s1.status = 'approved';
      state.save(s1);

      state.create('Goal 2'); // drafting

      const approved = state.list({ status: 'approved' });
      const drafting = state.list({ status: 'drafting' });

      expect(approved).toHaveLength(1);
      expect(drafting).toHaveLength(1);
    });

    it('should filter by multiple statuses', () => {
      const s1 = state.create('Goal 1');
      s1.status = 'approved';
      state.save(s1);

      const s2 = state.create('Goal 2');
      s2.status = 'exhausted';
      state.save(s2);

      state.create('Goal 3'); // drafting

      const filtered = state.list({ status: ['approved', 'exhausted'] });

      expect(filtered).toHaveLength(2);
    });

    it('should sort by updatedAt desc by default', async () => {
      state.create('Goal 1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      state.create('Goal 2');

      const sessions = state.list();

      expect(sessions[0].goal).toBe('Goal 2');
      expect(sessions[1].goal).toBe('Goal 1');
    });

    it('should sort by createdAt asc', async () => {
      state.create('Goal 1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      state.create('Goal 2');

      const sessions = state.list({ sort: 'createdAt', order: 'asc' });

      expect(sessions[0].goal).toBe('Goal 1');
      expect(sessions[1].goal).toBe('Goal 2');
    });

    it('should truncate long goals', () => {
      const longGoal = 'A'.repeat(50);
      state.create(longGoal);

      const sessions = state.list();

      expect(sessions[0].goal).toBe('A'.repeat(30) + '...');
    });
  });

  describe('getLatestPlan', () => {
    it('should return null when no plans', () => {
      const session = state.create('Test goal');

      expect(state.getLatestPlan(session)).toBeNull();
    });

    it('should return the latest plan', () => {
      const session = state.create('Test goal');
      session.plans.push({ version: 1, content: 'Plan 1', submittedAt: new Date().toISOString() });
      session.plans.push({ version: 2, content: 'Plan 2', submittedAt: new Date().toISOString() });

      const latest = state.getLatestPlan(session);

      expect(latest?.version).toBe(2);
      expect(latest?.content).toBe('Plan 2');
    });
  });

  describe('getLatestFeedback', () => {
    it('should return null when no feedbacks', () => {
      const session = state.create('Test goal');

      expect(state.getLatestFeedback(session)).toBeNull();
    });

    it('should return the latest feedback', () => {
      const session = state.create('Test goal');
      session.feedbacks.push({ planVersion: 1, rating: '🟡', content: 'FB 1', submittedAt: new Date().toISOString() });
      session.feedbacks.push({ planVersion: 2, rating: '🟢', content: 'FB 2', submittedAt: new Date().toISOString() });

      const latest = state.getLatestFeedback(session);

      expect(latest?.planVersion).toBe(2);
      expect(latest?.content).toBe('FB 2');
    });
  });
});
