---
"@joseph0926/plan-loop": patch
"@joseph0926/plan-loop-core": patch
---

chore: Node.js 엔진 요구사항을 >=24에서 >=20으로 다운그레이드

- LTS 버전(Node 20, 22) 사용자의 채택 장벽 제거
- MCP TypeScript SDK 최소 요구사항(Node 18+)과 일치
- CI에서 Node 20, 22, 24 매트릭스 테스트 추가
