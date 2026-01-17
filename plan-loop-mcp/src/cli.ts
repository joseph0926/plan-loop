#!/usr/bin/env node
/**
 * Plan Loop CLI
 * Setup MCP server for Claude Code and Codex
 */

import { setupClaude } from './setup/claude.js';
import { setupCodex } from './setup/codex.js';

const HELP_TEXT = `
plan-loop - MCP server for Claude Code and Codex collaboration

Usage:
  plan-loop                     Start MCP server (default)
  plan-loop setup [options]     Configure MCP for Claude Code and/or Codex

Setup Options:
  --claude          Setup Claude Code only (default: project scope)
  --codex           Setup Codex only (always user scope)
  --user            Use user scope for Claude Code (~/.claude.json)
  --help, -h        Show this help message

Examples:
  npx @joseph0926/plan-loop setup              # Setup both Claude + Codex
  npx @joseph0926/plan-loop setup --claude     # Claude Code only (project)
  npx @joseph0926/plan-loop setup --codex      # Codex only
  npx @joseph0926/plan-loop setup --user       # Claude Code user scope
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Setup command
  if (command === 'setup') {
    const claudeOnly = args.includes('--claude');
    const codexOnly = args.includes('--codex');
    const userScope = args.includes('--user');
    const both = !claudeOnly && !codexOnly;

    console.log('🔧 Plan Loop Setup\n');

    let success = true;

    if (both || claudeOnly) {
      const scope = userScope ? 'user' : 'project';
      console.log(`📦 Claude Code (${scope} scope)...`);
      const result = await setupClaude({ scope });
      if (result.success) {
        console.log(`   ✅ ${result.message}\n`);
      } else {
        console.log(`   ❌ ${result.message}\n`);
        success = false;
      }
    }

    if (both || codexOnly) {
      console.log('📦 Codex (user scope)...');
      const result = await setupCodex();
      if (result.success) {
        console.log(`   ✅ ${result.message}\n`);
      } else {
        console.log(`   ❌ ${result.message}\n`);
        success = false;
      }
    }

    if (success) {
      console.log('🎉 Setup complete!\n');
      console.log('Verify with:');
      if (both || claudeOnly) console.log('  claude mcp list');
      if (both || codexOnly) console.log('  codex mcp list');
      console.log('\nOr use /mcp command inside the IDE.');
    } else {
      console.log('⚠️  Setup completed with some errors.');
      process.exit(1);
    }

    return;
  }

  // Default: start MCP server
  if (!command || command.startsWith('-')) {
    // Dynamic import to start MCP server
    await import('./index.js');
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command}`);
  console.log(HELP_TEXT);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
