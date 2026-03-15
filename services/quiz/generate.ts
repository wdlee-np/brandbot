import fs from 'fs';
import path from 'path';
import { getOrCreateCache, getModelWithCache } from '@/services/gemini/cache';
import { DEFAULT_MODEL } from '@/services/gemini/client';
import type { Project, Quiz } from '@/types';

interface RawQuiz {
  step: number;
  question: string;
  answer: string;
  hint?: string;
}

// Gemini API로 퀴즈 3개 자동 생성
export async function generateQuizzes(project: Project): Promise<Omit<Quiz, 'id' | 'created_at'>[]> {
  // Context Cache 조회/생성
  const cacheId = await getOrCreateCache(project);
  const model = await getModelWithCache(cacheId, project.gemini_model ?? DEFAULT_MODEL);

  // 퀴즈 생성 프롬프트 로딩
  const promptPath = path.join(process.cwd(), 'ai', 'prompts', 'quiz-generate.txt');
  const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

  // {{brand_info}}는 이미 캐시에 포함되어 있으므로 안내 문구로 치환
  const prompt = promptTemplate.replace(
    /\{\{brand_info\}\}/g,
    '(브랜드 정보는 이미 캐시에 포함되어 있습니다. 위 내용을 기반으로 퀴즈를 생성하세요.)'
  );

  const rawText = (await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  })).trim();

  let parsed: { quizzes?: RawQuiz[] } | RawQuiz[];
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`퀴즈 JSON 파싱 실패: ${rawText.substring(0, 200)}`);
  }

  // { quizzes: [...] } 또는 [...] 두 형식 모두 처리
  const quizzes: RawQuiz[] = Array.isArray(parsed)
    ? parsed
    : (parsed as { quizzes?: RawQuiz[] }).quizzes ?? [];

  if (quizzes.length < 3) {
    throw new Error(`퀴즈가 3개 미만으로 생성되었습니다. (${quizzes.length}개)`);
  }

  // step 1,2,3 할당 + answer 10자 초과 슬라이싱
  return quizzes.slice(0, 3).map((q, i) => {
    const answer = q.answer?.slice(0, 10) ?? '';
    if (q.answer && q.answer.length > 10) {
      console.warn(`[Quiz] step ${i + 1} answer 10자 초과, 슬라이싱: "${q.answer}" → "${answer}"`);
    }
    return {
      project_id: project.id,
      step: (i + 1) as 1 | 2 | 3,
      question: q.question,
      answer,
    };
  });
}
