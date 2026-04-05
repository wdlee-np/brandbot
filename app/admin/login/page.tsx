'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
});

type LoginForm = z.infer<typeof loginSchema>;

// BrandBot 어드민 브랜드 컬러
const BB = {
  bg: 'oklch(0.09 0.012 250)',
  surface: 'oklch(0.15 0.015 250)',
  surfaceHover: 'oklch(0.18 0.015 250)',
  border: 'oklch(1 0 0 / 9%)',
  borderSubtle: 'oklch(1 0 0 / 6%)',
  muted: 'oklch(0.55 0.01 250)',
  text: 'oklch(0.92 0.005 250)',
  accent: 'oklch(0.78 0.14 65)',       // 앰버 골드
  accentDim: 'oklch(0.78 0.14 65 / 15%)',
  accentFocus: 'oklch(0.78 0.14 65 / 40%)',
  accentText: 'oklch(0.16 0.04 65)',   // 앰버 위 어두운 텍스트
  error: 'oklch(0.65 0.2 25)',
  errorDim: 'oklch(0.65 0.2 25 / 12%)',
  errorBorder: 'oklch(0.65 0.2 25 / 30%)',
  inputBg: 'oklch(0.12 0.012 250)',
  inputBorder: 'oklch(1 0 0 / 12%)',
} as const;

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (authError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    router.push('/admin');
    router.refresh();
  };

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{
        background: BB.bg,
        backgroundImage: `radial-gradient(circle, oklch(0.22 0.02 250 / 0.5) 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      }}
    >
      {/* 배경 그라디언트 오버레이 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.78 0.14 65 / 0.05) 0%, transparent 70%)`,
        }}
        aria-hidden
      />

      {/* 브랜드 워드마크 */}
      <div className="relative mb-8 flex flex-col items-center gap-3">
        {/* 로고 아이콘 */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold tracking-tight"
          style={{
            background: BB.accentDim,
            border: `1px solid ${BB.accent}`,
            color: BB.accent,
            boxShadow: `0 0 20px ${BB.accentDim}`,
            fontSize: '13px',
            letterSpacing: '0.05em',
          }}
        >
          BB
        </div>

        {/* 서비스명 */}
        <div className="flex items-baseline gap-0.5" style={{ fontFamily: 'var(--font-geist-sans)' }}>
          <span
            className="text-2xl font-semibold tracking-tight"
            style={{ color: BB.text }}
          >
            Brand
          </span>
          <span
            className="text-2xl font-semibold tracking-tight"
            style={{ color: BB.accent }}
          >
            Bot
          </span>
        </div>

        <p
          className="text-xs font-medium tracking-widest uppercase"
          style={{ color: BB.muted, letterSpacing: '0.15em' }}
        >
          Admin Console
        </p>
      </div>

      {/* 로그인 카드 */}
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl"
        style={{
          background: BB.surface,
          border: `1px solid ${BB.border}`,
          boxShadow: `0 24px 48px oklch(0 0 0 / 0.4), 0 1px 0 oklch(1 0 0 / 0.06) inset`,
        }}
      >
        {/* 카드 상단 앰버 라인 */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${BB.accent}, transparent)` }}
          aria-hidden
        />

        <div className="px-7 pb-7 pt-6">
          {/* 카드 헤더 */}
          <div className="mb-6">
            <h1
              className="text-base font-semibold"
              style={{ color: BB.text }}
            >
              어드민 로그인
            </h1>
            <p
              className="mt-0.5 text-sm"
              style={{ color: BB.muted }}
            >
              관리자 계정으로 로그인하세요
            </p>
          </div>

          {/* 인증 오류 알림 — 폼 최상단 */}
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm"
              style={{
                background: BB.errorDim,
                border: `1px solid ${BB.errorBorder}`,
                color: BB.error,
              }}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 로그인 폼 */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* 이메일 */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-xs font-medium"
                style={{ color: BB.muted }}
              >
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@yourcompany.com"
                autoComplete="email"
                autoFocus
                className="h-10 text-sm transition-all"
                style={{
                  background: BB.inputBg,
                  border: `1px solid ${errors.email ? BB.errorBorder : BB.inputBorder}`,
                  color: BB.text,
                  '--tw-ring-color': BB.accentFocus,
                } as React.CSSProperties}
                {...register('email')}
              />
              {errors.email && (
                <p
                  role="alert"
                  className="text-xs"
                  style={{ color: BB.error }}
                >
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-xs font-medium"
                style={{ color: BB.muted }}
              >
                비밀번호
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="h-10 pr-10 text-sm transition-all"
                  style={{
                    background: BB.inputBg,
                    border: `1px solid ${errors.password ? BB.errorBorder : BB.inputBorder}`,
                    color: BB.text,
                    '--tw-ring-color': BB.accentFocus,
                  } as React.CSSProperties}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 transition-opacity hover:opacity-100"
                  style={{ color: BB.muted, opacity: 0.7 }}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p
                  role="alert"
                  className="text-xs"
                  style={{ color: BB.error }}
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* 로그인 버튼 */}
            <Button
              type="submit"
              className="mt-2 h-10 w-full text-sm font-semibold transition-all"
              disabled={isSubmitting}
              style={{
                background: isSubmitting
                  ? `oklch(0.65 0.10 65)`
                  : BB.accent,
                color: BB.accentText,
                border: 'none',
                boxShadow: isSubmitting ? 'none' : `0 0 20px ${BB.accentDim}`,
              }}
            >
              {isSubmitting ? '로그인 중...' : '로그인'}
            </Button>
          </form>
        </div>

        {/* 카드 푸터 — 비밀번호 찾기 */}
        <div
          className="flex items-center justify-center px-7 py-4"
          style={{ borderTop: `1px solid ${BB.borderSubtle}` }}
        >
          <p className="text-xs" style={{ color: BB.muted }}>
            접속 문제가 있으신가요?{' '}
            <a
              href="mailto:support@brandbot.co.kr"
              className="underline-offset-2 hover:underline"
              style={{ color: BB.accent }}
            >
              지원팀에 문의
            </a>
          </p>
        </div>
      </div>

      {/* 페이지 푸터 */}
      <p className="mt-8 text-xs" style={{ color: `oklch(0.38 0.008 250)` }}>
        © 2026 BrandBot. 관리자 전용 영역입니다.
      </p>
    </div>
  );
}
