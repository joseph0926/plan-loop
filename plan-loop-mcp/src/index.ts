#!/usr/bin/env node
/**
 * Plan Loop MCP Server
 * Claude-Code와 Codex 간의 비동기 협업을 위한 MCP 서버
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as tools from './tools.js';

// Create server instance
const server = new Server(
  {
    name: 'plan-loop-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOL_DEFINITIONS = [
  {
    name: 'pl_start',
    description: 'Start a new plan loop session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        goal: {
          type: 'string',
          description: 'The goal of this planning session',
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum feedback iterations (default: 5)',
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'pl_submit',
    description: 'Submit a plan for review. Allowed states: drafting, pending_revision',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
        plan: {
          type: 'string',
          description: 'The plan content',
        },
      },
      required: ['session_id', 'plan'],
    },
  },
  {
    name: 'pl_get_plan',
    description: 'Get the latest plan from a session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'pl_feedback',
    description: 'Submit feedback for the latest plan. Allowed states: pending_review',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
        rating: {
          type: 'string',
          enum: ['🔴', '🟡', '🟢'],
          description: 'Feedback rating: 🔴 (major revision), 🟡 (minor revision), 🟢 (approved)',
        },
        content: {
          type: 'string',
          description: 'Feedback content',
        },
      },
      required: ['session_id', 'rating', 'content'],
    },
  },
  {
    name: 'pl_get_feedback',
    description: 'Get the latest feedback for a session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'pl_status',
    description: 'Get the full status of a session',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'pl_list',
    description: 'List all plan loop sessions. Supports filtering by status and sorting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          oneOf: [
            { type: 'string', enum: ['drafting', 'pending_review', 'pending_revision', 'approved', 'exhausted'] },
            { type: 'array', items: { type: 'string', enum: ['drafting', 'pending_review', 'pending_revision', 'approved', 'exhausted'] } },
          ],
          description: 'Filter by status (single value or array)',
        },
        sort: {
          type: 'string',
          enum: ['createdAt', 'updatedAt'],
          description: 'Sort field (default: updatedAt)',
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order (default: desc)',
        },
      },
    },
  },
  {
    name: 'pl_force_approve',
    description: 'Force approve an exhausted session. Allowed states: exhausted',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
        reason: {
          type: 'string',
          description: 'Reason for force approval',
        },
      },
      required: ['session_id', 'reason'],
    },
  },
  {
    name: 'pl_delete',
    description: 'Delete a session. By default only approved/exhausted sessions can be deleted. Use force=true to delete active sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID',
        },
        force: {
          type: 'boolean',
          description: 'Force delete even if session is active (default: false)',
        },
      },
      required: ['session_id'],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOL_DEFINITIONS,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[plan-loop] Tool called: ${name}`);

  // 전역 입력 가드: 객체가 아니면 빈 객체로 대체
  // 비객체 인자는 각 도구 함수 내 검증에서 "필수 필드 누락" 에러로 처리됨
  const input: unknown =
    typeof args === 'object' && args !== null && !Array.isArray(args)
      ? args
      : {};

  switch (name) {
    case 'pl_start':
      return tools.plStart(input as Parameters<typeof tools.plStart>[0]);

    case 'pl_submit':
      return tools.plSubmit(input as Parameters<typeof tools.plSubmit>[0]);

    case 'pl_get_plan':
      return tools.plGetPlan(input as Parameters<typeof tools.plGetPlan>[0]);

    case 'pl_feedback':
      return tools.plFeedback(input as Parameters<typeof tools.plFeedback>[0]);

    case 'pl_get_feedback':
      return tools.plGetFeedback(input as Parameters<typeof tools.plGetFeedback>[0]);

    case 'pl_status':
      return tools.plStatus(input as Parameters<typeof tools.plStatus>[0]);

    case 'pl_list':
      return tools.plList(input as Parameters<typeof tools.plList>[0]);

    case 'pl_force_approve':
      return tools.plForceApprove(input as Parameters<typeof tools.plForceApprove>[0]);

    case 'pl_delete':
      return tools.plDelete(input as Parameters<typeof tools.plDelete>[0]);

    default:
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      };
  }
});

// Start server
async function main() {
  console.error('[plan-loop] Starting MCP server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[plan-loop] MCP server connected');
}

main().catch((err) => {
  console.error('[plan-loop] Fatal error:', err);
  process.exit(1);
});
