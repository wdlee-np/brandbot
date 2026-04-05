import { redirect } from 'next/navigation';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';
import RewardClient from '@/components/chat/RewardClient';

export default async function ChatRewardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { projectId } = await params;
  const { token } = await searchParams;

  if (!token) redirect(`/chat/${projectId}/blocked`);
  const result = verifyToken(token);
  if (!result.valid) redirect(`/chat/${projectId}/blocked`);

  const supabase = createAdminClient();
  const tokenHash = hashToken(token);

  // 참여자 퀴즈 완료 여부 재검증 + 총 퀴즈 수 동적 조회
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

  const totalQuizzes = quizCount ?? 3;
  const quizCompleted = (participant?.quiz_progress ?? 0) >= totalQuizzes;

  const { data: project } = await supabase
    .from('projects')
    .select('brand_name, coupon_name, coupon_url')
    .eq('id', projectId)
    .single();

  if (!project) redirect(`/chat/${projectId}/blocked`);

  return (
    <RewardClient
      projectId={projectId}
      token={token}
      brandName={project.brand_name}
      couponName={project.coupon_name}
      couponUrl={project.coupon_url}
      quizCompleted={quizCompleted}
    />
  );
}
