# Release Checklist

## Automated (CI)

The following steps are automated via GitHub Actions (`.github/workflows/release.yml`):

- [ ] `changeset version` - Updates package.json versions
- [ ] `pnpm run changeset:r` - Publishes to npm

## Manual Verification

After a release, verify the following:

### 1. npm Version

```bash
npm view @joseph0926/plan-loop version
# Expected: matches the released version
```

### 2. MCP Server Version

The MCP server dynamically loads its version from `package.json`. Verify with:

```bash
# Option A: Check via Node.js
node --input-type=module -e "
import { createRequire } from 'node:module';
const require = createRequire(new URL('file://' + process.cwd() + '/packages/cli/dist/index.js'));
const pkg = require('../package.json');
console.log('Version:', pkg.version);
"

# Option B: Start server and check stderr logs
node packages/cli/dist/index.js 2>&1 &
PID=$!
sleep 1
kill $PID 2>/dev/null
```

### 3. LobeHub Registry (24-48 hours after npm publish)

- URL: https://lobehub.com/mcp/joseph0926-plan-loop
- Check "Version History" section

**If not automatically updated:**

1. Visit https://lobehub.com/mcp
2. Use "Submit MCP" to request version update
3. Or open an issue at https://github.com/lobehub/lobe-chat/issues

## Version Sources

| Source | Location |
|--------|----------|
| npm package | `npm view @joseph0926/plan-loop version` |
| CLI package.json | `packages/cli/package.json` |
| Core package.json | `packages/core/package.json` |
| MCP Server runtime | Dynamically loaded from package.json |
| LobeHub Registry | https://lobehub.com/mcp/joseph0926-plan-loop |
