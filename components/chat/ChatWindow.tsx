'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink } from 'lucide-react';

interface Props {
  projectId: string;
  token: string;
  brandName: string;
  initialQuizProgress?: number; // BUG-02-04
}

interface CouponData {
  couponName: string;
  couponUrl: string | null;
  issuedAt: string;
  alreadyIssued: boolean;
}

// 상단 퀴즈 진행 표시 (BUG-10-04: total을 동적으로)
function QuizProgress({ current, total = 3 }: { current: number; total?: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-amber-50 dark:bg-amber-950">
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
        퀴즈 진행
      </span>
      <div className="flex gap-1 flex-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < current ? 'bg-amber-500' : 'bg-amber-200 dark:bg-amber-800'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-amber-600 dark:text-amber-400">
        {current}/{total}
      </span>
    </div>
  );
}


export default function ChatWindow({ projectId, token, brandName, initialQuizProgress }: Props) {
  const router = useRouter();
  const {
    messages,
    isLoading,
    isQuizMode,
    quizProgress,
    quizTotal,  // BUG-10-04: 동적 퀴즈 수
    errorCode,
    sendMessage,
  } = useChat({
    projectId,
    token,
    initialQuizProgress, // BUG-02-04
  });

  // BUG-11-03: 쿠폰 상태
  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const couponFetchedRef = useRef(false);

  // 마지막 봇 메시지 인덱스 — 타이핑 애니메이션 대상
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  const prevCountRef = useRef(0);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 새 봇 메시지 도착 시 타이핑 애니메이션 트리거
  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevCountRef.current) {
      const lastMsg = messages[newCount - 1];
      if (lastMsg?.role === 'model') {
        setStreamingIndex(newCount - 1);
        // 텍스트 길이에 비례해 타이핑 완료 후 해제
        const duration = Math.min(lastMsg.content.length * 15 + 500, 6000);
        if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = setTimeout(() => setStreamingIndex(null), duration);
      }
      prevCountRef.current = newCount;
    }
    return () => {
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    };
  }, [messages]);

  // 메시지 추가 시 하단 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuizMode]);

  // BUG-11-03: 퀴즈 완료 감지 → 쿠폰 API 호출 후 채팅창 내 표시
  useEffect(() => {
    if (quizTotal > 0 && quizProgress >= quizTotal && !couponFetchedRef.current) {
      couponFetchedRef.current = true;
      fetch(`/api/chat/${projectId}/coupon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data: CouponData) => setCoupon(data))
        .catch(() => { /* 네트워크 오류 시 무시 — 재시도 없음 */ });
    }
  }, [quizProgress, quizTotal, projectId, token]);

  // 401 — 토큰 만료 시 차단 페이지로 이동
  useEffect(() => {
    if (errorCode === 401) {
      router.replace(`/chat/${projectId}/blocked`);
    }
  }, [errorCode, projectId, router]);

  // 네트워크 오류(errorCode === 0) 시 재시도 버튼 표시
  const showRetry = errorCode === 0 && !isLoading;

  return (
    <div className="flex justify-center min-h-[100dvh] bg-muted/20">
    <div className="flex flex-col h-[100dvh] w-full max-w-[480px] bg-background border-x">
      {/* 헤더 */}
      <div className="flex items-center gap-3 border-b px-4 py-3 bg-background">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
          🤖
        </div>
        <div>
          <p className="text-sm font-medium">{brandName} 챗봇</p>
          <p className="text-xs text-muted-foreground">AI 어시스턴트</p>
        </div>
      </div>

      {/* 퀴즈 진행 표시 — BUG-10-04: quizTotal 동적 전달 */}
      {quizProgress > 0 && <QuizProgress current={quizProgress} total={quizTotal} />}

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">
              안녕하세요! {brandName}에 대해 무엇이든 물어보세요 😊
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.timestamp + i}
            message={msg}
            isQuizMode={isQuizMode && msg.role === 'model' && i === messages.length - 1}
            isStreaming={streamingIndex === i}
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2.5 px-4">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
              🤖
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        {showRetry && (
          <div className="flex justify-center px-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3 w-3" />
              연결 오류 — 페이지 새로고침
            </Button>
          </div>
        )}
        {/* BUG-11-03: 퀴즈 완료 후 쿠폰 카드 (채팅창 내 표시) */}
        {quizTotal > 0 && quizProgress >= quizTotal && (
          <div className="flex items-start gap-2.5 px-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
              🤖
            </div>
            <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800 px-4 py-3 text-sm space-y-2">
              <p className="font-medium text-green-800 dark:text-green-200">🎉 퀴즈를 모두 통과하셨습니다!</p>
              {coupon ? (
                <>
                  <p className="text-green-700 dark:text-green-300 text-xs">
                    {coupon.alreadyIssued ? '이전에 발급된 쿠폰입니다.' : '쿠폰이 발급되었습니다.'}
                  </p>
                  <p className="font-semibold text-green-900 dark:text-green-100">{coupon.couponName}</p>
                  {coupon.couponUrl && (
                    <a
                      href={coupon.couponUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300 underline underline-offset-2 hover:text-green-900"
                    >
                      쿠폰 사용하기 <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </>
              ) : (
                <p className="text-green-600 dark:text-green-400 text-xs animate-pulse">쿠폰을 준비 중입니다...</p>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      {/* BUG-10-04: quizTotal 기준 완료 판정 */}
      <ChatInput
        onSend={sendMessage}
        disabled={isLoading || (quizTotal > 0 && quizProgress >= quizTotal)}
        placeholder={(quizTotal > 0 && quizProgress >= quizTotal) ? '퀴즈 완료! 쿠폰을 확인하세요.' : '메시지를 입력하세요...'}
      />
    </div>
    </div>
  );
}
