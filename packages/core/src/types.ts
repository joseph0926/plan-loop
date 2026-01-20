/**
 * Plan Loop MCP - Type Definitions
 */

// Session status
export type SessionStatus =
  | 'drafting'          // 초기/수정 중
  | 'pending_review'    // 검토 대기
  | 'pending_revision'  // 피드백 받음, 수정 필요
  | 'approved'          // 🟢 승인됨
  | 'exhausted';        // maxIterations 도달, 사용자 판단 필요

// Feedback rating
export type Rating = '🔴' | '🟡' | '🟢';

// Plan entry
export interface Plan {
  version: number;
  content: string;
  submittedAt: string;
}

// Feedback entry
export interface Feedback {
  planVersion: number;    // 자동으로 최신 plan.version 사용
  rating: Rating;
  content: string;
  submittedAt: string;
}

// Session
export interface Session {
  id: string;
  goal: string;
  status: SessionStatus;
  version: number;        // pl_submit마다 +1
  iteration: number;      // 🔴/🟡 피드백마다 +1
  maxIterations: number;  // 기본값 5
  plans: Plan[];
  feedbacks: Feedback[];
  createdAt: string;      // pl_start 시 설정
  updatedAt: string;      // 모든 변경 시 갱신
}

// Response types
export interface ReadyResponse<T> {
  ready: true;
  data: T;
}

export type PendingReason =
  | 'no_plan_submitted'   // plan 없음
  | 'no_feedback_yet'     // feedback 없음
  | 'awaiting_feedback';  // 검토 대기 중

export interface PendingResponse {
  ready: false;
  reason: PendingReason;
}

export type Response<T> = ReadyResponse<T> | PendingResponse;

// Tool input types
export interface PlStartInput {
  goal: string;
  maxIterations?: number;
}

export interface PlSubmitInput {
  session_id: string;
  plan: string;
}

export interface PlGetPlanInput {
  session_id: string;
}

export interface PlFeedbackInput {
  session_id: string;
  rating: Rating;
  content: string;
  plan_version?: number;  // Optimistic concurrency: 제공 시 현재 plan version과 비교
}

export interface PlGetFeedbackInput {
  session_id: string;
}

export interface PlStatusInput {
  session_id: string;
}

export interface PlListInput {
  status?: SessionStatus | SessionStatus[];  // 선택적 필터
  sort?: 'createdAt' | 'updatedAt';          // 기본: updatedAt
  order?: 'asc' | 'desc';                     // 기본: desc
}

export interface PlForceApproveInput {
  session_id: string;
  reason: string;
}

export interface PlDeleteInput {
  session_id: string;
  force?: boolean;  // approved/exhausted 외 상태에서도 삭제 허용
}

// Tool output types
export interface PlStartOutput {
  session_id: string;
}

export interface PlSubmitOutput {
  version: number;
  status: SessionStatus;
}

export interface PlFeedbackOutput {
  status: SessionStatus;
  iteration: number;
}

export interface PlForceApproveOutput {
  status: 'approved';
}

export interface PlListOutput {
  sessions: {
    id: string;
    goal: string;  // 30자(UTF-16 기준) 초과 시 "..." 추가 (최대 33자)
    status: SessionStatus;
  }[];
}

export interface PlDeleteOutput {
  deleted: true;
  session_id: string;
}
