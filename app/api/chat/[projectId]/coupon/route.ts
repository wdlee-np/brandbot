import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/chat/[projectId]/coupon
// 퀴즈 3단계 완료 시 쿠폰 지급 (멱등성 보장)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  let body: { token: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { token } = body;
  if (!token) return NextResponse.json({ error: 'token은 필수입니다.' }, { status: 400 });

  // 토큰 검증
  const tokenResult = verifyToken(token);
  if (!tokenResult.valid) {
    return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
  }
  if (tokenResult.payload.projectId !== projectId) {
    return NextResponse.json({ error: '토큰의 프로젝트 ID가 일치하지 않습니다.' }, { status: 401 });
  }

  const tokenHash = hashToken(token);
  const supabase = createAdminClient();

  // 프로젝트 쿠폰 정보 조회
  const { data: project } = await supabase
    .from('projects')
    .select('coupon_name, coupon_url')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });

  // BUG-11-03: 실제 퀴즈 수 기준으로 완료 판정
  const { count: quizCount } = await supabase
    .from('quizzes')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  const requiredProgress = quizCount ?? 1;

  // 참여자 조회 + 퀴즈 완료 여부 서버 재검증
  const { data: participant } = await supabase
    .from('participants')
    .select('id, quiz_progress, coupon_issued_at')
    .eq('user_token_hash', tokenHash)
    .eq('project_id', projectId)
    .single();

  if (!participant) {
    return NextResponse.json({ error: '참여 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (participant.quiz_progress < requiredProgress) {
    return NextResponse.json(
      { error: '퀴즈를 모두 완료해야 쿠폰을 받을 수 있습니다.' },
      { status: 403 }
    );
  }

  // 기발급 여부 확인 (멱등성)
  const { data: existing } = await supabase
    .from('issued_coupons')
    .select('issued_at')
    .eq('participant_id', participant.id)
    .eq('project_id', projectId)
    .single();

  if (existing) {
    // 이미 발급된 경우 동일 쿠폰 정보 반환
    return NextResponse.json({
      couponName: project.coupon_name,
      couponUrl: project.coupon_url,
      issuedAt: existing.issued_at,
      alreadyIssued: true,
    });
  }

  // 쿠폰 발급 (UNIQUE 제약으로 Race Condition 방어)
  const { data: issued, error: insertError } = await supabase
    .from('issued_coupons')
    .insert({ participant_id: participant.id, project_id: projectId })
    .select('issued_at')
    .single();

  if (insertError) {
    // UNIQUE 충돌 = 동시 요청 중 다른 요청이 먼저 발급
    if (insertError.code === '23505') {
      const { data: raceExisting } = await supabase
        .from('issued_coupons')
        .select('issued_at')
        .eq('participant_id', participant.id)
        .eq('project_id', projectId)
        .single();

      return NextResponse.json({
        couponName: project.coupon_name,
        couponUrl: project.coupon_url,
        issuedAt: raceExisting?.issued_at,
        alreadyIssued: true,
      });
    }
    return NextResponse.json({ error: '쿠폰 발급 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // participants.coupon_issued_at 업데이트
  await supabase
    .from('participants')
    .update({ coupon_issued_at: issued.issued_at })
    .eq('id', participant.id);

  return NextResponse.json({
    couponName: project.coupon_name,
    couponUrl: project.coupon_url,
    issuedAt: issued.issued_at,
    alreadyIssued: false,
  });
}
