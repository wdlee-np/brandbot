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

// BUG-11-01: step 변경 시 충돌 퀴즈와 교체(swap) — 밀기 대신 스왑
// 임시 step(99)을 활용해 UNIQUE(project_id, step) 제약 회피
async function swapOrMoveQuizStep(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  targetId: string,
  oldStep: number,
  newStep: number
): Promise<void> {
  // 목표 step에 충돌하는 퀴즈 조회
  const { data: conflicting } = await supabase
    .from('quizzes')
    .select('id')
    .eq('project_id', projectId)
    .eq('step', newStep)
    .neq('id', targetId)
    .maybeSingle();

  if (conflicting) {
    // 스왑: target → 99(임시) → conflict를 oldStep으로 → target을 newStep으로
    await supabase.from('quizzes').update({ step: 99 }).eq('id', targetId);
    await supabase.from('quizzes').update({ step: oldStep }).eq('id', conflicting.id);
    await supabase.from('quizzes').update({ step: newStep }).eq('id', targetId);
  } else {
    // 충돌 없음: 직접 이동
    await supabase.from('quizzes').update({ step: newStep }).eq('id', targetId);
  }
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

  // BUG-11-01: step 변경 시 충돌 퀴즈와 스왑
  if (body.step !== undefined && body.step !== currentQuiz.step) {
    await swapOrMoveQuizStep(supabase, id, quizId, currentQuiz.step, body.step);
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
