import fs from 'fs';
import path from 'path';
import { generateContent, DEFAULT_MODEL, type Part, type GenerateContentRequest } from './client';
import { loadBrandFileAsPart } from './fileProcessor';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Project } from '@/types';

const MIN_CACHE_TOKENS = 4_096;
const CACHE_TTL_SECONDS = 3_600;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// 문자 수 기반 토큰 추정 (보수적 계산)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3);
}

function estimatePartTokenCount(part: Part): number {
  if ('text' in part && part.text) return estimateTokenCount(part.text);
  if ('inlineData' in part && part.inlineData) {
    return Math.ceil((part.inlineData.data.length * 3) / 4 / 3);
  }
  return 0;
}

// ai/prompts/brand-system.txt 로딩 + 플레이스홀더 치환
export function buildSystemPrompt(project: Project, quizStep = 1, quizQuestion = ''): string {
  const promptPath = path.join(process.cwd(), 'ai', 'prompts', 'brand-system.txt');
  let template = fs.readFileSync(promptPath, 'utf-8');
  const keywords = (project.persona_config?.keywords ?? []).join(', ') || '친근함, 전문성';

  return template
    .replace(/\{\{brand_name\}\}/g, project.brand_name)
    .replace(/\{\{persona_keywords\}\}/g, keywords)
    .replace(/\{\{brand_info\}\}/g, '')
    .replace(/\{\{current_quiz_step\}\}/g, String(quizStep))
    .replace(/\{\{quiz_question\}\}/g, quizQuestion);
}

// few-shot 예제 로딩
function loadFewShotParts(): Part[] {
  const jsonlPath = path.join(process.cwd(), 'ai', 'examples', 'few-shot-base.jsonl');
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter((l) => l.trim());
  const parts: Part[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as { role: string; parts: Array<{ text: string }> };
      if (obj.parts?.[0]?.text) {
        parts.push({ text: `[${obj.role}]: ${obj.parts[0].text}` });
      }
    } catch { /* 파싱 오류 무시 */ }
  }
  return parts;
}

// ── REST API 래퍼 ──────────────────────────────────────────────

function cacheApiUrl(suffix: string): string {
  return `${GEMINI_API_BASE}${suffix}?key=${process.env.GEMINI_API_KEY}`;
}

async function cacheCreate(body: unknown): Promise<{ name: string; expireTime: string }> {
  const res = await fetch(cacheApiUrl('/cachedContents'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cache create failed (${res.status}): ${err}`);
  }
  return res.json();
}

async function cacheGet(name: string): Promise<{ name: string; expireTime: string } | null> {
  const res = await fetch(cacheApiUrl(`/${name}`));
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

async function cachePatch(name: string, ttl: string): Promise<void> {
  await fetch(`${cacheApiUrl(`/${name}`)}&updateMask=ttl`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl }),
  });
}

// ── 캐시 관리 ──────────────────────────────────────────────────

async function validateCache(cacheId: string): Promise<boolean> {
  try {
    const cache = await cacheGet(cacheId);
    if (!cache?.expireTime) return false;
    return new Date(cache.expireTime).getTime() > Date.now() + 5 * 60 * 1000;
  } catch {
    return false;
  }
}

async function createCache(project: Project): Promise<string> {
  const modelId = project.gemini_model ?? DEFAULT_MODEL;
  const systemInstruction = buildSystemPrompt(project);
  const brandFilePart = await loadBrandFileAsPart(project.brand_info_path!);

  let contentParts: Part[] = [brandFilePart];
  let estimatedTokens =
    estimateTokenCount(systemInstruction) + estimatePartTokenCount(brandFilePart);

  if (estimatedTokens < MIN_CACHE_TOKENS) {
    const fewShots = loadFewShotParts();
    contentParts = [...contentParts, ...fewShots];
    estimatedTokens += fewShots.reduce((s, p) => s + estimatePartTokenCount(p), 0);
    if (process.env.NODE_ENV === 'development')
      console.log(`[Cache] few-shot ${fewShots.length}개 보충 (추정 ${estimatedTokens} tokens)`);
  }

  const cache = await cacheCreate({
    model: `models/${modelId}`,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: contentParts }],
    ttl: `${CACHE_TTL_SECONDS}s`,
  });

  const supabase = createAdminClient();
  await supabase.from('projects').update({ context_cache_id: cache.name }).eq('id', project.id);

  if (process.env.NODE_ENV === 'development') console.log(`[Cache] 생성 완료: ${cache.name}`);
  return cache.name;
}

// 캐시 조회 또는 신규 생성 — 실패 시 null 반환 (인라인 폴백용)
async function tryGetOrCreateCache(project: Project): Promise<string | null> {
  if (!project.brand_info_path) return null;
  try {
    if (project.context_cache_id) {
      const valid = await validateCache(project.context_cache_id);
      if (valid) return project.context_cache_id;
    }
    return await createCache(project);
  } catch (err) {
    console.warn('[Cache] 캐시 생성 실패, 인라인 방식으로 전환:',
      err instanceof Error ? err.message : err);
    return null;
  }
}

// 캐시 TTL 갱신
export async function renewCache(cacheId: string): Promise<void> {
  try {
    await cachePatch(cacheId, `${CACHE_TTL_SECONDS}s`);
    if (process.env.NODE_ENV === 'development') console.log(`[Cache] TTL 갱신: ${cacheId}`);
  } catch (err) {
    console.error(`[Cache] TTL 갱신 실패:`, err);
  }
}

// ── 주 진입점 ─────────────────────────────────────────────────
//
// BUG-03 수정: context cache → 인라인 폴백 통합 헬퍼
// - cache 사용 가능 시: cachedContent 파라미터로 호출 (토큰 절감)
// - cache 미지원/실패 시: systemInstruction + 브랜드 파일을 요청에 직접 포함

export async function generateWithContext(
  project: Project,
  request: Omit<GenerateContentRequest, 'systemInstruction' | 'cachedContent'>,
  modelId: string
): Promise<string> {
  // 1. 캐시 시도
  const cacheId = await tryGetOrCreateCache(project);
  if (cacheId) {
    try {
      return await generateContent(modelId, { ...request, cachedContent: cacheId });
    } catch (err) {
      console.warn('[Cache] 캐시 호출 실패, 인라인으로 재시도:', err instanceof Error ? err.message : err);
    }
  }

  // 2. 인라인 폴백: systemInstruction + 브랜드 파일 직접 포함
  const systemInstruction = buildSystemPrompt(project);
  const fullRequest: GenerateContentRequest = {
    ...request,
    systemInstruction: { parts: [{ text: systemInstruction }] },
  };

  if (project.brand_info_path) {
    try {
      const brandPart = await loadBrandFileAsPart(project.brand_info_path);
      // 브랜드 파일을 대화 맨 앞에 컨텍스트로 삽입
      fullRequest.contents = [
        { role: 'user', parts: [brandPart] },
        { role: 'model', parts: [{ text: '브랜드 정보를 확인했습니다.' }] },
        ...request.contents,
      ];
    } catch (err) {
      console.warn('[Cache] 브랜드 파일 로드 실패, 시스템 프롬프트만 사용:', err instanceof Error ? err.message : err);
    }
  }

  return generateContent(modelId, fullRequest);
}

// 하위 호환용 — 기존 코드에서 직접 사용하지 않음
export { buildSystemPrompt as buildSystemPromptBase };
