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

// PATCH /api/admin/projects/[id]/quizzes/[quizId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id, quizId } = await params;
  let body: { question?: string; answer?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 }); }

  if (body.answer && body.answer.length > 10) {
    return NextResponse.json({ error: 'answer는 10자 이하여야 합니다.' }, { status: 400 });
  }

  const updateData: Record<string, string> = {};
  if (body.question) updateData.question = body.question;
  if (body.answer) updateData.answer = body.answer;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('quizzes')
    .update(updateData)
    .eq('id', quizId)
    .eq('project_id', id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '퀴즈를 찾을 수 없습니다.' }, { status: 404 });

  return NextResponse.json({ quiz: data });
}

// DELETE /api/admin/projects/[id]/quizzes/[quizId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id, quizId } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('quizzes').delete().eq('id', quizId).eq('project_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
