import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Security', () => {
  const TEST_STATE_DIR = join(tmpdir(), `plan-loop-security-test-${Date.now()}`);
  let originalEnv: string | undefined;

  // Dynamic import references
  let load: typeof import('../../src/state.js').load;
  let remove: typeof import('../../src/state.js').remove;
  let create: typeof import('../../src/state.js').create;
  let save: typeof import('../../src/state.js').save;
  let isValidSessionId: typeof import('../../src/state.js').isValidSessionId;
  let normalizeSessionId: typeof import('../../src/state.js').normalizeSessionId;

  beforeAll(async () => {
    // Save original env
    originalEnv = process.env.PLAN_LOOP_STATE_DIR;

    // Set test env
    process.env.PLAN_LOOP_STATE_DIR = TEST_STATE_DIR;

    // Dynamic import after env is set
    const stateModule = await import('../../src/state.js');
    load = stateModule.load;
    remove = stateModule.remove;
    create = stateModule.create;
    save = stateModule.save;
    isValidSessionId = stateModule.isValidSessionId;
    normalizeSessionId = stateModule.normalizeSessionId;
  });

  afterAll(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.PLAN_LOOP_STATE_DIR;
    } else {
      process.env.PLAN_LOOP_STATE_DIR = originalEnv;
    }
  });

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

  describe('isValidSessionId', () => {
    it('accepts valid UUID v4', () => {
      expect(isValidSessionId('a62dcc0d-727a-42b8-af79-205253cefce8')).toBe(true);
      expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rejects path traversal patterns', () => {
      expect(isValidSessionId('../../etc/passwd')).toBe(false);
      expect(isValidSessionId('../..')).toBe(false);
      expect(isValidSessionId('foo/bar')).toBe(false);
      expect(isValidSessionId('foo\\bar')).toBe(false);
    });

    it('rejects invalid formats', () => {
      expect(isValidSessionId('not-a-uuid')).toBe(false);
      expect(isValidSessionId('12345')).toBe(false);
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId(null as any)).toBe(false);
      expect(isValidSessionId(undefined as any)).toBe(false);
    });

    it('rejects UUID v1 (not v4)', () => {
      // UUID v1 has version 1 in the 3rd group
      expect(isValidSessionId('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
    });

    it('rejects uppercase UUID (isValidSessionId expects lowercase)', () => {
      // isValidSessionId expects already-normalized (lowercase) input
      expect(isValidSessionId('A62DCC0D-727A-42B8-AF79-205253CEFCE8')).toBe(false);
      expect(isValidSessionId('a62dcc0d-727a-42b8-AF79-205253cefce8')).toBe(false); // mixed case
    });
  });

  describe('normalizeSessionId', () => {
    it('normalizes uppercase UUID to lowercase', () => {
      expect(normalizeSessionId('A62DCC0D-727A-42B8-AF79-205253CEFCE8')).toBe(
        'a62dcc0d-727a-42b8-af79-205253cefce8'
      );
    });

    it('normalizes mixed case UUID to lowercase', () => {
      expect(normalizeSessionId('a62dcc0d-727a-42b8-AF79-205253CEFCE8')).toBe(
        'a62dcc0d-727a-42b8-af79-205253cefce8'
      );
    });

    it('returns null for non-string input', () => {
      expect(normalizeSessionId(null as any)).toBeNull();
      expect(normalizeSessionId(undefined as any)).toBeNull();
      expect(normalizeSessionId(123 as any)).toBeNull();
    });

    it('preserves already lowercase UUID', () => {
      expect(normalizeSessionId('a62dcc0d-727a-42b8-af79-205253cefce8')).toBe(
        'a62dcc0d-727a-42b8-af79-205253cefce8'
      );
    });
  });

  describe('load() with uppercase UUID (normalization)', () => {
    it('loads session with uppercase UUID input', () => {
      // Create a session with lowercase id
      const session = create('test goal');
      const lowercaseId = session.id;
      const uppercaseId = lowercaseId.toUpperCase();

      // Load with uppercase should work (normalized internally)
      const loaded = load(uppercaseId);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(lowercaseId);
    });

    it('loads session with mixed case UUID input', () => {
      const session = create('test goal');
      const lowercaseId = session.id;
      // Create mixed case: first half uppercase, second half lowercase
      const mixedCaseId =
        lowercaseId.substring(0, 18).toUpperCase() + lowercaseId.substring(18);

      const loaded = load(mixedCaseId);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(lowercaseId);
    });
  });

  describe('save() id normalization', () => {
    it('normalizes session.id to lowercase on save', () => {
      // Create session and manually change id to uppercase
      const session = create('test goal');
      const originalLowercaseId = session.id;
      session.id = originalLowercaseId.toUpperCase();

      // Save should normalize the id
      save(session);

      // session.id should now be lowercase
      expect(session.id).toBe(originalLowercaseId);

      // Load should work
      const loaded = load(originalLowercaseId);
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(originalLowercaseId);
    });

    it('preserves already lowercase id on save', () => {
      const session = create('test goal');
      const originalId = session.id;

      save(session);

      expect(session.id).toBe(originalId);
    });
  });

  describe('load() with path traversal', () => {
    it('rejects path traversal attempts', () => {
      expect(load('../../etc/passwd')).toBeNull();
      expect(load('../..')).toBeNull();
    });

    it('rejects Windows path traversal', () => {
      expect(load('..\\..\\etc\\passwd')).toBeNull();
    });
  });

  describe('load() with corrupted data', () => {
    it('returns null for invalid JSON', () => {
      const id = 'a62dcc0d-727a-42b8-af79-205253cefce8';
      writeFileSync(join(TEST_STATE_DIR, `${id}.json`), 'not json');
      expect(load(id)).toBeNull();
    });

    it('returns null for missing required fields', () => {
      const id = 'b72ecc1e-838b-43c9-8f80-316364dfdf79';
      writeFileSync(
        join(TEST_STATE_DIR, `${id}.json`),
        JSON.stringify({
          id,
          goal: 'test',
          // status missing
        })
      );
      expect(load(id)).toBeNull();
    });

    it('returns null for invalid status enum', () => {
      const id = 'c83fdd2f-949c-44da-9f91-427475efef8a';
      writeFileSync(
        join(TEST_STATE_DIR, `${id}.json`),
        JSON.stringify({
          id,
          goal: 'test',
          status: 'invalid_status',
          version: 0,
          iteration: 0,
          maxIterations: 5,
          plans: [],
          feedbacks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      expect(load(id)).toBeNull();
    });

    it('returns null for invalid field types', () => {
      const id = 'd94gee3g-050d-45eb-af02-538586fgfg9b';
      // Invalid UUID format in id field, so this should fail at getSecureFilePath
      expect(load(id)).toBeNull();
    });

    it('returns null when file id does not match JSON id (tampering detection)', () => {
      const fileId = 'a62dcc0d-727a-42b8-af79-205253cefce8';
      const jsonId = 'b72ecc1e-838b-43c9-8f80-316364dfdf79'; // Different ID in JSON
      writeFileSync(
        join(TEST_STATE_DIR, `${fileId}.json`),
        JSON.stringify({
          id: jsonId, // Mismatched ID
          goal: 'test',
          status: 'drafting',
          version: 0,
          iteration: 0,
          maxIterations: 5,
          plans: [],
          feedbacks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      expect(load(fileId)).toBeNull();
    });

    it('returns null when JSON id is not UUID v4 format', () => {
      const fileId = 'c83fdd2f-949c-44da-9f91-427475efef8a';
      writeFileSync(
        join(TEST_STATE_DIR, `${fileId}.json`),
        JSON.stringify({
          id: 'not-a-valid-uuid', // Invalid UUID format
          goal: 'test',
          status: 'drafting',
          version: 0,
          iteration: 0,
          maxIterations: 5,
          plans: [],
          feedbacks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
      expect(load(fileId)).toBeNull();
    });
  });

  describe('remove() security', () => {
    it('rejects path traversal in remove()', () => {
      expect(remove('../../etc/passwd')).toBe(false);
      expect(remove('..\\..\\etc\\passwd')).toBe(false);
    });

    it('returns false for invalid session id format', () => {
      expect(remove('not-a-uuid')).toBe(false);
      expect(remove('')).toBe(false);
    });
  });
});
