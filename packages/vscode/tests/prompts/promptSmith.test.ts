/**
 * Prompt Smith Unit Tests
 *
 * Tests for renderTemplate function:
 * - Basic variable substitution
 * - Unresolved variables (strict=false/true)
 * - Multiline templates
 * - Triple brace escape {{{ }}}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => undefined),
    })),
  },
  window: {
    showWarningMessage: vi.fn(),
  },
}));

// Import after mocking
import { renderTemplate, DEFAULT_TEMPLATES } from '../../src/prompts/promptSmith';
import * as vscode from 'vscode';

describe('renderTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic substitution', () => {
    it('should substitute single variable', () => {
      const result = renderTemplate('Hello {{name}}', { name: 'World' });
      expect(result).toBe('Hello World');
    });

    it('should substitute multiple variables', () => {
      const result = renderTemplate('{{greeting}} {{name}}!', {
        greeting: 'Hello',
        name: 'World',
      });
      expect(result).toBe('Hello World!');
    });

    it('should handle empty variables', () => {
      const result = renderTemplate('Value: {{value}}', { value: '' });
      expect(result).toBe('Value: ');
    });

    it('should handle variables with special characters', () => {
      const result = renderTemplate('ID: {{session_id}}', {
        session_id: 'abc-123-def',
      });
      expect(result).toBe('ID: abc-123-def');
    });
  });

  describe('Unresolved variables (strict=false)', () => {
    it('should replace unresolved variable with empty string', () => {
      const result = renderTemplate('Hello {{missing}}', {});
      expect(result).toBe('Hello ');
    });

    it('should show warning for unresolved variable', () => {
      renderTemplate('Hello {{missing}}', {});
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('missing')
      );
    });

    it('should handle multiple unresolved variables', () => {
      const result = renderTemplate('{{a}} {{b}} {{c}}', { b: 'B' });
      expect(result).toBe(' B ');
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('Unresolved variables (strict=true)', () => {
    it('should throw error for unresolved variable', () => {
      expect(() => {
        renderTemplate('Hello {{missing}}', {}, { strict: true });
      }).toThrow('Missing template variables: missing');
    });

    it('should throw error with all missing variables listed', () => {
      expect(() => {
        renderTemplate('{{a}} {{b}}', {}, { strict: true });
      }).toThrow('Missing template variables: a, b');
    });
  });

  describe('Unresolved variables inside literals', () => {
    it('should warn for unresolved variable inside literal (strict=false)', () => {
      const result = renderTemplate('pl_submit({{{session_id: "{{missing}}"}}})', {});
      expect(result).toBe('pl_submit({session_id: ""})');
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('missing')
      );
    });

    it('should throw for unresolved variable inside literal (strict=true)', () => {
      expect(() => {
        renderTemplate('pl_submit({{{session_id: "{{missing}}"}}})', {}, { strict: true });
      }).toThrow('Missing template variables: missing');
    });

    it('should collect unresolved variables from both inside and outside literals', () => {
      expect(() => {
        renderTemplate('{{outside}} {{{inside: "{{inside_var}}"}}}', {}, { strict: true });
      }).toThrow('Missing template variables: inside_var, outside');
    });

    it('should deduplicate unresolved variables', () => {
      // Same variable appears both inside and outside literal
      const result = renderTemplate('{{id}} {{{key: "{{id}}"}}}', {});
      expect(result).toBe(' {key: ""}');
      // Should only warn once for 'id', not twice
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        '[Prompt Smith] 템플릿 변수 미치환: {{id}}'
      );
    });
  });

  describe('Multiline templates', () => {
    it('should handle multiline templates', () => {
      const template = `Line 1: {{var1}}
Line 2: {{var2}}
Line 3: {{var3}}`;
      const result = renderTemplate(template, {
        var1: 'A',
        var2: 'B',
        var3: 'C',
      });
      expect(result).toBe(`Line 1: A
Line 2: B
Line 3: C`);
    });

    it('should preserve newlines and whitespace', () => {
      const template = `  {{indent}}
\t{{tab}}`;
      const result = renderTemplate(template, {
        indent: 'indented',
        tab: 'tabbed',
      });
      expect(result).toBe(`  indented
\ttabbed`);
    });
  });

  describe('Triple brace escape {{{ }}}', () => {
    it('should escape literal content', () => {
      const result = renderTemplate('JSON: {{{key: "val"}}}', {});
      expect(result).toBe('JSON: {key: "val"}');
    });

    it('should handle nested braces in literal', () => {
      const result = renderTemplate('Code: {{{{a: {b: 1}}}}}', {});
      expect(result).toBe('Code: {{a: {b: 1}}}');
    });

    it('should combine variables and literals', () => {
      // Variables inside literals ARE substituted (fixed behavior)
      const result = renderTemplate(
        'pl_submit({{{session_id: "{{id}}"}}})',
        { id: 'abc-123' }
      );
      expect(result).toBe('pl_submit({session_id: "abc-123"})');
    });

    it('should handle multiple literals in template', () => {
      const result = renderTemplate(
        '{{{a}}} and {{{b}}}',
        {}
      );
      expect(result).toBe('{a} and {b}');
    });

    it('should handle multiline literals', () => {
      const result = renderTemplate(
        `{{{
  "key": "value"
}}}`,
        {}
      );
      expect(result).toBe(`{
  "key": "value"
}`);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle plan template pattern', () => {
      // Variables inside literals are substituted
      const template = `세션 {{session_id}}에 대한 계획을 작성하세요.

목표: {{goal}}

완료 후 pl_submit({{{session_id: "{{session_id}}", plan: "작성한 계획"}}})을 호출하세요.`;

      const result = renderTemplate(template, {
        session_id: 'test-123',
        goal: '사용자 인증 구현',
      });

      expect(result).toContain('세션 test-123에 대한 계획을 작성하세요.');
      expect(result).toContain('목표: 사용자 인증 구현');
      expect(result).toContain('pl_submit({session_id: "test-123", plan: "작성한 계획"})');
    });

    it('should handle review template pattern', () => {
      // Variables inside literals are substituted
      const template = `pl_get_plan({{{session_id: "{{session_id}}"}}})로 계획(v{{plan_version}})을 확인하세요.`;

      const result = renderTemplate(template, {
        session_id: 'test-456',
        plan_version: '2',
      });

      expect(result).toBe('pl_get_plan({session_id: "test-456"})로 계획(v2)을 확인하세요.');
    });
  });

  describe('DEFAULT_TEMPLATES', () => {
    it('should have plan template', () => {
      expect(DEFAULT_TEMPLATES.plan).toContain('{{session_id}}');
      expect(DEFAULT_TEMPLATES.plan).toContain('{{goal}}');
    });

    it('should have review template', () => {
      expect(DEFAULT_TEMPLATES.review).toContain('{{session_id}}');
      expect(DEFAULT_TEMPLATES.review).toContain('{{plan_version}}');
    });

    it('should have feedback template', () => {
      expect(DEFAULT_TEMPLATES.feedback).toContain('{{session_id}}');
      expect(DEFAULT_TEMPLATES.feedback).toContain('{{feedback_content}}');
    });
  });
});
