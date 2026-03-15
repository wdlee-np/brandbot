// ============================
// DB 테이블 타입 정의
// ============================

export type GeminiModel =
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-2.5-flash'
  | 'gemini-3.1-pro-preview';

export const GEMINI_MODEL_OPTIONS: { value: GeminiModel; label: string }[] = [
  { value: 'gemini-3.1-flash-lite-preview', label: 'Flash Lite (최고 가성비)' },
  { value: 'gemini-2.5-flash', label: 'Flash 2.5 (표준 성능)' },
  { value: 'gemini-3.1-pro-preview', label: 'Pro (고성능 추론)' },
];

/** 브랜드 프로젝트 */
export interface Project {
  id: string;
  brand_name: string;
  project_name: string;
  persona_config: {
    keywords: string[];
  };
  brand_info_path: string | null;
  coupon_url: string;
  coupon_name: string;
  context_cache_id: string | null;
  gemini_model: GeminiModel;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

/** 퀴즈 (프로젝트당 3개) */
export interface Quiz {
  id: string;
  project_id: string;
  step: 1 | 2 | 3;
  question: string;
  answer: string; // 10자 이내
  created_at: string;
}

/** 사용자 참여자 */
export interface Participant {
  id: string;
  user_token_hash: string;
  project_id: string;
  device_fingerprint: string | null;
  ip_hash: string | null;
  quiz_progress: 0 | 1 | 2 | 3;
  coupon_issued_at: string | null;
  created_at: string;
}

/** 발급된 쿠폰 (중복 방지 테이블) */
export interface IssuedCoupon {
  id: string;
  participant_id: string;
  project_id: string;
  issued_at: string;
}

/** Rate Limiting 카운터 */
export interface RateLimit {
  id: string;
  user_token_hash: string;
  project_id: string;
  request_count: number;
  window_start: string;
}

/** 관리자 프로필 */
export interface AdminProfile {
  id: string;
  user_id: string; // FK → auth.users
  role: 'admin';
  created_at: string;
}

// ============================
// API / 클라이언트 타입
// ============================

/** 채팅 메시지 */
export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

/** 채팅 API 응답 */
export interface ChatApiResponse {
  message: string;
  quizStep: number | null;
  quizQuestion: string | null;
  isQuizMode: boolean;
}

/** HMAC 서명 토큰 페이로드 */
export interface TokenPayload {
  userId: string;
  projectId: string;
  iat: number;
  exp: number;
}

/** 퀴즈 답변 제출 요청 */
export interface QuizSubmitRequest {
  participantId: string;
  projectId: string;
  step: 1 | 2 | 3;
  answer: string;
}

/** 퀴즈 답변 결과 */
export interface QuizSubmitResponse {
  correct: boolean;
  nextStep: number | null;
  allCompleted: boolean;
}
