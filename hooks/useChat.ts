'use client';

import { useState, useCallback, useRef } from 'react';
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

export function useChat({ projectId, token, initialQuizProgress = 0 }: UseChatOptions) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    quizProgress: initialQuizProgress, // BUG-02-04: 0 고정 → DB 값으로 초기화
    currentQuizStep: null,
    currentQuizQuestion: null,
    isQuizMode: false,
    error: null,
    errorCode: null,
  });

  // 히스토리 ref (sessionStorage와 동기화)
  const historyRef = useRef<ChatMessage[]>([]);

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

      try {
        const res = await fetch(`/api/chat/${projectId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            message: userMessage.trim(),
            conversationHistory: historyRef.current.slice(0, -1), // 현재 메시지 제외한 이전 히스토리
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
