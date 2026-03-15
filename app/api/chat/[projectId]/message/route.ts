import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateCache, getModelWithCache, buildSystemPrompt } from '@/services/gemini/cache';
import { DEFAULT_MODEL } from '@/services/gemini/client';
import { checkRateLimit } from '@/services/rateLimit';
import type { ChatMessage, ChatApiResponse, Project } from '@/types';

const MAX_HISTORY_TURNS = 20; // 최대 20턴 (토큰 과다 사용 방지)

// [QUIZ_STEP:N] 마커 추출
function extractQuizStep(text: string): { cleanText: string; quizStep: number | null } {
  const match = text.match(/\[QUIZ_STEP:(\d+)\]/);
  const quizStep = match ? parseInt(match[1]) : null;
  const cleanText = text.replace(/\[QUIZ_STEP:\d+\]\s*/g, '').trim();
  return { cleanText, quizStep };
}

// POST /api/chat/[projectId]/message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  let body: { token: string; message: string; conversationHistory?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { token, message, conversationHistory = [] } = body;
  if (!token || !message) {
    return NextResponse.json({ error: 'token과 message는 필수입니다.' }, { status: 400 });
  }

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

  // Rate Limit 체크
  const rateLimit = await checkRateLimit(tokenHash, projectId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${rateLimit.retryAfterSecs}초 후 다시 시도해 주세요.` },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSecs ?? 60) },
      }
    );
  }

  // 프로젝트 조회
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (project.status !== 'active') {
    return NextResponse.json({ error: '현재 이벤트가 운영 중이 아닙니다.' }, { status: 403 });
  }

  // 참여자 조회 (quiz_progress 확인)
  const { data: participant } = await supabase
    .from('participants')
    .select('quiz_progress')
    .eq('user_token_hash', tokenHash)
    .eq('project_id', projectId)
    .single();

  const quizProgress = participant?.quiz_progress ?? 0;

  // 현재 퀴즈 조회 (다음 출제할 퀴즈)
  const nextStep = quizProgress + 1;
  let currentQuiz = null;
  if (nextStep <= 3) {
    const { data: quiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('project_id', projectId)
      .eq('step', nextStep)
      .single();
    currentQuiz = quiz;
  }

  // Context Cache 조회/생성
  let cacheId: string;
  try {
    cacheId = await getOrCreateCache(project as Project);
  } catch (err) {
    console.error('[chat/message] Cache 오류:', err);
    return NextResponse.json({ error: '서비스 초기화 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // 시스템 프롬프트 (퀴즈 단계 정보 포함)
  const systemPromptWithQuiz = buildSystemPrompt(
    project as Project,
    nextStep <= 3 ? nextStep : 3,
    currentQuiz?.question ?? ''
  );

  // 대화 히스토리 제한 (최대 20턴)
  const limitedHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

  // Gemini API 호출 (Context Cache 사용)
  const model = await getModelWithCache(cacheId, project.gemini_model ?? DEFAULT_MODEL);

  // 캐시 모델은 systemInstruction을 캐시에 포함하므로 별도 전달 불필요
  // 단, 퀴즈 단계가 변할 수 있어 런타임 프롬프트로 추가 컨텍스트 제공
  const contents = [
    ...limitedHistory.map((msg) => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user' as const,
      parts: [
        {
          text: `[현재 퀴즈 단계: ${nextStep <= 3 ? nextStep : '완료'} / 3${currentQuiz ? `, 퀴즈 문제: ${currentQuiz.question}` : ''}]\n\n${message}`,
        },
      ],
    },
  ];

  try {
    const rawText = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });
    const { cleanText, quizStep } = extractQuizStep(rawText);

    const response: ChatApiResponse = {
      message: cleanText,
      quizStep: quizStep,
      quizQuestion: quizStep !== null ? (currentQuiz?.question ?? null) : null,
      isQuizMode: quizStep !== null,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[chat/message] Gemini 오류:', err);
    return NextResponse.json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
