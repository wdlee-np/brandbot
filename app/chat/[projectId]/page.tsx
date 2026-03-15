import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function ChatEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { projectId } = await params;
  const { token } = await searchParams;

  // 토큰 없으면 차단
  if (!token) {
    redirect(`/chat/${projectId}/blocked`);
  }

  // 토큰 서명/만료 검증
  const result = verifyToken(token);
  if (!result.valid) {
    redirect(`/chat/${projectId}/blocked`);
  }

  const { payload } = result;

  // 토큰의 projectId와 URL의 projectId 일치 확인
  if (payload.projectId !== projectId) {
    redirect(`/chat/${projectId}/blocked`);
  }

  const supabase = createAdminClient();

  // 프로젝트 존재 여부 + 활성 상태 확인
  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .single();

  if (!project) {
    redirect(`/chat/${projectId}/blocked`);
  }

  if (project.status !== 'active') {
    redirect(`/chat/${projectId}/inactive`);
  }

  // IP 주소 수집 (해시 처리)
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? headersList.get('x-real-ip')
    ?? 'unknown';

  const { createHash } = await import('crypto');
  const ipHash = createHash('sha256').update(ip).digest('hex');
  const tokenHash = hashToken(token);

  // 신규 참여자만 insert — 기존 참여자는 quiz_progress·coupon_issued_at 보존
  const { error: insertError } = await supabase
    .from('participants')
    .insert({
      user_token_hash: tokenHash,
      project_id: projectId,
      ip_hash: ipHash,
      quiz_progress: 0,
      coupon_issued_at: null,
    });

  // 이미 존재하는 참여자 (23505 unique 충돌) → ip_hash만 갱신
  if (insertError && insertError.code === '23505') {
    await supabase
      .from('participants')
      .update({ ip_hash: ipHash })
      .eq('user_token_hash', tokenHash)
      .eq('project_id', projectId);
  }

  // 기존 참여자의 quiz_progress 확인 — 퀴즈 완료 시 바로 reward로
  const [{ data: participant }, { count: quizCount }] = await Promise.all([
    supabase
      .from('participants')
      .select('quiz_progress')
      .eq('user_token_hash', tokenHash)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('quizzes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ]);

  // BUG-10-04: 총 퀴즈 수 기준으로 완료 판정
  const totalQuizzes = quizCount ?? 0;
  if (totalQuizzes > 0 && (participant?.quiz_progress ?? 0) >= totalQuizzes) {
    redirect(`/chat/${projectId}/reward?token=${token}`);
  }

  redirect(`/chat/${projectId}/start?token=${token}`);
}
