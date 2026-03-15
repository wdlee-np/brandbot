-- ============================================================
-- BUG-10-03: answer 최대 길이 10 → 20자
-- ============================================================
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_answer_check;
ALTER TABLE quizzes ADD CONSTRAINT quizzes_answer_check
  CHECK (char_length(answer) <= 20);

-- ============================================================
-- BUG-10-04: step CHECK 제약 제거 (앱 레벨에서 1~5 검증)
-- BUG-10-05: step 임시값(99) 사용을 위해 CHECK 제약 제거 필요
-- ============================================================
ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_step_check;

-- ============================================================
-- BUG-10-04: quiz_progress 범위 0~3 → 0~5
-- ============================================================
ALTER TABLE participants DROP CONSTRAINT IF EXISTS participants_quiz_progress_check;
ALTER TABLE participants ADD CONSTRAINT participants_quiz_progress_check
  CHECK (quiz_progress BETWEEN 0 AND 5);

-- ============================================================
-- gemini_model 컬럼 (초기 스키마 누락 시 추가)
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS
  gemini_model text DEFAULT 'gemini-3.1-flash-lite-preview';
