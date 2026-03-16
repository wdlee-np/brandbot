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

// GET /api/admin/projects/[id] — 프로젝트 상세 + 연관 퀴즈
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });

  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('*')
    .eq('project_id', id)
    .order('step');

  return NextResponse.json({ project, quizzes: quizzes ?? [] });
}

// PATCH /api/admin/projects/[id] — 프로젝트 수정 / 상태 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  // BUG-10-01: inactive/ready → active 상태 전환 처리
  if (body.status === 'active') {
    // BUG-10-01: inactive 포함, BUG-10-04: 1개 이상이면 활성화 가능
    if (!['ready', 'inactive'].includes(project.status)) {
      return NextResponse.json(
        { error: '파일이 업로드된 ready 또는 inactive 상태에서만 활성화할 수 있습니다.' },
        { status: 400 }
      );
    }
    const { count } = await supabase
      .from('quizzes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id);

    if ((count ?? 0) < 1) {
      return NextResponse.json(
        { error: '퀴즈가 1개 이상 등록되어야 활성화할 수 있습니다.' },
        { status: 400 }
      );
    }
    // BUG-11-02: 재활성화 시 캐시 초기화 — 최신 브랜드 정보/퀴즈 반영
    body.context_cache_id = null;
  }

  // active 프로젝트에서 brand_info_path 변경 방지 (DB 트리거와 이중 방어)
  if (project.status === 'active' && body.brand_info_path !== undefined) {
    return NextResponse.json(
      { error: 'active 상태에서는 브랜드 파일을 수정할 수 없습니다.' },
      { status: 400 }
    );
  }

  // 허용 필드만 추출 (brand_info_path는 upload API 전용)
  const allowedFields = ['project_name', 'brand_name', 'persona_config', 'coupon_name', 'coupon_url', 'status', 'gemini_model', 'context_cache_id'];
  const updateData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) updateData[key] = body[key];
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data });
}

// DELETE /api/admin/projects/[id] — 프로젝트 삭제 (draft/inactive만)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', id)
    .single();

  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });

  if (!['draft', 'inactive'].includes(project.status)) {
    return NextResponse.json(
      { error: 'draft 또는 inactive 상태인 프로젝트만 삭제할 수 있습니다.' },
      { status: 400 }
    );
  }

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
