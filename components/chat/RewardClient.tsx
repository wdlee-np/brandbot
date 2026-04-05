'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ExternalLink, CheckCircle2 } from 'lucide-react';
import BrandAvatar from './BrandAvatar';

interface Props {
  projectId: string;
  token: string;
  brandName: string;
  couponName: string;
  couponUrl: string | null;
  quizCompleted: boolean;
}

interface CouponData {
  couponName: string;
  couponUrl: string;
  issuedAt: string;
  alreadyIssued: boolean;
}

export default function RewardClient({
  projectId,
  token,
  brandName,
  couponName: initialCouponName,
  couponUrl: initialCouponUrl,
  quizCompleted,
}: Props) {
  const [coupon, setCoupon] = useState<CouponData | null>(null);
  const [loading, setLoading] = useState(quizCompleted);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quizCompleted) return;

    fetch(`/api/chat/${projectId}/coupon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err: { error?: string } = await res.json();
          throw new Error(err.error ?? '쿠폰 발급에 실패했습니다.');
        }
        return res.json() as Promise<CouponData>;
      })
      .then((data) => {
        setCoupon(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
        if (initialCouponUrl) {
          setCoupon({
            couponName: initialCouponName,
            couponUrl: initialCouponUrl,
            issuedAt: new Date().toISOString(),
            alreadyIssued: false,
          });
        }
      });
  }, [projectId, token, quizCompleted, initialCouponName, initialCouponUrl]);

  // 퀴즈 미완료 상태
  if (!quizCompleted) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-xs space-y-4">
          <BrandAvatar name={brandName} size="lg" />
          <div>
            <h1 className="text-xl font-semibold">퀴즈를 먼저 완료해 주세요</h1>
            <p className="mt-1 text-sm text-muted-foreground">3단계 퀴즈를 모두 통과해야 쿠폰을 받을 수 있어요.</p>
          </div>
          <Button asChild className="w-full rounded-xl">
            <Link href={`/chat/${projectId}/quiz?token=${token}`}>퀴즈 하러 가기</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 쿠폰 로딩 중
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center">
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">쿠폰을 준비하고 있어요...</p>
        </div>
      </div>
    );
  }

  const displayCoupon = coupon;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs space-y-6">

        {/* 축하 헤더 */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <BrandAvatar name={brandName} size="lg" />
            {/* 완료 배지 */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white fill-white" strokeWidth={0} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">축하합니다! 🎉</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {brandName} 퀴즈를 모두 통과하셨습니다.
            </p>
          </div>
        </div>

        {/* 쿠폰 카드 */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, oklch(0.97 0.05 90) 0%, oklch(0.94 0.08 75) 100%)',
            border: '2px dashed oklch(0.75 0.12 75)',
          }}
        >
          {/* 좌우 반원 노치 (쿠폰 커팅 효과) */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-background" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-5 rounded-full bg-background" />

          <div className="px-6 py-5 space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-700" style={{ letterSpacing: '0.12em' }}>
                {displayCoupon?.alreadyIssued ? '이미 발급된 쿠폰' : '쿠폰 혜택'}
              </p>
              <p className="text-xl font-bold text-amber-900 leading-snug">
                {displayCoupon?.couponName ?? initialCouponName}
              </p>
              {displayCoupon?.issuedAt && (
                <p className="text-xs text-amber-700/70">
                  발급일: {new Date(displayCoupon.issuedAt).toLocaleDateString('ko-KR')}
                </p>
              )}
            </div>

            {displayCoupon?.couponUrl ? (
              <Button
                asChild
                className="w-full h-11 rounded-xl font-semibold gap-2"
                style={{ background: 'oklch(0.65 0.16 65)', color: '#fff' }}
              >
                <a href={displayCoupon.couponUrl} target="_blank" rel="noopener noreferrer">
                  지금 사용하기
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ) : error ? (
              <p className="text-sm text-destructive text-center">{error}</p>
            ) : null}
          </div>
        </div>

        {/* 안내 문구 */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          쿠폰은 1회만 발급됩니다.
          <br />
          동일한 링크로 재접속해도 동일한 쿠폰이 표시됩니다.
        </p>
      </div>
    </div>
  );
}
