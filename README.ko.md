# Plan Loop

Plan Loop는 Claude-Code(계획)와 Codex(검토)가 디스크에 세션 상태를 공유해 비동기 계획-피드백 루프를 수행할 수 있도록 하는 MCP 서버입니다.

## 레포 구성

- plan-loop-mcp/: MCP 서버 (Node.js + TypeScript)
- .mcp.json: 프로젝트용 MCP 서버 등록 예시

## 빠른 시작

1) 서버 빌드

```bash
cd plan-loop-mcp
npm install
npm run build
```

2) MCP 서버 등록

아래 내용을 MCP 설정(프로젝트 .mcp.json 또는 ~/.claude/settings.json)에 추가하세요:

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

3) 도구 사용 예시

```text
pl_start({ goal: "로그인 기능 계획" })
pl_submit({ session_id: "abc123", plan: "1. ..." })
pl_get_plan({ session_id: "abc123" })
pl_feedback({ session_id: "abc123", rating: "🟢", content: "승인" })
```

## 도구 목록

- pl_start: 세션 시작
- pl_submit: 계획 제출
- pl_get_plan: 최신 계획 조회
- pl_feedback: 최신 계획에 대한 피드백 제출
- pl_get_feedback: 최신 피드백 조회
- pl_status: 세션 전체 상태 조회
- pl_list: 전체 세션 목록
- pl_force_approve: exhausted 세션 강제 승인

## 상태 저장 위치

세션 파일은 `~/.plan-loop/sessions/` 아래에 저장됩니다.

## 개발

```bash
npm run dev
npm run build
```

## 추가 문서

자세한 프로토콜/예시는 `plan-loop-mcp/README.md`를 참고하세요.

## 라이선스

MIT
