# Plan Loop MCP

Claude-Code(계획 설계자)와 Codex(계획 검토자) 간의 비동기 협업을 위한 MCP 서버.

## Quick Start

### 1. 설치 및 설정 (권장)

```bash
# Claude Code + Codex 모두 설정 (설치 없이 바로 실행)
npx @joseph0926/plan-loop setup

# 또는 글로벌 설치 후 사용
npm install -g @joseph0926/plan-loop
plan-loop setup
```

### 2. 설정 옵션

```bash
plan-loop setup                    # Claude (project) + Codex (user) 모두 설정
plan-loop setup --claude           # Claude Code만 (project scope)
plan-loop setup --claude --user    # Claude Code (user scope, ~/.claude.json)
plan-loop setup --codex            # Codex만 (user scope)
```

### 3. 설정 확인

```bash
# Claude Code에서
claude mcp list   # 또는 IDE 내에서 /mcp

# Codex에서
codex mcp list    # 또는 IDE 내에서 /mcp
```

---

## 개요

두 개의 독립된 에이전트 세션이 전역 상태 파일(`~/.plan-loop/sessions/`)을 통해 계획-검토-피드백 루프를 수행합니다.

```
[Claude-Code 터미널]          [Codex 터미널]
        │                            │
   MCP 프로세스 A              MCP 프로세스 B
        │                            │
        └──────────┬─────────────────┘
                   │
           ~/.plan-loop/sessions/
                   └── {session_id}.json
```

## 수동 설치 (개발용)

```bash
cd plan-loop-mcp
npm install
npm run build
```

### Claude Code 수동 설정

`~/.claude.json` 또는 프로젝트 `.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "plan-loop": {
      "command": "npx",
      "args": ["-y", "@joseph0926/plan-loop"]
    }
  }
}
```

### Codex 수동 설정

`~/.codex/config.toml`에 추가:

```toml
[mcp_servers.plan-loop]
command = "npx"
args = ["-y", "@joseph0926/plan-loop"]
```

## 도구 목록

| 도구 | 호출자 | 설명 |
|------|--------|------|
| `pl_start` | Claude-Code | 새 세션 시작 |
| `pl_submit` | Claude-Code | 계획 제출 |
| `pl_get_plan` | Codex | 최신 계획 조회 |
| `pl_feedback` | Codex | 피드백 제출 |
| `pl_get_feedback` | Claude-Code | 피드백 조회 |
| `pl_status` | 양쪽 | 세션 상태 조회 |
| `pl_list` | 양쪽 | 전체 세션 목록 (필터/정렬 지원) |
| `pl_force_approve` | 양쪽 | exhausted 상태에서 강제 승인 |
| `pl_delete` | 양쪽 | 세션 삭제 |

## 상태 전이

```
                              pl_start
                                  │
                                  ▼
                            [drafting]
                                  │
                             pl_submit
                                  │
                                  ▼
                          [pending_review]
                                  │
                            pl_feedback
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
    🔴 / 🟡                      🟢                   iteration >= max
        │                         │                         │
        ▼                         ▼                         ▼
[pending_revision]           [approved]              [exhausted]
        │                         │                         │
   pl_submit                  pl_delete               pl_force_approve
        │                         │                         │
        ▼                         ▼                         ▼
[pending_review]              [deleted]               [approved]
```

## 세션 관리

### pl_list 필터링 및 정렬

```
// status 필터
> pl_list({ status: "approved" })
> pl_list({ status: ["drafting", "pending_review"] })

// 정렬
> pl_list({ sort: "createdAt", order: "asc" })
> pl_list({ sort: "updatedAt", order: "desc" })  // 기본값
```

### pl_delete 세션 삭제

```
// approved/exhausted 세션 삭제
> pl_delete({ session_id: "abc123" })
{ deleted: true, session_id: "abc123" }

// 활성 세션 삭제 (force 필요)
> pl_delete({ session_id: "abc123", force: true })
{ deleted: true, session_id: "abc123" }

// 활성 세션 삭제 시도 (force 없이)
> pl_delete({ session_id: "abc123" })
// Error: Cannot delete active session (status='drafting'). Use force=true to override
```

## 사용 예시

### 터미널 A (Claude-Code)

```
> pl_start({ goal: "로그인 기능 구현" })
{ session_id: "abc123" }

> pl_submit({ session_id: "abc123", plan: "1. DB 스키마 설계\n2. API 엔드포인트..." })
{ version: 1, status: "pending_review" }

// Codex 피드백 대기 후...

> pl_get_feedback({ session_id: "abc123" })
{ ready: true, data: { planVersion: 1, rating: "🟡", content: "인증 방식 명시 필요" } }

> pl_submit({ session_id: "abc123", plan: "수정된 계획..." })
{ version: 2, status: "pending_review" }
```

### 터미널 B (Codex)

```
> pl_get_plan({ session_id: "abc123" })
{ ready: true, data: { version: 1, content: "1. DB 스키마 설계..." } }

> pl_feedback({ session_id: "abc123", rating: "🟡", content: "인증 방식 명시 필요" })
{ status: "pending_revision", iteration: 1 }

// Claude-Code 수정 대기 후...

> pl_get_plan({ session_id: "abc123" })
{ ready: true, data: { version: 2, content: "수정된 계획..." } }

> pl_feedback({ session_id: "abc123", rating: "🟢", content: "LGTM" })
{ status: "approved", iteration: 1 }
```

## 응답 형식

### 성공 응답 (데이터 있음)
```typescript
{ ready: true, data: { ... } }
```

### 대기 응답 (데이터 없음)
```typescript
{ ready: false, reason: "no_plan_submitted" | "no_feedback_yet" | "awaiting_feedback" }
```

#### Pending reason 매핑
- `pl_get_plan`: plan 없음 → `no_plan_submitted`
- `pl_get_feedback`:
  - plan 없음 → `no_plan_submitted`
  - 최신 plan에 대한 피드백 대기 → `awaiting_feedback`
  - 기타 피드백 없음 → `no_feedback_yet`

### 에러 응답 (잘못된 상태)
```typescript
// MCP SDK isError 형식
{
  isError: true,
  content: [{ type: "text", text: "Invalid state: current='approved', expected=['drafting']" }]
}
```

## 버전 규칙

| 필드 | 증가 시점 |
|------|-----------|
| `version` | `pl_submit` 호출 시 +1 |
| `iteration` | `pl_feedback`에서 🔴/🟡 시 +1 |

`maxIterations`는 기본값 5이며 **1 이상의 정수**만 허용됩니다.

## 설계 결정

### 최신 plan 자동 매핑
- `pl_feedback`은 항상 최신 plan에 매핑됨
- planVersion 파라미터 없음 (단순화)
- **Trade-off**: 동시 호출 시 race condition 가능 → 운영 규칙으로 관리

### 역할 구분
- 서버는 호출자를 검증하지 않음
- Claude-Code는 submit 계열, Codex는 feedback 계열 사용 (약속)

### 상태 영속화
- `~/.plan-loop/sessions/{id}.json`
- Atomic write (temp → rename)

### goal 길이 제한
- `pl_list` 응답에서 goal은 30자(UTF-16 코드 유닛 기준) 초과 시 `...` 추가
- 최대 33자 (30자 + "...")

## 테스트

```bash
npm test              # 테스트 실행
npm run test:watch    # 워치 모드
npm run test:coverage # 커버리지 리포트
```

테스트 격리를 위해 `PLAN_LOOP_STATE_DIR` 환경변수를 지원합니다:

```bash
PLAN_LOOP_STATE_DIR=/tmp/test-sessions npm test
```

## 라이선스

MIT
