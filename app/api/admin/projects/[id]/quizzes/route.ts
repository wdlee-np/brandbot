import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('admin_profiles').select('id').eq('user_id', user.id).single();
  return profile ? user : null;
}

// GET /api/admin/projects/[id]/quizzes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('quizzes').select('*').eq('project_id', id).order('step');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quizzes: data });
}

// POST /api/admin/projects/[id]/quizzes — 수동 퀴즈 추가 (UPSERT)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  let body: { step: number; question: string; answer: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 }); }

  // BUG-10-04: step 범위 1~5로 확장
  if (!body.step || body.step < 1 || body.step > 5) {
    return NextResponse.json({ error: 'step은 1~5 사이여야 합니다.' }, { status: 400 });
  }
  if (!body.question || !body.answer) {
    return NextResponse.json({ error: 'question과 answer는 필수입니다.' }, { status: 400 });
  }
  // BUG-10-03: answer 20자 제한
  if (body.answer.length > 20) {
    return NextResponse.json({ error: 'answer는 20자 이하여야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('quizzes')
    .upsert(
      { project_id: id, step: body.step, question: body.question, answer: body.answer },
      { onConflict: 'project_id,step' }
    )
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quiz: data }, { status: 201 });
}
