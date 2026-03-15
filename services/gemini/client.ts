// Gemini REST API 클라이언트 (generativelanguage.googleapis.com)
// 인증: 쿼리 파라미터 방식 (?key=GEMINI_API_KEY)

import type { GeminiModel } from '@/types';

export type { GeminiModel };

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL: GeminiModel = 'gemini-3.1-flash-lite-preview';

// ── REST API 공통 타입 ──────────────────────────────────────────

export interface Part {
  text?: string;
  inlineData?: { data: string; mimeType: string };
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

export interface GenerateContentRequest {
  contents: Content[];
  systemInstruction?: { parts: Part[] };
  generationConfig?: GenerationConfig;
  cachedContent?: string;
}

// ── 내부 헬퍼 ──────────────────────────────────────────────────

function buildUrl(path: string): string {
  return `${GEMINI_API_BASE}${path}?key=${process.env.GEMINI_API_KEY}`;
}

// ── 공개 API ───────────────────────────────────────────────────

// 단일 생성 호출 — 텍스트 응답 반환
export async function generateContent(
  model: string,
  request: GenerateContentRequest
): Promise<string> {
  const res = await fetch(buildUrl(`/models/${model}:generateContent`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errBody = await res.text();
    const err = new Error(`Gemini API 오류 (${res.status}): ${errBody}`);
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// 5xx / 429 오류 시 gemini-2.5-flash로 자동 fallback
export async function generateWithFallback(
  request: GenerateContentRequest,
  modelId: GeminiModel = DEFAULT_MODEL
): Promise<string> {
  try {
    return await generateContent(modelId, request);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (modelId === DEFAULT_MODEL && (status === undefined || status >= 500 || status === 429)) {
      console.warn(`[Gemini] ${modelId} 오류(${status}), fallback: gemini-2.5-flash`);
      return await generateContent('gemini-2.5-flash', request);
    }
    throw err;
  }
}
