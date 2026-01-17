# Plan Loop

Plan Loop는 Claude-Code(설계자)와 Codex(검토자) 간의 비동기 계획 검토 루프를 디스크의 세션 상태 공유를 통해 가능하게 하는 MCP 서버입니다.

## 저장소 구조

- plan-loop-mcp/: MCP 서버 (Node.js + TypeScript)
- .mcp.json: 프로젝트 MCP 서버 등록 예시

## 빠른 시작

1) 서버 빌드

```bash
cd plan-loop-mcp
npm install
npm run build
```

2) MCP 서버 등록

MCP 설정 파일(프로젝트 .mcp.json 또는 ~/.claude/settings.json)에 추가:

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
pl_feedback({ session_id: "abc123", rating: "🟢", content: "LGTM" })
```

## 도구 목록

- pl_start: 세션 시작
- pl_submit: 계획 제출
- pl_get_plan: 최신 계획 조회
- pl_feedback: 최신 계획에 대한 피드백 제출
- pl_get_feedback: 최신 피드백 조회
- pl_status: 전체 세션 데이터 조회
- pl_list: 모든 세션 목록 (필터/정렬 지원)
- pl_delete: 세션 삭제
- pl_force_approve: exhausted 세션 강제 승인

## 에이전트 협업

Claude-Code(설계자)와 Codex(검토자)가 협업하여 계획을 검토합니다.

### 빠른 시작

```text
# 1. Claude-Code: 세션 시작 및 계획 제출
pl_start({ goal: "로그인 기능 구현" })
pl_submit({ session_id: "...", plan: "1. DB 스키마..." })

# 2. Codex: 계획 조회 및 피드백
pl_get_plan({ session_id: "..." })
pl_feedback({ session_id: "...", rating: "🟡", content: "인증 방식 명시 필요" })

# 3. Claude-Code: 피드백 확인 및 수정
pl_get_feedback({ session_id: "..." })
pl_submit({ session_id: "...", plan: "수정된 계획..." })

# 4. Codex: 승인
pl_feedback({ session_id: "...", rating: "🟢", content: "LGTM" })
```

### 역할별 상세 지침

자세한 워크플로우와 피드백 자동완성 가이드는 [AGENTS.md](AGENTS.md) 참조.

## 상태 저장

세션 파일은 `~/.plan-loop/sessions/`에 저장됩니다.

## 개발

```bash
npm run dev
npm run build
```

## 상세 문서

전체 프로토콜 상세 및 예시는 `plan-loop-mcp/README.md` 참조.

## 라이선스

MIT
