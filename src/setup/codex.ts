/**
 * Codex MCP Setup
 * Configures ~/.codex/config.toml
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import TOML from '@iarna/toml';

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
 * Setup Codex MCP configuration in ~/.codex/config.toml
 */
export async function setupCodex(): Promise<SetupResult> {
  try {
    const codexDir = path.join(os.homedir(), '.codex');
    const filePath = path.join(codexDir, 'config.toml');

    // Ensure ~/.codex directory exists
    if (!fs.existsSync(codexDir)) {
      fs.mkdirSync(codexDir, { recursive: true });
    }

    let config: Record<string, unknown> = {};

    // Read existing config if exists
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        config = TOML.parse(content) as Record<string, unknown>;
        console.log('   ⚠️  Note: TOML comments may be lost during update');
      } catch (parseError) {
        // Invalid TOML, start fresh but warn
        console.log('   ⚠️  Warning: Existing config.toml was invalid, creating new file');
        config = {};
      }
    }

    // Ensure mcp_servers object exists
    if (!config.mcp_servers || typeof config.mcp_servers !== 'object') {
      config.mcp_servers = {};
    }

    const mcpServers = config.mcp_servers as Record<string, unknown>;

    // Check if plan-loop already exists
    const existed = !!mcpServers['plan-loop'];
    mcpServers['plan-loop'] = MCP_CONFIG;

    // Write back to file
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tomlContent = TOML.stringify(config as any);
    fs.writeFileSync(filePath, tomlContent);

    const action = existed ? 'Updated' : 'Added';
    return {
      success: true,
      message: `${action} plan-loop in ${filePath}`,
      filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to setup Codex: ${message}` };
  }
}
