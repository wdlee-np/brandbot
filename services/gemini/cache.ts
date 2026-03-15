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

function cacheApiUrl(path: string): string {
  return `${GEMINI_API_BASE}${path}?key=${process.env.GEMINI_API_KEY}`;
}

async function cacheCreate(body: unknown): Promise<{ name: string; expireTime: string }> {
  const res = await fetch(
    cacheApiUrl('/cachedContents'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
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
  await fetch(
    `${cacheApiUrl(`/${name}`)}&updateMask=ttl`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    }
  );
}

// ── 캐시 관리 ──────────────────────────────────────────────────

async function validateCache(cacheId: string): Promise<boolean> {
  try {
    const cache = await cacheGet(cacheId);
    if (!cache?.expireTime) return false;
    const expireTime = new Date(cache.expireTime).getTime();
    return expireTime > Date.now() + 5 * 60 * 1000; // 5분 여유
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

  // 4096 토큰 미달 시 few-shot 보충
  if (estimatedTokens < MIN_CACHE_TOKENS) {
    const fewShots = loadFewShotParts();
    contentParts = [...contentParts, ...fewShots];
    estimatedTokens += fewShots.reduce((s, p) => s + estimatePartTokenCount(p), 0);
    if (process.env.NODE_ENV === 'development') console.log(`[Cache] few-shot ${fewShots.length}개 보충 (추정 ${estimatedTokens} tokens)`);
  }

  const body = {
    model: `models/${modelId}`,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: contentParts }],
    ttl: `${CACHE_TTL_SECONDS}s`,
  };

  const cache = await cacheCreate(body);
  const cacheName = cache.name;

  // DB 업데이트
  const supabase = createAdminClient();
  await supabase.from('projects').update({ context_cache_id: cacheName }).eq('id', project.id);

  if (process.env.NODE_ENV === 'development') console.log(`[Cache] 생성 완료: ${cacheName}`);
  return cacheName;
}

// 주 진입점 — 캐시 조회 또는 신규 생성
export async function getOrCreateCache(project: Project): Promise<string> {
  if (project.context_cache_id) {
    const valid = await validateCache(project.context_cache_id);
    if (valid) {
      if (process.env.NODE_ENV === 'development') console.log(`[Cache] 기존 캐시 유효: ${project.context_cache_id}`);
      return project.context_cache_id;
    }
    if (process.env.NODE_ENV === 'development') console.log(`[Cache] 캐시 만료/무효, 재생성`);
  }
  return createCache(project);
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

// 캐시 기반 generateContent 래퍼 반환
export async function getModelWithCache(cacheId: string, modelId: string) {
  const cache = await cacheGet(cacheId);
  if (!cache) throw new Error(`캐시를 찾을 수 없습니다: ${cacheId}`);

  return {
    async generateContent(
      request: Omit<GenerateContentRequest, 'cachedContent'>
    ): Promise<string> {
      return generateContent(modelId, { ...request, cachedContent: cacheId });
    },
  };
}
