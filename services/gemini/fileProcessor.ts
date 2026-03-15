import { createAdminClient } from '@/lib/supabase/admin';
import type { Part } from './client';

const STORAGE_BUCKET = 'brandbot';

// Supabase Storage에서 브랜드 파일을 다운로드하여 Gemini inline Part로 변환
// PDF: Gemini 멀티모달 직접 입력 (텍스트 추출 불필요)
export async function loadBrandFileAsPart(brandInfoPath: string): Promise<Part> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(brandInfoPath);

  if (error || !data) {
    throw new Error(`브랜드 파일 다운로드 실패: ${error?.message ?? 'unknown'}`);
  }

  const buffer = await data.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = brandInfoPath.endsWith('.pdf') ? 'application/pdf' : 'text/plain';

  return {
    inlineData: { data: base64, mimeType },
  };
}

// 브랜드 파일에서 TXT 텍스트 추출 (퀴즈 생성용)
export async function extractBrandText(brandInfoPath: string): Promise<string | null> {
  if (!brandInfoPath.endsWith('.txt')) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(brandInfoPath);

  if (error || !data) return null;

  return await data.text();
}
