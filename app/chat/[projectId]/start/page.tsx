import { redirect } from 'next/navigation';
import Link from 'next/link';
import { verifyToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import BrandAvatar from '@/components/chat/BrandAvatar';

export default async function ChatStartPage({
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
    .select('brand_name, project_name, coupon_name')
    .eq('id', projectId)
    .eq('status', 'active')
    .single();

  if (!project) redirect(`/chat/${projectId}/blocked`);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs space-y-6">

        {/* 브랜드 아이덴티티 */}
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandAvatar name={project.brand_name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.brand_name} 챗봇</h1>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              브랜드 이야기를 나누고 퀴즈를 통과하면
              <br />
              <strong className="text-foreground">{project.coupon_name}</strong>을 받을 수 있어요!
            </p>
          </div>
        </div>

        {/* 참여 방법 */}
        <div className="rounded-xl border bg-muted/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">참여 방법</p>
          <ol className="space-y-2">
            {[
              { step: '1', text: '챗봇과 브랜드 이야기를 나눠요' },
              { step: '2', text: '3단계 퀴즈에 도전해요' },
              { step: '3', text: '모두 통과하면 쿠폰 획득!' },
            ].map(({ step, text }) => (
              <li key={step} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                  {step}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </div>

        {/* CTA */}
        <Button asChild className="w-full h-12 text-base rounded-xl">
          <Link href={`/chat/${projectId}/quiz?token=${token}`}>
            대화 시작하기 →
          </Link>
        </Button>
      </div>
    </div>
  );
}
