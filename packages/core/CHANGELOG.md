# @joseph0926/plan-loop-core

## 1.1.0

### Minor Changes

- [`4cba1c8`](https://github.com/joseph0926/plan-loop/commit/4cba1c835b6514e996ef0bb116717c8b85b5db85) Thanks [@joseph0926](https://github.com/joseph0926)! - Featurescore: Add path traversal guard and schema validation for session_id (#13)Prevents directory traversal attacks via malicious session IDsValidates session ID format using Zod schemaBug Fixesvscode: Add curly braces to MCP command string syntax (#12)vscode: Pass planEditorProvider to deleteSessionWithConfirm in viewSession (#11)ChoresReduce Node.js engine requirement from >=24 to >=20 (#14)Improves compatibility with LTS Node.js versions

### Patch Changes

- [#14](https://github.com/joseph0926/plan-loop/pull/14) [`8c3adae`](https://github.com/joseph0926/plan-loop/commit/8c3adaec1ebff4d779c8eb99a36d66556dc48743) Thanks [@joseph0926](https://github.com/joseph0926)! - chore: Node.js 엔진 요구사항을 >=24에서 >=20으로 다운그레이드

  - LTS 버전(Node 20, 22) 사용자의 채택 장벽 제거
  - MCP TypeScript SDK 최소 요구사항(Node 18+)과 일치
  - CI에서 Node 20, 22, 24 매트릭스 테스트 추가

## 1.0.4

### Patch Changes

- chore: bump version to 1.0.4

## 1.0.3

### Patch Changes

- add changesets for automated version management
