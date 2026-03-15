import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, hashToken } from '@/lib/token';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt, generateWithContext } from '@/services/gemini/cache';
import { DEFAULT_MODEL } from '@/services/gemini/client';
import { checkRateLimit } from '@/services/rateLimit';
import { judgeAnswer } from '@/services/quiz/judge';
import type { ChatMessage, ChatApiResponse, Project, QuizResult } from '@/types';

const MAX_HISTORY_TURNS = 20;

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

  let body: {
    token: string;
    message: string;
    conversationHistory?: ChatMessage[];
    passedQuizSteps?: number[];           // BUG-08-07: 클라이언트 localStorage 통과 단계
    quizAnswerContext?: {                  // BUG-08-04: 퀴즈 답변 판정 컨텍스트
      step: number;
      wrongAttempts: number;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const {
    token,
    message,
    conversationHistory = [],
    passedQuizSteps = [],
    quizAnswerContext,
  } = body;

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

  const dbQuizProgress = participant?.quiz_progress ?? 0;

  // BUG-08-07: 클라이언트 localStorage 통과 기록과 DB 중 큰 값 사용
  const localProgress = passedQuizSteps.length;
  const effectiveProgress = Math.max(dbQuizProgress, localProgress);
  const nextStep = effectiveProgress + 1;

  // 다음 출제할 퀴즈 조회
  let currentQuiz: { id: string; step: number; question: string; answer: string } | null = null;
  if (nextStep <= 3) {
    const { data: quiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('project_id', projectId)
      .eq('step', nextStep)
      .single();
    currentQuiz = quiz;
  }

  // 대화 히스토리 제한 (최대 20턴)
  const limitedHistory = conversationHistory.slice(-MAX_HISTORY_TURNS);

  // =====================================================================
  // BUG-08-04/05: 퀴즈 답변 판정 로직
  // =====================================================================
  let quizResult: QuizResult | undefined;
  let quizInstruction = '';
  let isAnsweringQuiz = false;

  if (quizAnswerContext) {
    isAnsweringQuiz = true;
    const { step: answerStep, wrongAttempts } = quizAnswerContext;

    // 해당 단계 퀴즈 조회 (답변 판정용)
    const { data: targetQuiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('project_id', projectId)
      .eq('step', answerStep)
      .single();

    if (targetQuiz) {
      const isCorrect = judgeAnswer(message, targetQuiz.answer);

      if (isCorrect) {
        // 정답: DB quiz_progress 업데이트
        const newProgress = Math.max(dbQuizProgress, answerStep);
        await supabase
          .from('participants')
          .update({ quiz_progress: newProgress })
          .eq('user_token_hash', tokenHash)
          .eq('project_id', projectId);

        quizInstruction = `[퀴즈_판정: ${answerStep}단계 정답! 정답을 맞혔음을 축하해주세요. 격려 메시지로 마무리. [QUIZ_STEP] 마커 사용 금지.]`;
        quizResult = {
          correct: true,
          passed: true,
          revealed: false,
          step: answerStep,
          quizProgress: newProgress,
        };
      } else if (wrongAttempts === 0) {
        // 1회 오답: 첫 번째 힌트
        quizInstruction = `[퀴즈_판정: ${answerStep}단계 오답 (1회째). 틀렸음을 알리고 첫 번째 힌트를 제공하세요. 힌트 제공 시 정답 단어("${targetQuiz.answer}")와 동일하거나 포함하는 표현 절대 사용 금지. 간접적인 힌트(속성, 특징, 연상 단어)만 사용. [QUIZ_STEP] 마커 사용 금지.]`;
        quizResult = {
          correct: false,
          passed: false,
          revealed: false,
          step: answerStep,
          quizProgress: dbQuizProgress,
        };
      } else if (wrongAttempts === 1) {
        // 2회 오답: 두 번째 힌트
        quizInstruction = `[퀴즈_판정: ${answerStep}단계 오답 (2회째). 틀렸음을 알리고 두 번째 힌트를 제공하세요 (첫 번째 힌트보다 더 구체적으로). 힌트 제공 시 정답 단어("${targetQuiz.answer}")와 동일하거나 포함하는 표현 절대 사용 금지. 간접적인 힌트만 사용. [QUIZ_STEP] 마커 사용 금지.]`;
        quizResult = {
          correct: false,
          passed: false,
          revealed: false,
          step: answerStep,
          quizProgress: dbQuizProgress,
        };
      } else {
        // 3회 이상 오답: 강제 통과 + 정답 공개
        const newProgress = Math.max(dbQuizProgress, answerStep);
        await supabase
          .from('participants')
          .update({ quiz_progress: newProgress })
          .eq('user_token_hash', tokenHash)
          .eq('project_id', projectId);

        quizInstruction = `[퀴즈_판정: ${answerStep}단계 오답 (3회째). 안타깝게도 정답을 맞히지 못했음을 알리고, 정답은 "${targetQuiz.answer}"임을 알려주세요. 격려 메시지로 마무리. [QUIZ_STEP] 마커 사용 금지.]`;
        quizResult = {
          correct: false,
          passed: true,
          revealed: true,
          step: answerStep,
          quizProgress: newProgress,
        };
      }
    }
  }

  // =====================================================================
  // AI 메시지 컨텍스트 구성
  // =====================================================================
  let userMessageText: string;

  if (isAnsweringQuiz && quizInstruction) {
    // 퀴즈 답변 판정 모드: 판정 지시어 포함, 퀴즈 문제 suffix 제외
    userMessageText = `${quizInstruction}\n\n사용자 답변: ${message}`;
  } else {
    // 일반 대화 또는 새 퀴즈 출제 모드
    const quizContextSuffix =
      nextStep <= 3 && currentQuiz
        ? `, 퀴즈 문제: "${currentQuiz.question}"`
        : '';
    userMessageText = `[현재 퀴즈 단계: ${nextStep <= 3 ? nextStep : '완료'} / 3${quizContextSuffix}]\n\n${message}`;
  }

  const contents = [
    ...limitedHistory.map((msg) => ({
      role: msg.role as 'user' | 'model',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessageText }],
    },
  ];

  // BUG-03 수정: generateWithContext — 캐시 시도 후 인라인 폴백 내장
  try {
    const rawText = await generateWithContext(
      project as Project,
      { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } },
      project.gemini_model ?? DEFAULT_MODEL
    );

    const { cleanText, quizStep } = extractQuizStep(rawText);

    // BUG-08-02: AI가 QUIZ_STEP 마커를 붙였지만 DB 퀴즈 문제가 응답에 없으면 강제 추가
    let finalText = cleanText;
    if (quizStep !== null && currentQuiz && !cleanText.includes(currentQuiz.question)) {
      finalText = `${cleanText}\n\n${currentQuiz.question}`;
    }

    const response: ChatApiResponse = {
      message: finalText,
      quizStep: quizResult ? null : quizStep,       // 판정 모드에서는 quizStep 전달 안 함
      quizQuestion: (!quizResult && quizStep !== null) ? (currentQuiz?.question ?? null) : null,
      isQuizMode: quizResult ? false : quizStep !== null,
      ...(quizResult ? { quizResult } : {}),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[chat/message] Gemini 오류:', err);
    return NextResponse.json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
