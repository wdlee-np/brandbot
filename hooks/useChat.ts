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

function loadAskedQuizSteps(projectId: string, token: string): number[] {
  try {
    const raw = localStorage.getItem(storageKey('quiz_asked', projectId, token));
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function saveAskedQuizSteps(steps: number[], projectId: string, token: string): void {
  try {
    localStorage.setItem(storageKey('quiz_asked', projectId, token), JSON.stringify(steps));
  } catch { /* 무시 */ }
}

// BUG-07-03: 퀴즈 완료 단계 로컬 스토리지 저장/로드
function loadCompletedSteps(projectId: string, token: string): number[] {
  try {
    const raw = localStorage.getItem(storageKey('quiz_done', projectId, token));
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function saveCompletedStep(step: number, projectId: string, token: string): number[] {
  const steps = loadCompletedSteps(projectId, token);
  if (!steps.includes(step)) steps.push(step);
  try {
    localStorage.setItem(storageKey('quiz_done', projectId, token), JSON.stringify(steps));
  } catch { /* 무시 */ }
  return steps;
}

export function useChat({ projectId, token, initialQuizProgress = 0 }: UseChatOptions) {
  // BUG-07-01: localStorage에서 대화 이력 복원
  const savedHistory = typeof window !== 'undefined' ? loadHistory(projectId, token) : [];
  // BUG-07-03: localStorage에서 완료된 퀴즈 단계 복원
  const savedCompletedSteps = typeof window !== 'undefined' ? loadCompletedSteps(projectId, token) : [];
  // 서버값과 localStorage 값 중 큰 값 사용
  const localProgress = savedCompletedSteps.length;
  const effectiveProgress = Math.max(initialQuizProgress, localProgress);

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
  // 이미 출제한 퀴즈 단계 ref — BUG-07-01: 퀴즈 반복 방지
  const askedQuizStepsRef = useRef<number[]>(
    typeof window !== 'undefined' ? loadAskedQuizSteps(projectId, token) : []
  );

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

      // BUG-02-02: 전송 시점의 퀴즈 상태를 캡처 (비동기 호출 후 state 변경 전)
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

      try {
        const res = await fetch(`/api/chat/${projectId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            message: userMessage.trim(),
            conversationHistory: historyRef.current.slice(0, -1), // 현재 메시지 제외한 이전 히스토리
            askedQuizSteps: askedQuizStepsRef.current, // BUG-07-01: 이미 출제된 퀴즈 단계
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

        // BUG-07-01: 퀴즈 출제 감지 시 askedQuizSteps에 추가
        if (data.quizStep !== null && data.quizStep !== undefined) {
          if (!askedQuizStepsRef.current.includes(data.quizStep)) {
            askedQuizStepsRef.current = [...askedQuizStepsRef.current, data.quizStep];
            saveAskedQuizSteps(askedQuizStepsRef.current, projectId, token);
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

        // BUG-02-02: 퀴즈 모드였다면 답변 판정 API 호출
        if (wasQuizMode && capturedQuizStep !== null) {
          try {
            const quizRes = await fetch(`/api/chat/${projectId}/quiz/answer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, step: capturedQuizStep, answer: userMessage.trim() }),
            });

            if (quizRes.ok) {
              const quizData: { correct: boolean; quizProgress: number; allCompleted: boolean } =
                await quizRes.json();
              if (quizData.correct) {
                // BUG-07-03: 정답 시 localStorage에 완료 단계 저장
                saveCompletedStep(capturedQuizStep, projectId, token);
                setState((prev) => ({ ...prev, quizProgress: quizData.quizProgress }));
              }
            }
          } catch (err) {
            // 판정 실패는 대화 흐름에 영향 없도록 조용히 처리
            if (process.env.NODE_ENV === 'development') console.error('[Quiz] 답변 판정 오류:', err);
          }
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

  // 퀴즈 답변 제출 → 판정 API 호출
  const submitQuizAnswer = useCallback(
    async (step: number, answer: string): Promise<{ correct: boolean; allCompleted: boolean; message: string }> => {
      const res = await fetch(`/api/chat/${projectId}/quiz/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, step, answer }),
      });

      if (!res.ok) {
        const err: { error?: string } = await res.json();
        throw new Error(err.error ?? '퀴즈 판정 오류');
      }

      const data: { correct: boolean; quizProgress: number; message: string; allCompleted: boolean } = await res.json();

      if (data.correct) {
        // BUG-07-03: 정답 시 localStorage에 완료 단계 저장
        saveCompletedStep(step, projectId, token);
        setState((prev) => ({ ...prev, quizProgress: data.quizProgress }));
      }

      return { correct: data.correct, allCompleted: data.allCompleted, message: data.message };
    },
    [projectId, token]
  );

  // 퀴즈 진행 상태 수동 업데이트
  const updateQuizProgress = useCallback((newProgress: number) => {
    setState((prev) => ({ ...prev, quizProgress: newProgress }));
  }, []);

  return {
    ...state,
    sendMessage,
    submitQuizAnswer,
    updateQuizProgress,
  };
}
