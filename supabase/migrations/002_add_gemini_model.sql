-- ============================================================
-- 프로젝트에 Gemini 모델 선택 컬럼 추가
-- ============================================================

ALTER TABLE projects
  ADD COLUMN gemini_model TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite-preview'
    CHECK (gemini_model IN (
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-flash',
      'gemini-3.1-pro-preview'
    ));
