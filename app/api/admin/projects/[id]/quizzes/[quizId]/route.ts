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

// BUG-10-05: step 변경 시 충돌 단계를 뒤로 밀기
// 임시 step(99)을 활용해 UNIQUE(project_id, step) 제약 회피
async function shiftQuizSteps(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  targetId: string,
  oldStep: number,
  newStep: number
): Promise<void> {
  // 1. 대상 퀴즈를 임시 step으로 이동 (UNIQUE 충돌 방지)
  await supabase.from('quizzes').update({ step: 99 }).eq('id', targetId);

  if (newStep < oldStep) {
    // 앞으로 이동: [newStep, oldStep-1] 범위 퀴즈 step+1 (내림차순 처리)
    const { data: affected } = await supabase
      .from('quizzes')
      .select('id, step')
      .eq('project_id', projectId)
      .gte('step', newStep)
      .lt('step', oldStep)
      .order('step', { ascending: false });

    for (const q of (affected ?? [])) {
      await supabase.from('quizzes').update({ step: q.step + 1 }).eq('id', q.id);
    }
  } else {
    // 뒤로 이동: [oldStep+1, newStep] 범위 퀴즈 step-1 (오름차순 처리)
    const { data: affected } = await supabase
      .from('quizzes')
      .select('id, step')
      .eq('project_id', projectId)
      .gt('step', oldStep)
      .lte('step', newStep)
      .order('step', { ascending: true });

    for (const q of (affected ?? [])) {
      await supabase.from('quizzes').update({ step: q.step - 1 }).eq('id', q.id);
    }
  }

  // 2. 대상 퀴즈를 최종 step으로 이동
  await supabase.from('quizzes').update({ step: newStep }).eq('id', targetId);
}

// PATCH /api/admin/projects/[id]/quizzes/[quizId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; quizId: string }> }
) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { id, quizId } = await params;
  let body: { question?: string; answer?: string; step?: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 }); }

  // BUG-10-03: answer 20자 제한
  if (body.answer && body.answer.length > 20) {
    return NextResponse.json({ error: 'answer는 20자 이하여야 합니다.' }, { status: 400 });
  }
  // BUG-10-04: step 범위 1~5
  if (body.step !== undefined && (body.step < 1 || body.step > 5)) {
    return NextResponse.json({ error: 'step은 1~5 사이여야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 현재 퀴즈 조회
  const { data: currentQuiz } = await supabase
    .from('quizzes')
    .select('id, step, question, answer')
    .eq('id', quizId)
    .eq('project_id', id)
    .single();

  if (!currentQuiz) return NextResponse.json({ error: '퀴즈를 찾을 수 없습니다.' }, { status: 404 });

  // BUG-10-05: step 변경 시 충돌 단계 처리
  if (body.step !== undefined && body.step !== currentQuiz.step) {
    await shiftQuizSteps(supabase, id, quizId, currentQuiz.step, body.step);
  }

  // question/answer 업데이트 (step은 shiftQuizSteps에서 처리됨)
  const updateData: Record<string, string | number> = {};
  if (body.question) updateData.question = body.question;
  if (body.answer) updateData.answer = body.answer;

  let finalQuiz = currentQuiz;
  if (Object.keys(updateData).length > 0) {
    const { data, error } = await supabase
      .from('quizzes')
      .update(updateData)
      .eq('id', quizId)
      .select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    finalQuiz = data;
  } else if (body.step !== undefined) {
    // step만 변경된 경우 최신 데이터 재조회
    const { data } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
    if (data) finalQuiz = data;
  }

  return NextResponse.json({ quiz: finalQuiz });
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
