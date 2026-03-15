import { redirect } from 'next/navigation';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';
import ChatPageClient from '@/components/chat/ChatPageClient';

export default async function ChatQuizPage({
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

  const { data: project } = await supabase
    .from('projects')
    .select('brand_name, status')
    .eq('id', projectId)
    .single();

  if (!project) redirect(`/chat/${projectId}/blocked`);
  if (project.status !== 'active') redirect(`/chat/${projectId}/inactive`);

  // BUG-02-04: DB에서 현재 퀴즈 진행 상황 조회
  const tokenHash = hashToken(token);
  const { data: participant } = await supabase
    .from('participants')
    .select('quiz_progress')
    .eq('user_token_hash', tokenHash)
    .eq('project_id', projectId)
    .single();

  const initialQuizProgress = participant?.quiz_progress ?? 0;

  return (
    <ChatPageClient
      projectId={projectId}
      token={token}
      brandName={project.brand_name}
      initialQuizProgress={initialQuizProgress}
    />
  );
}
