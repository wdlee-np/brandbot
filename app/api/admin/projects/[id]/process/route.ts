import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  return profile ? user : null;
}

// POST /api/admin/projects/[id]/process
// 파일 업로드 완료 후 status를 ready로 전환
// context cache는 generateWithContext()에서 첫 호출 시 자동 시도됨 (BUG-03)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, brand_info_path')
    .eq('id', id)
    .single();

  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  if (!project.brand_info_path) {
    return NextResponse.json({ error: '먼저 브랜드 파일을 업로드해 주세요.' }, { status: 400 });
  }
  if (!['ready', 'draft', 'processing'].includes(project.status)) {
    return NextResponse.json({ error: `현재 상태(${project.status})에서는 처리할 수 없습니다.` }, { status: 400 });
  }

  await supabase.from('projects').update({ status: 'ready' }).eq('id', id);

  return NextResponse.json({ success: true });
}
