'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ChatApiResponse } from '@/types';

interface UseChatOptions {
  projectId: string;
  token: string;
  initialQuizProgress?: number; // BUG-02-04: DB에서 읽어온 초기 진행 상황
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  quizProgress: number;
  currentQuizStep: number | null;
  currentQuizQuestion: string | null;
  isQuizMode: boolean;
  error: string | null;
  errorCode: number | null;
}

// =====================================================================
// BUG-08-06: 퀴즈 세션 상태 (대화 이력과 독립적으로 관리)
// =====================================================================
interface QuizStepState {
  passed: boolean;
  wrongAttempts: number;
}

interface QuizSessionState {
  1: QuizStepState;
  2: QuizStepState;
  3: QuizStepState;
}

const DEFAULT_QUIZ_SESSION: QuizSessionState = {
  1: { passed: false, wrongAttempts: 0 },
  2: { passed: false, wrongAttempts: 0 },
  3: { passed: false, wrongAttempts: 0 },
};

// 로컬 스토리지 키 생성 (토큰 마지막 10자로 사용자 구분)
function storageKey(type: string, projectId: string, token: string): string {
  return `bb_${type}_${projectId}_${token.slice(-10)}`;
}

const MAX_HISTORY_MESSAGES = 40; // 20턴 (user + model 각 1개씩)

function loadHistory(projectId: string, token: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey('history', projectId, token));
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveHistory(history: ChatMessage[], projectId: string, token: string): void {
  try {
    const capped = history.slice(-MAX_HISTORY_MESSAGES);
    localStorage.setItem(storageKey('history', projectId, token), JSON.stringify(capped));
  } catch { /* 스토리지 용량 초과 등 무시 */ }
}

// BUG-08-06: 퀴즈 세션 상태 로드/저장 (대화 이력과 독립적)
function loadQuizSessionState(projectId: string, token: string): QuizSessionState {
  try {
    const raw = localStorage.getItem(storageKey('quiz_state', projectId, token));
    if (!raw) return { ...DEFAULT_QUIZ_SESSION };
    const parsed = JSON.parse(raw) as QuizSessionState;
    // 누락된 단계가 있으면 기본값으로 채움
    return {
      1: parsed[1] ?? { passed: false, wrongAttempts: 0 },
      2: parsed[2] ?? { passed: false, wrongAttempts: 0 },
      3: parsed[3] ?? { passed: false, wrongAttempts: 0 },
    };
  } catch {
    return { ...DEFAULT_QUIZ_SESSION };
  }
}

function saveQuizSessionState(state: QuizSessionState, projectId: string, token: string): void {
  try {
    localStorage.setItem(storageKey('quiz_state', projectId, token), JSON.stringify(state));
  } catch { /* 무시 */ }
}

// 통과한 단계 목록 반환
function getPassedSteps(state: QuizSessionState): number[] {
  return ([1, 2, 3] as const).filter((s) => state[s].passed);
}

export function useChat({ projectId, token, initialQuizProgress = 0 }: UseChatOptions) {
  // BUG-07-01: localStorage에서 대화 이력 복원
  const savedHistory = typeof window !== 'undefined' ? loadHistory(projectId, token) : [];

  // BUG-08-06: localStorage에서 퀴즈 세션 상태 복원
  const savedQuizState = typeof window !== 'undefined'
    ? loadQuizSessionState(projectId, token)
    : ({ ...DEFAULT_QUIZ_SESSION } as QuizSessionState);

  // 서버 DB 진행도와 localStorage 통과 기록 중 큰 값 사용
  const localProgress = getPassedSteps(savedQuizState).length;
  const effectiveProgress = Math.max(initialQuizProgress, localProgress);

  // DB 진행도 반영: initialQuizProgress 기준으로 해당 단계까지 passed = true
  const mergedQuizState: QuizSessionState = { ...savedQuizState };
  for (let s = 1; s <= initialQuizProgress; s++) {
    const step = s as 1 | 2 | 3;
    if (!mergedQuizState[step].passed) {
      mergedQuizState[step] = { ...mergedQuizState[step], passed: true };
    }
  }

  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    quizProgress: effectiveProgress,
    currentQuizStep: null,
    currentQuizQuestion: null,
    isQuizMode: false,
    error: null,
    errorCode: null,
  });

  // 히스토리 ref — BUG-07-01: localStorage에서 초기값 복원
  const historyRef = useRef<ChatMessage[]>(savedHistory);

  // BUG-08-06: 퀴즈 세션 상태 ref (렌더링과 독립적으로 최신 값 유지)
  const quizSessionStateRef = useRef<QuizSessionState>(mergedQuizState);

  // BUG-07-01: localStorage 히스토리를 화면 메시지로 복원
  useEffect(() => {
    if (savedHistory.length > 0) {
      setState((prev) => ({ ...prev, messages: savedHistory }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || state.isLoading) return;

      // 전송 시점의 퀴즈 상태를 캡처 (비동기 호출 후 state 변경 전)
      const wasQuizMode = state.isQuizMode;
      const capturedQuizStep = state.currentQuizStep;

      const userMsg: ChatMessage = {
        role: 'user',
        content: userMessage.trim(),
        timestamp: Date.now(),
      };

      // 사용자 메시지 즉시 표시
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isLoading: true,
        error: null,
      }));

      historyRef.current = [...historyRef.current, userMsg];
      // BUG-07-01: 히스토리 즉시 저장
      saveHistory(historyRef.current, projectId, token);

      // BUG-08-07: passedQuizSteps를 서버에 전달하여 올바른 다음 단계 결정
      const passedSteps = getPassedSteps(quizSessionStateRef.current);

      // BUG-08-04: 퀴즈 답변 컨텍스트 구성 (퀴즈 모드일 때만)
      const quizAnswerContext =
        wasQuizMode && capturedQuizStep !== null
          ? {
              step: capturedQuizStep,
              wrongAttempts: quizSessionStateRef.current[capturedQuizStep as 1 | 2 | 3].wrongAttempts,
            }
          : undefined;

      try {
        const res = await fetch(`/api/chat/${projectId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            message: userMessage.trim(),
            conversationHistory: historyRef.current.slice(0, -1), // 현재 메시지 제외한 이전 히스토리
            passedQuizSteps: passedSteps,         // BUG-08-07: 통과 단계 목록
            quizAnswerContext,                     // BUG-08-04: 퀴즈 답변 판정 컨텍스트
          }),
        });

        if (!res.ok) {
          const err: { error?: string } = await res.json();
          const errorMsg = err.error ?? '오류가 발생했습니다.';
          const errorChatMsg: ChatMessage = {
            role: 'model',
            content: res.status === 429
              ? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
              : res.status === 403
              ? '현재 이벤트가 종료되었습니다.'
              : res.status === 401
              ? '세션이 만료되었습니다.'
              : errorMsg,
            timestamp: Date.now(),
          };
          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, errorChatMsg],
            isLoading: false,
            error: errorMsg,
            errorCode: res.status,
          }));
          return;
        }

        const data: ChatApiResponse = await res.json();
        const botMsg: ChatMessage = {
          role: 'model',
          content: data.message,
          timestamp: Date.now(),
        };

        historyRef.current = [...historyRef.current, botMsg];
        // BUG-07-01: 봇 응답 후 히스토리 저장
        saveHistory(historyRef.current, projectId, token);

        // =====================================================================
        // BUG-08-04/06: 퀴즈 결과 처리
        // =====================================================================
        if (data.quizResult) {
          const { quizResult } = data;
          const step = quizResult.step as 1 | 2 | 3;

          if (quizResult.passed) {
            // 통과 (정답 or 3회 오답 강제 통과): localStorage 업데이트
            const updatedState: QuizSessionState = {
              ...quizSessionStateRef.current,
              [step]: { passed: true, wrongAttempts: quizSessionStateRef.current[step].wrongAttempts },
            };
            quizSessionStateRef.current = updatedState;
            saveQuizSessionState(updatedState, projectId, token);

            const newPassedSteps = getPassedSteps(updatedState);
            const newProgress = Math.max(quizResult.quizProgress, newPassedSteps.length);

            setState((prev) => ({
              ...prev,
              messages: [...prev.messages, botMsg],
              isLoading: false,
              quizProgress: newProgress,
              isQuizMode: false,            // 퀴즈 모드 종료
              currentQuizStep: null,
              currentQuizQuestion: null,
            }));
          } else {
            // 오답: wrongAttempts 증가
            const updatedState: QuizSessionState = {
              ...quizSessionStateRef.current,
              [step]: {
                passed: false,
                wrongAttempts: quizSessionStateRef.current[step].wrongAttempts + 1,
              },
            };
            quizSessionStateRef.current = updatedState;
            saveQuizSessionState(updatedState, projectId, token);

            setState((prev) => ({
              ...prev,
              messages: [...prev.messages, botMsg],
              isLoading: false,
              isQuizMode: true,             // 퀴즈 모드 유지 (재시도)
              currentQuizStep: capturedQuizStep,
              currentQuizQuestion: prev.currentQuizQuestion,
            }));
          }
        } else {
          // 일반 대화 or 새 퀴즈 출제
          if (data.isQuizMode && data.quizStep !== null) {
            // 새 퀴즈 출제 시작: 해당 단계 wrongAttempts 확인 (이미 초기화되어 있어야 함)
            const step = data.quizStep as 1 | 2 | 3;
            const currentStepState = quizSessionStateRef.current[step];
            if (!currentStepState.passed && currentStepState.wrongAttempts > 0) {
              // 새로 출제되는 퀴즈의 오답 횟수는 초기화하지 않음 (기존 시도 유지)
            }
          }

          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, botMsg],
            isLoading: false,
            currentQuizStep: data.quizStep,
            currentQuizQuestion: data.quizQuestion,
            isQuizMode: data.isQuizMode,
          }));
        }
      } catch {
        const errorMsg: ChatMessage = {
          role: 'model',
          content: '네트워크 오류가 발생했습니다. 다시 시도해 주세요.',
          timestamp: Date.now(),
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, errorMsg],
          isLoading: false,
          error: '네트워크 오류',
          errorCode: 0,
        }));
      }
    },
    [projectId, token, state.isLoading, state.isQuizMode, state.currentQuizStep]
  );

  // 퀴즈 진행 상태 수동 업데이트
  const updateQuizProgress = useCallback((newProgress: number) => {
    setState((prev) => ({ ...prev, quizProgress: newProgress }));
  }, []);

  return {
    ...state,
    sendMessage,
    updateQuizProgress,
  };
}
