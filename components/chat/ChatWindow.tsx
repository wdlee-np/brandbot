'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import BrandAvatar from './BrandAvatar';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink } from 'lucide-react';

interface Props {
  projectId: string;
  token: string;
  brandName: string;
  initialQuizProgress?: number;
}

interface CouponData {
  couponName: string;
  couponUrl: string | null;
  issuedAt: string;
  alreadyIssued: boolean;
}

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
    quizTotal,
    errorCode,
    sendMessage,
  } = useChat({
    projectId,
    token,
    initialQuizProgress,
  });

  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const couponFetchedRef = useRef(false);

  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  const prevCountRef = useRef(0);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevCountRef.current) {
      const lastMsg = messages[newCount - 1];
      if (lastMsg?.role === 'model') {
        setStreamingIndex(newCount - 1);
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuizMode]);

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
        .catch(() => { /* 네트워크 오류 시 무시 */ });
    }
  }, [quizProgress, quizTotal, projectId, token]);

  useEffect(() => {
    if (errorCode === 401) {
      router.replace(`/chat/${projectId}/blocked`);
    }
  }, [errorCode, projectId, router]);

  const showRetry = errorCode === 0 && !isLoading;
  const quizDone = quizTotal > 0 && quizProgress >= quizTotal;

  return (
    <div className="flex justify-center min-h-[100dvh] bg-muted/20">
      <div className="flex flex-col h-[100dvh] w-full max-w-[480px] bg-background border-x">

        {/* 헤더 */}
        <div className="flex items-center gap-3 border-b px-4 py-3 bg-background">
          <BrandAvatar name={brandName} size="sm" />
          <div>
            <p className="text-sm font-semibold">{brandName} 챗봇</p>
            <p className="text-xs text-muted-foreground">브랜드 AI 어시스턴트</p>
          </div>
        </div>

        {/* 퀴즈 진행 표시 */}
        {quizProgress > 0 && <QuizProgress current={quizProgress} total={quizTotal} />}

        {/* 메시지 목록 */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8 px-6">
              <p className="text-muted-foreground text-sm leading-relaxed">
                안녕하세요! {brandName}에 대해 무엇이든 물어보세요 😊
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.timestamp + i}
              message={msg}
              brandName={brandName}
              isQuizMode={isQuizMode && msg.role === 'model' && i === messages.length - 1}
              isStreaming={streamingIndex === i}
            />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2.5 px-4">
              <BrandAvatar name={brandName} size="sm" />
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

          {/* 퀴즈 완료 후 인라인 쿠폰 카드 */}
          {quizDone && (
            <div className="flex items-start gap-2.5 px-4">
              <BrandAvatar name={brandName} size="sm" />
              <div className="max-w-[75%] rounded-2xl rounded-tl-sm border border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 px-4 py-3 text-sm space-y-2">
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">🎉 퀴즈를 모두 통과하셨습니다!</p>
                {coupon ? (
                  <>
                    <p className="text-emerald-700 dark:text-emerald-300 text-xs">
                      {coupon.alreadyIssued ? '이전에 발급된 쿠폰입니다.' : '쿠폰이 발급되었습니다.'}
                    </p>
                    <p className="font-semibold text-emerald-900 dark:text-emerald-100">{coupon.couponName}</p>
                    {coupon.couponUrl && (
                      <a
                        href={coupon.couponUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 underline underline-offset-2 hover:text-emerald-900"
                      >
                        쿠폰 사용하기 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-emerald-600 dark:text-emerald-400 text-xs animate-pulse">쿠폰을 준비 중입니다...</p>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 입력창 */}
        <ChatInput
          onSend={sendMessage}
          disabled={isLoading || quizDone}
          placeholder={quizDone ? '퀴즈 완료! 위에서 쿠폰을 확인하세요.' : '메시지를 입력하세요...'}
        />
      </div>
    </div>
  );
}
