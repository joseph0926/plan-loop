# Plan Loop

Plan Loop is an MCP server that enables an asynchronous plan review loop between Claude-Code (planner) and Codex (reviewer) by sharing session state on disk.

## Repository layout

- plan-loop-mcp/: MCP server (Node.js + TypeScript)
- .mcp.json: sample project MCP server registration

## Quick start

1) Build the server

```bash
cd plan-loop-mcp
npm install
npm run build
```

2) Register the MCP server

Add the following to your MCP settings (project .mcp.json or ~/.claude/settings.json):

```json
{
  "mcpServers": {
    "plan-loop": {
      "command": "node",
      "args": ["/absolute/path/to/plan-loop-mcp/dist/index.js"]
    }
  }
}
```

3) Use tools (example)

```text
pl_start({ goal: "Plan a login feature" })
pl_submit({ session_id: "abc123", plan: "1. ..." })
pl_get_plan({ session_id: "abc123" })
pl_feedback({ session_id: "abc123", rating: "🟢", content: "LGTM" })
```

## Tool list

- pl_start: start a session
- pl_submit: submit a plan
- pl_get_plan: fetch the latest plan
- pl_feedback: submit feedback for the latest plan
- pl_get_feedback: fetch the latest feedback
- pl_status: fetch full session data
- pl_list: list all sessions (with filter/sort)
- pl_delete: delete a session
- pl_force_approve: approve an exhausted session

## Agent Collaboration

Claude-Code (planner) and Codex (reviewer) collaborate to review plans.

### Quick Start

```text
# 1. Claude-Code: Start session and submit plan
pl_start({ goal: "Implement login feature" })
pl_submit({ session_id: "...", plan: "1. DB schema..." })

# 2. Codex: Fetch plan and provide feedback
pl_get_plan({ session_id: "..." })
pl_feedback({ session_id: "...", rating: "🟡", content: "Please specify auth method" })

# 3. Claude-Code: Check feedback and revise
pl_get_feedback({ session_id: "..." })
pl_submit({ session_id: "...", plan: "Revised plan..." })

# 4. Codex: Approve
pl_feedback({ session_id: "...", rating: "🟢", content: "LGTM" })
```

### Detailed Agent Guidelines

See [AGENTS.md](AGENTS.md) for detailed workflows and feedback auto-completion guide.

## State storage

Session files are stored under `~/.plan-loop/sessions/`.

## Development

```bash
npm run dev
npm run build
```

## More details

See `plan-loop-mcp/README.md` for full protocol details and examples.

## License

MIT
