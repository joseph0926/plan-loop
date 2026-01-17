/**
 * Claude Code MCP Setup
 * Configures .mcp.json (project) or ~/.claude.json (user)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SetupOptions {
  scope: 'project' | 'user';
}

export interface SetupResult {
  success: boolean;
  message: string;
  filePath?: string;
}

const MCP_CONFIG = {
  command: 'npx',
  args: ['-y', '@joseph0926/plan-loop'],
};

/**
 * Setup Claude Code MCP configuration
 */
export async function setupClaude(options: SetupOptions): Promise<SetupResult> {
  const { scope } = options;

  try {
    if (scope === 'project') {
      return await setupProjectScope();
    } else {
      return await setupUserScope();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to setup Claude: ${message}` };
  }
}

/**
 * Setup project-scoped .mcp.json in current directory
 */
async function setupProjectScope(): Promise<SetupResult> {
  const filePath = path.join(process.cwd(), '.mcp.json');

  let config: Record<string, unknown> = {};

  // Read existing config if exists
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // Invalid JSON, start fresh
      config = {};
    }
  }

  // Ensure mcpServers object exists
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  const mcpServers = config.mcpServers as Record<string, unknown>;

  // Check if plan-loop already exists
  if (mcpServers['plan-loop']) {
    // Update existing configuration
    mcpServers['plan-loop'] = MCP_CONFIG;
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
    return {
      success: true,
      message: `Updated plan-loop in ${filePath}`,
      filePath,
    };
  }

  // Add new configuration
  mcpServers['plan-loop'] = MCP_CONFIG;
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');

  return {
    success: true,
    message: `Added plan-loop to ${filePath}`,
    filePath,
  };
}

/**
 * Setup user-scoped ~/.claude.json
 */
async function setupUserScope(): Promise<SetupResult> {
  const filePath = path.join(os.homedir(), '.claude.json');

  let config: Record<string, unknown> = {};

  // Read existing config if exists
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      config = JSON.parse(content);
    } catch {
      // Invalid JSON, start fresh but warn
      console.log('   ⚠️  Warning: Existing ~/.claude.json was invalid, creating new file');
      config = {};
    }
  }

  // Ensure mcpServers object exists
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  const mcpServers = config.mcpServers as Record<string, unknown>;

  // Check if plan-loop already exists
  if (mcpServers['plan-loop']) {
    mcpServers['plan-loop'] = MCP_CONFIG;
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
    return {
      success: true,
      message: `Updated plan-loop in ${filePath}`,
      filePath,
    };
  }

  // Add new configuration
  mcpServers['plan-loop'] = MCP_CONFIG;
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');

  return {
    success: true,
    message: `Added plan-loop to ${filePath}`,
    filePath,
  };
}
