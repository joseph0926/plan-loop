# Plan Loop

Plan Loop는 Claude-Code(설계자)와 Codex(검토자) 간의 비동기 계획 검토 루프를 디스크의 세션 상태 공유를 통해 가능하게 하는 MCP 서버입니다.

## 저장소 구조

- packages/cli/src/: MCP 서버 소스 코드 (Node.js + TypeScript)
- packages/core/src/: MCP 코어 라이브러리 (state + tools)
- packages/vscode/: VSCode 확장 (Marketplace 전용)
- .mcp.json.example: MCP 서버 설정 샘플 (`.mcp.json`으로 복사하여 사용)

## 빠른 시작

1) 설치 및 설정 (권장)

```bash
# npx로 1회 실행 (설치 불필요)
npx @joseph0926/plan-loop setup

# 또는 글로벌 설치
npm install -g @joseph0926/plan-loop
plan-loop setup
```

### 설정 옵션

```bash
plan-loop setup                    # Claude (project) + Codex (user) 모두 설정
plan-loop setup --claude           # Claude Code만 (project scope)
plan-loop setup --claude --user    # Claude Code (user scope, ~/.claude.json)
plan-loop setup --codex            # Codex만 (user scope)
```

2) 수동 등록 (선택)

**Claude Code** - `.mcp.json` (프로젝트) 또는 `~/.claude.json` (사용자)에 추가:

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

**Codex** - `~/.codex/config.toml`에 추가:

```toml
[mcp_servers.plan-loop]
command = "npx"
args = ["-y", "@joseph0926/plan-loop"]
```

3) 도구 사용 예시

```text
pl_start({ goal: "로그인 기능 계획" })
pl_submit({ session_id: "550e8400-e29b-41d4-a716-446655440000", plan: "1. ..." })
pl_get_plan({ session_id: "550e8400-e29b-41d4-a716-446655440000" })
pl_feedback({ session_id: "550e8400-e29b-41d4-a716-446655440000", rating: "🟢", content: "LGTM" })
```

**참고**: `session_id`는 UUIDv4 형식이어야 합니다. 입력은 대소문자 구분 없이 받으며 내부적으로 소문자로 정규화됩니다.

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

### 에러 응답
```typescript
{
  isError: true,
  content: [{ type: "text", text: "Invalid state: current='approved', expected=['drafting']" }]
}
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
> pl_delete({ session_id: "550e8400-e29b-41d4-a716-446655440000" })

// 활성 세션 삭제 (force 필요)
> pl_delete({ session_id: "550e8400-e29b-41d4-a716-446655440000", force: true })
```

## 버전 규칙

| 필드 | 증가 시점 |
|------|-----------|
| `version` | `pl_submit` 호출 시 +1 |
| `iteration` | `pl_feedback`에서 🔴/🟡 시 +1 |

`maxIterations`는 기본값 5이며 **1 이상의 정수**만 허용됩니다.

## 설계 결정

### plan_version을 통한 Optimistic Concurrency
- `pl_feedback`은 선택적 `plan_version` 파라미터 지원
- 제공 시: 현재 plan version과 비교하여 불일치 시 에러 반환
- 미제공 시: 기존 동작 유지 (최신 plan에 자동 매핑, 하위 호환성)

```text
# plan_version 없이 (기본 동작)
pl_feedback({ session_id: "...", rating: "🟢", content: "LGTM" })

# plan_version으로 race condition 방지
pl_feedback({ session_id: "...", rating: "🟢", content: "LGTM", plan_version: 1 })
# → version 불일치 시: "Plan version mismatch: expected=2, provided=1"
```

**참고**: `plan_version`은 1-based 정수입니다 (첫 번째 plan은 version=1).

### 역할 구분
- 서버는 호출자를 검증하지 않음
- Claude-Code는 submit 계열, Codex는 feedback 계열 사용 (약속)

### 상태 영속화
- `~/.plan-loop/sessions/{id}.json`
- Atomic write (temp → rename)

### goal 길이 제한
- `pl_list` 응답에서 goal은 30자(UTF-16 코드 유닛 기준) 초과 시 `...` 추가
- 최대 33자 (30자 + "...")

## 개발

```bash
npm run dev
npm run build
```

## 샘플 설정 파일

프로젝트에 MCP 설정을 추가하려면:

```bash
cp .mcp.json.example .mcp.json
```

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
